// SPDX-License-Identifier: Apache-2.0
// Exact existing owned shaper and metadata implementation, with original read-fonts/Skrifa queries.
include!("original-font-metadata.rs");
use skrifa::raw::{TableProvider,ReadError,types::Tag,tables::{layout::{ScriptList,FeatureList,LangSys,DeviceOrVariationIndex},gdef::CaretValue,variations::DeltaSetIndex}};
fn ot_error(e:impl std::fmt::Debug)->JsValue{error(&format!("E_PA_OPENTYPE_TABLE: {:?}",e))}
fn tag_number(tag:Tag)->u32{u32::from_be_bytes(tag.to_be_bytes())}
fn lang_json(tag:Option<Tag>,sys:LangSys<'_>)->String{
 format!("{{\"tag\":{},\"required\":{},\"features\":{:?}}}",tag.map_or("null".to_string(),|t|tag_number(t).to_string()),sys.required_feature_index(),sys.feature_indices().iter().map(|v|v.get()).collect::<Vec<_>>())
}
fn catalog_json(scripts:ScriptList<'_>,features:FeatureList<'_>)->Result<String,ReadError>{
 let mut fs=Vec::new();for (index,r) in features.feature_records().iter().enumerate(){let f=r.feature(features.offset_data())?;if f.lookup_list_indices().len()!=f.lookup_index_count() as usize{return Err(ReadError::OutOfBounds);}
 fs.push(format!("{{\"index\":{},\"tag\":{},\"lookups\":{:?}}}",index,tag_number(r.feature_tag()),f.lookup_list_indices().iter().map(|v|v.get()).collect::<Vec<_>>()));}
 let mut ss=Vec::new();for r in scripts.script_records(){let s=r.script(scripts.offset_data())?;let mut languages=Vec::new();if let Some(v)=s.default_lang_sys(){languages.push(lang_json(None,v?));}for l in s.lang_sys_records(){languages.push(lang_json(Some(l.lang_sys_tag()),l.lang_sys(s.offset_data())?));}ss.push(format!("{{\"tag\":{},\"languages\":[{}]}}",tag_number(r.script_tag()),languages.join(",")));}
 Ok(format!("{{\"features\":[{}],\"scripts\":[{}]}}",fs.join(","),ss.join(",")))
}
#[wasm_bindgen]
impl Engine{
 pub fn opentype_layout(&self,table:u32)->Result<String,JsValue>{
 let font=self.metadata_font()?;let tag=match table{0=>Tag::new(b"GSUB"),1=>Tag::new(b"GPOS"),_=>return Err(error("E_PA_OPENTYPE_TABLE: GSUB/GPOS required"))};if font.table_data(tag).is_none(){return Ok("null".into());}
 if table==0{let t=font.gsub().map_err(ot_error)?;catalog_json(t.script_list().map_err(ot_error)?,t.feature_list().map_err(ot_error)?).map_err(ot_error)}else{let t=font.gpos().map_err(ot_error)?;catalog_json(t.script_list().map_err(ot_error)?,t.feature_list().map_err(ot_error)?).map_err(ot_error)}
 }
 /// Per glyph: id, GDEF present, glyph class, mark attachment class, point count, actual contour-point indices.
 pub fn glyph_definitions(&self,ids:&[u32])->Result<Vec<f64>,JsValue>{
 let font=self.metadata_font()?;let count=font.maxp().map_err(ot_error)?.num_glyphs() as u32;let gd=if font.table_data(Tag::new(b"GDEF")).is_some(){Some(font.gdef().map_err(ot_error)?)}else{None};
 let classes=gd.as_ref().and_then(|g|g.glyph_class_def()).transpose().map_err(ot_error)?;let marks=gd.as_ref().and_then(|g|g.mark_attach_class_def()).transpose().map_err(ot_error)?;let attach=gd.as_ref().and_then(|g|g.attach_list()).transpose().map_err(ot_error)?;let mut out=vec![1.,ids.len() as f64];
 for &id in ids{if id>=count{return Err(error("E_PA_OPENTYPE_GLYPH: outside font"));}let glyph=GlyphId::new(id);let mut points=Vec::new();if let Some(a)=&attach{if let Some(index)=a.coverage().map_err(ot_error)?.get(glyph){let p=a.attach_points().get(index as usize).map_err(ot_error)?;points.extend(p.point_indices().iter().map(|n|n.get() as f64));}}
 out.extend([id as f64,u8::from(gd.is_some()) as f64,classes.as_ref().map_or(0,|c|c.get(glyph)) as f64,marks.as_ref().map_or(0,|c|c.get(glyph)) as f64,points.len() as f64]);out.extend(points);
 }Ok(out)
 }
 /// Unhinted, design-unit results. Device correction stays separate in pixels, requires integer ppem>0.
 /// Status:0 resolved,1 point/no glyf unavailable,2 invalid point,3 device needs ppem.
 pub fn ligature_carets(&self,ids:&[u32],vertical:bool,ppem:u32)->Result<Vec<f64>,JsValue>{
 if ppem>65535{return Err(error("E_PA_OPENTYPE_PPEM: integer0..65535 required"));}
 let font=self.metadata_font()?;let count=font.maxp().map_err(ot_error)?.num_glyphs() as u32;let gd=if font.table_data(Tag::new(b"GDEF")).is_some(){Some(font.gdef().map_err(ot_error)?)}else{None};let list=gd.as_ref().and_then(|g|g.lig_caret_list()).transpose().map_err(ot_error)?;let coords=self.font.as_ref().unwrap().normalized_coords();let outlines=font.outline_glyphs();let mut out=vec![1.,ids.len() as f64];
 for &id in ids{if id>=count{return Err(error("E_PA_OPENTYPE_GLYPH: outside font"));}let glyph=GlyphId::new(id);let lig=match &list{Some(l)=>match l.coverage().map_err(ot_error)?.get(glyph){Some(index)=>Some(l.lig_glyphs().get(index as usize).map_err(ot_error)?),None=>None},None=>None};out.extend([id as f64,u8::from(gd.is_some()) as f64,lig.as_ref().map_or(0,|g|g.caret_count()) as f64]);
 if let Some(lig)=lig{for value in lig.caret_values().iter(){let value=value.map_err(ot_error)?;let format=value.caret_value_format();let (mut status,mut coordinate,mut pixel,mut point)=(0.,0.,0.,-1.);
 match value{CaretValue::Format1(v)=>coordinate=v.coordinate() as f64,
 CaretValue::Format2(v)=>{let index=v.caret_value_point_index() as usize;point=index as f64;let result=outlines.get(glyph).and_then(|o|o.with_scaled_glyf_outline(Size::unscaled(),LocationRef::new(coords),None,|p|Ok(p.points.get(index).map(|p|if vertical{p.y.to_f64()}else{p.x.to_f64()}))).ok());match result{Some(Some(p))=>coordinate=p,Some(None)=>status=2.,None=>status=1.}},
 CaretValue::Format3(v)=>{coordinate=v.coordinate() as f64;if v.device_offset().to_u32()!=0{match v.device().map_err(ot_error)?{DeviceOrVariationIndex::Device(d)=>{if ppem==0{status=3.;}else{pixel=d.delta_for_ppem(ppem as u16) as f64;}},DeviceOrVariationIndex::VariationIndex(v)=>{let store=gd.as_ref().unwrap().item_var_store().ok_or_else(||error("E_PA_OPENTYPE_VARIATION: missing GDEF store"))?.map_err(ot_error)?;let delta=store.compute_delta(DeltaSetIndex{outer:v.delta_set_outer_index(),inner:v.delta_set_inner_index()},coords).ok_or_else(||error("E_PA_OPENTYPE_VARIATION: invalid variation index"))?;coordinate+=delta.to_f64();}}}}
 }out.extend([format as f64,status,coordinate,pixel,point]);}}
 }Ok(out)
 }
}
