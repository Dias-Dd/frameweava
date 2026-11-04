// SPDX-License-Identifier: Apache-2.0
// Reuse the exact existing HarfRust/Skrifa adapter; append only metadata transport.
include!("original-shaper.rs");
impl Engine{
 fn metadata_font(&self)->Result<FontRef<'_>,JsValue>{
  let font=self.font.as_ref().ok_or_else(||error("E_PA_FONT_STATE: font not loaded"))?;
  match font.source(){harfrust::font::Source::Blob(blob)=>FontRef::from_index(blob,self.face_index).map_err(|_|error("E_PA_FONT_PARSE: SFNT face required")),_=>Err(error("E_PA_FONT_PARSE: byte-backed SFNT required"))}
 }
}
fn optional(out:&mut Vec<f64>,v:Option<f32>){out.extend([u8::from(v.is_some()) as f64,v.unwrap_or_default() as f64]);}
fn scalar(point:u32)->Result<(),JsValue>{char::from_u32(point).map(|_|()).ok_or_else(||error("E_PA_FONT_SCALAR: Unicode scalar required"))}
#[wasm_bindgen]
impl Engine{
 /// Original Skrifa global metrics, unscaled font units, immutable current instance.
 pub fn font_metrics(&self)->Result<Vec<f64>,JsValue>{
  let font=self.metadata_font()?;let coords=self.font.as_ref().unwrap().normalized_coords();
  let m=font.metrics(Size::unscaled(),LocationRef::new(coords));
  let mut out=vec![1.,m.units_per_em as f64,m.glyph_count as f64,u8::from(m.is_monospace) as f64,m.italic_angle as f64,m.ascent as f64,m.descent as f64,m.leading as f64];
  for v in [m.cap_height,m.x_height,m.average_width,m.max_width]{optional(&mut out,v);}
  for decoration in [m.underline,m.strikeout]{out.extend([u8::from(decoration.is_some()) as f64,decoration.map_or(0.,|v|v.offset as f64),decoration.map_or(0.,|v|v.thickness as f64)]);}
  out.push(u8::from(m.bounds.is_some()) as f64);let b=m.bounds.unwrap_or_default();out.extend([b.x_min as f64,b.y_min as f64,b.x_max as f64,b.y_max as f64]);Ok(out)
 }
 /// Packed OpenType tags plus original axis order/range/default/hidden.
 pub fn font_axes(&self)->Result<Vec<f64>,JsValue>{
  let font=self.metadata_font()?;let axes=font.axes();let mut out=vec![1.,axes.len() as f64];
  for a in axes.iter(){out.extend([u32::from_be_bytes(a.tag().to_be_bytes()) as f64,a.index() as f64,a.min_value() as f64,a.default_value() as f64,a.max_value() as f64,u8::from(a.is_hidden()) as f64]);}Ok(out)
 }
 /// Canonical nominal cmap only; no claim this replaces shaping.
 pub fn map_codepoints(&self,points:&[u32])->Result<Vec<f64>,JsValue>{
  let font=self.metadata_font()?;let map=font.charmap();let mut out=Vec::new();
  for &point in points{scalar(point)?;let glyph=map.map(point).map(|g|g.to_u32()).filter(|g|*g!=0);out.extend([point as f64,u8::from(glyph.is_some()) as f64,glyph.unwrap_or_default() as f64]);}Ok(out)
 }
 /// Status:0 absent sequence,1 use-default mapping,2 explicit variant mapping.
 pub fn map_variants(&self,pairs:&[u32])->Result<Vec<f64>,JsValue>{
  if pairs.len()%2!=0{return Err(error("E_PA_FONT_VARIANT: codepoint/selector pairs required"));}
  let font=self.metadata_font()?;let map=font.charmap();let mut out=Vec::new();
  for pair in pairs.chunks_exact(2){let ch=pair[0];let vs=pair[1];scalar(ch)?;if !(0xfe00..=0xfe0f).contains(&vs)&&!(0xe0100..=0xe01ef).contains(&vs){return Err(error("E_PA_FONT_VARIANT: Unicode variation selector required"));}
   let (status,glyph)=match map.map_variant(ch,vs){None=>(0,0),Some(skrifa::charmap::MapVariant::UseDefault)=>(1,map.map(ch).map_or(0,|g|g.to_u32())),Some(skrifa::charmap::MapVariant::Variant(g))=>(2,g.to_u32())};
   out.extend([ch as f64,vs as f64,status as f64,glyph as f64]);
  }Ok(out)
 }
 /// Original unhinted metrics/control bounds; not tight rendered-ink certification.
 pub fn glyph_metrics(&self,glyphs:&[u32])->Result<Vec<f64>,JsValue>{
  let font=self.metadata_font()?;let coords=self.font.as_ref().unwrap().normalized_coords();let metrics=font.glyph_metrics(Size::unscaled(),LocationRef::new(coords));let count=font.metrics(Size::unscaled(),LocationRef::new(coords)).glyph_count;let mut out=Vec::new();
  for &id in glyphs{if id>=count{return Err(error("E_PA_FONT_GLYPH: glyph outside font"));}
   let glyph=GlyphId::new(id);out.push(id as f64);optional(&mut out,metrics.advance_width(glyph));optional(&mut out,metrics.left_side_bearing(glyph));let bounds=metrics.bounds(glyph);out.push(u8::from(bounds.is_some()) as f64);let b=bounds.unwrap_or_default();out.extend([b.x_min as f64,b.y_min as f64,b.x_max as f64,b.y_max as f64]);
  }Ok(out)
 }
 /// Strict design-space settings -> original AVAR-aware normalized location.
 /// This does NOT mutate the shaping instance or earlier glyph results.
 pub fn resolve_location(&self,settings:&str)->Result<Vec<f64>,JsValue>{
  let font=self.metadata_font()?;let axes=font.axes();let mut values:Vec<(&str,f32)>=Vec::new();
  if !settings.is_empty(){for setting in settings.split(','){
   let (tag,value)=setting.split_once('=').ok_or_else(||error("E_PA_FONT_VARIATION: expected tag=value"))?;
   if tag.len()!=4||!tag.is_ascii(){return Err(error("E_PA_FONT_VARIATION: four ASCII tag bytes required"));}
   let v:f32=value.parse().map_err(|_|error("E_PA_FONT_VARIATION: finite value required"))?;
   let axis=axes.iter().find(|a|a.tag().to_be_bytes()==tag.as_bytes()).ok_or_else(||error("E_PA_FONT_VARIATION: unknown font axis"))?;
   if !v.is_finite()||v<axis.min_value()||v>axis.max_value()||values.iter().any(|(previous,_)|*previous==tag){return Err(error("E_PA_FONT_VARIATION: duplicate or outside axis range"));}
   values.push((tag,v));
  }}
  let location=axes.location(values);Ok(location.coords().iter().map(|v|v.to_f32() as f64).collect())
 }
}
