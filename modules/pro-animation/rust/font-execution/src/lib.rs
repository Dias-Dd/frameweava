// SPDX-License-Identifier: Apache-2.0
// Same owned HarfRust/Skrifa Engine; only original-library execution/paint callbacks are transported.
include!("original-font-metadata.rs");
use skrifa::color::{Brush,ColorPainter,ColorStop,CompositeMode,Extend,Transform,ColorGlyphFormat};
use skrifa::raw::types::BoundingBox;
#[derive(Default)]
struct PaintTransport(Vec<f64>);
impl PaintTransport {
 fn stops(&mut self,stops:&[ColorStop],extend:Extend){self.0.extend([extend as u8 as f64,stops.len() as f64]);for s in stops{self.0.extend([s.offset as f64,s.palette_index as f64,s.alpha as f64]);}}
}
impl ColorPainter for PaintTransport {
 fn push_transform(&mut self,t:Transform){self.0.extend([1.,t.xx as f64,t.yx as f64,t.xy as f64,t.yy as f64,t.dx as f64,t.dy as f64]);}
 fn pop_transform(&mut self){self.0.push(2.);}
 fn push_clip_glyph(&mut self,g:GlyphId){self.0.extend([3.,g.to_u32() as f64]);}
 fn push_clip_box(&mut self,b:BoundingBox<f32>){self.0.extend([4.,b.x_min as f64,b.y_min as f64,b.x_max as f64,b.y_max as f64]);}
 fn pop_clip(&mut self){self.0.push(5.);}
 fn fill(&mut self,brush:Brush<'_>){match brush{
  Brush::Solid{palette_index,alpha}=>self.0.extend([6.,palette_index as f64,alpha as f64]),
  Brush::LinearGradient{p0,p1,color_stops,extend}=>{self.0.extend([7.,p0.x as f64,p0.y as f64,p1.x as f64,p1.y as f64]);self.stops(color_stops,extend);},
  Brush::RadialGradient{c0,r0,c1,r1,color_stops,extend}=>{self.0.extend([8.,c0.x as f64,c0.y as f64,r0 as f64,c1.x as f64,c1.y as f64,r1 as f64]);self.stops(color_stops,extend);},
  Brush::SweepGradient{c0,start_angle,end_angle,color_stops,extend}=>{self.0.extend([9.,c0.x as f64,c0.y as f64,start_angle as f64,end_angle as f64]);self.stops(color_stops,extend);},
 }}
 fn push_layer(&mut self,m:CompositeMode){self.0.extend([10.,m as u8 as f64]);}
 fn pop_layer(&mut self){self.0.push(11.);}
}
#[wasm_bindgen]
impl Engine {
 /// Original HarfRust direction + joining context. Run clusters remain local UTF16 offsets.
 /// 0 LTR, 1 RTL, 2 TTB, 3 BTT; direction is never disguised as paragraph bidi.
 pub fn shape_run_context(&mut self,text:&str,direction:u32,script:&str,language:&str,features:&str,before:&str,after:&str)->Result<u32,JsValue>{
  self.glyphs=Vec::new();self.outline=Vec::new();
  let font=self.font.as_ref().ok_or_else(||error("E_PA_FONT_STATE: font not loaded"))?;
  let direction=match direction{0=>Direction::LeftToRight,1=>Direction::RightToLeft,2=>Direction::TopToBottom,3=>Direction::BottomToTop,_=>return Err(error("E_PA_FONT_DIRECTION: explicit original-library direction required"))};
  if script.len()!=4||!script.bytes().all(|b|b.is_ascii_alphabetic()){return Err(error("E_PA_FONT_SCRIPT: four-letter ISO15924 tag required"));}
  let script=Script::from_str(script).map_err(|_|error("E_PA_FONT_SCRIPT: invalid script"))?;
  let language=Language::new(language).ok_or_else(||error("E_PA_FONT_LANGUAGE: explicit language required"))?;
  let mut parsed=Vec::new();if !features.is_empty(){for item in features.split(','){parsed.push(Feature::from_str(item).map_err(|_|error("E_PA_FONT_FEATURE: invalid OpenType setting"))?);}}
  let mut buffer=Buffer::new();buffer.set_direction(direction);buffer.set_script(Some(script));buffer.set_language(Some(language));buffer.set_pre_context(before);buffer.set_post_context(after);
  let mut cluster=0_u32;for ch in text.chars(){buffer.push(ch as u32,cluster);cluster=cluster.checked_add(ch.len_utf16() as u32).ok_or_else(||error("E_PA_FONT_RANGE: UTF16 range overflow"))?;}
  harfrust::shape(&ShaperFont::new(font),&mut buffer,ShapeOptions::new().features(&parsed)).map_err(|e|error(format!("E_PA_FONT_SHAPE: {e:?}")))?;
  let count=buffer.glyph_infos().len();self.glyphs.try_reserve(count.checked_mul(6).ok_or_else(||error("E_PA_FONT_MEMORY: glyph count overflow"))?).map_err(|_|error("E_PA_FONT_MEMORY: glyph allocation failed"))?;
  for(info,pos)in buffer.glyph_infos().iter().zip(buffer.glyph_positions()){self.glyphs.extend([info.glyph_id as f64,info.cluster as f64,pos.x_advance as f64,pos.y_advance as f64,pos.x_offset as f64,pos.y_offset as f64]);}
  u32::try_from(count).map_err(|_|error("E_PA_FONT_RANGE: glyph count exceeds transport index"))
 }
 /// Original Skrifa COLRv0/v1 traversal, with its cycle/depth guards intact. No pixel rasterization.
 /// Version 1 header + format (-1 means no COLR), followed by ColorPainter events.
 pub fn color_glyph_paint(&self,glyph:u32)->Result<Vec<f64>,JsValue>{
  let font=self.metadata_font()?;if glyph>=self.font.as_ref().unwrap().num_glyphs(){return Err(error("E_PA_FONT_GLYPH: glyph index outside loaded face"));}
  let Some(g)=font.color_glyphs().get(GlyphId::new(glyph))else{return Ok(vec![1.,-1.]);};
  let mut transport=PaintTransport(vec![1.,match g.format(){ColorGlyphFormat::ColrV0=>0.,ColorGlyphFormat::ColrV1=>1.}]);
  g.paint(LocationRef::new(self.font.as_ref().unwrap().normalized_coords()),&mut transport).map_err(|e|error(format!("E_PA_FONT_COLOR: {e}")))?;Ok(transport.0)
 }
 /// Original CPAL entries, source sRGB straight RGBA bytes. Conversion/composition is explicit downstream.
 pub fn color_palette(&self,index:u32)->Result<Vec<f64>,JsValue>{
  let i=u16::try_from(index).map_err(|_|error("E_PA_FONT_PALETTE: unsigned16 index required"))?;let font=self.metadata_font()?;let palettes=font.color_palettes();let Some(p)=palettes.get(i)else{return Err(error("E_PA_FONT_PALETTE: palette index outside declared table"));};
  let mut out=vec![1.,palettes.len() as f64,index as f64,p.colors().len() as f64];for c in p.colors(){out.extend([c.red() as f64,c.green() as f64,c.blue() as f64,c.alpha() as f64]);}Ok(out)
 }
}

// Embedded source observation only. Core must authenticate the parent Resource and rederive selectors;
// these byte results are not permission to import author-supplied pixels or offsets into a GPU owner.
use skrifa::bitmap::{BitmapData,BitmapFormat,BitmapStrikes,Origin};
use skrifa::raw::TableProvider;
impl Engine {
 fn embedded_bitmap(&self,glyph:u32,format:u32,strike:u32)->Result<skrifa::bitmap::BitmapGlyph<'_>,JsValue>{
  let font=self.metadata_font()?;if glyph>=self.font.as_ref().unwrap().num_glyphs(){return Err(error("E_PA_FONT_GLYPH: glyph index outside loaded face"));}
  let f=match format{0=>BitmapFormat::Sbix,1=>BitmapFormat::Cbdt,2=>BitmapFormat::Ebdt,_=>return Err(error("E_PA_FONT_EMBEDDED: explicit bitmap table format required"))};
  let strikes=BitmapStrikes::with_format(&font,f).ok_or_else(||error("E_PA_FONT_EMBEDDED: requested bitmap table absent or malformed"))?;
  strikes.get(strike as usize).ok_or_else(||error("E_PA_FONT_EMBEDDED: strike index outside declared table"))?.get(GlyphId::new(glyph)).ok_or_else(||error("E_PA_FONT_EMBEDDED: glyph absent or unsupported in selected strike"))
 }
 fn embedded_svg(&self,glyph:u32)->Result<(u32,u32,u32,&[u8]),JsValue>{
  let font=self.metadata_font()?;if glyph>=self.font.as_ref().unwrap().num_glyphs(){return Err(error("E_PA_FONT_GLYPH: glyph index outside loaded face"));}
  let table=font.svg().map_err(|_|error("E_PA_FONT_EMBEDDED: SVG table absent or malformed"))?;let list=table.svg_document_list().map_err(|_|error("E_PA_FONT_EMBEDDED: malformed SVG document list"))?;
  let mut previous=None;let mut found=None;
  for(index,r)in list.document_records().iter().enumerate(){let start=r.start_glyph_id().to_u32();let end=r.end_glyph_id().to_u32();if start>end||previous.is_some_and(|v|v>=start){return Err(error("E_PA_FONT_EMBEDDED: unordered/overlapping SVG document ranges"));}previous=Some(end);if start<=glyph&&glyph<=end{found=Some((index as u32,start,end));}}
  let(index,start,end)=found.ok_or_else(||error("E_PA_FONT_EMBEDDED: no SVG document covers this glyph"))?;let data=table.glyph_data(GlyphId::new(glyph)).ok_or_else(||error("E_PA_FONT_EMBEDDED: SVG document bounds invalid"))?;Ok((index,start,end,data))
 }
}
#[wasm_bindgen]
impl Engine {
 /// Exact strikes, not implicit nearest-size selection. Format: 0 sbix, 1 CBDT/CBLC, 2 EBDT/EBLC.
 pub fn font_bitmap_strikes(&self,format:u32)->Result<Vec<f64>,JsValue>{
  let font=self.metadata_font()?;let f=match format{0=>BitmapFormat::Sbix,1=>BitmapFormat::Cbdt,2=>BitmapFormat::Ebdt,_=>return Err(error("E_PA_FONT_EMBEDDED: explicit bitmap table format required"))};
  let Some(strikes)=BitmapStrikes::with_format(&font,f)else{return Ok(vec![1.,0.]);};let mut out=vec![1.,strikes.len() as f64];for(index,strike)in strikes.iter().enumerate(){out.extend([index as f64,strike.ppem() as f64]);}Ok(out)
 }
 /// Schema1. SVG: [1,3,recordIndex,startGlyph,endGlyph,bytes,gzip].
 /// Bitmap: [1,format,strike,glyph,w,h,ppemX,ppemY,bearingX,bearingY,innerX,innerY,
 /// advancePresent,advance,origin(0 top-left/1 bottom-left),encoding(0 png/1 bgra/2 mask),bpp,packed,bytes].
 pub fn font_embedded_metadata(&self,glyph:u32,format:u32,strike:u32)->Result<Vec<f64>,JsValue>{
  if format==3{if strike!=0{return Err(error("E_PA_FONT_EMBEDDED: SVG has no bitmap strike"));}let(index,start,end,data)=self.embedded_svg(glyph)?;return Ok(vec![1.,3.,index as f64,start as f64,end as f64,data.len() as f64,u8::from(data.starts_with(&[0x1f,0x8b])) as f64]);}
  let g=self.embedded_bitmap(glyph,format,strike)?;let(encoding,bpp,packed,len)=match &g.data{BitmapData::Png(data)=>(0,0,false,data.len()),BitmapData::Bgra(data)=>(1,32,false,data.len()),BitmapData::Mask(m)=>(2,m.bpp,m.is_packed,m.data.len())};
  Ok(vec![1.,format as f64,strike as f64,glyph as f64,g.width as f64,g.height as f64,g.ppem_x as f64,g.ppem_y as f64,g.bearing_x as f64,g.bearing_y as f64,g.inner_bearing_x as f64,g.inner_bearing_y as f64,u8::from(g.advance.is_some()) as f64,g.advance.unwrap_or_default() as f64,match g.placement_origin{Origin::TopLeft=>0.,Origin::BottomLeft=>1.},encoding as f64,bpp as f64,u8::from(packed) as f64,len as f64])
 }
 /// Encoded/packed original subresource bytes only, selected from the owned SFNT by glyph/format/strike.
 /// Caller-supplied offsets, URLs, filesystem paths and compressed-document decoding are not accepted.
 pub fn font_embedded_bytes(&self,glyph:u32,format:u32,strike:u32)->Result<Vec<u8>,JsValue>{
  if format==3{if strike!=0{return Err(error("E_PA_FONT_EMBEDDED: SVG has no bitmap strike"));}return Ok(self.embedded_svg(glyph)?.3.to_vec());}
  let g=self.embedded_bitmap(glyph,format,strike)?;Ok(match g.data{BitmapData::Png(d)|BitmapData::Bgra(d)=>d.to_vec(),BitmapData::Mask(m)=>m.data.to_vec()})
 }
}
