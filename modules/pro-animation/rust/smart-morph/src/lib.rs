// SPDX-License-Identifier: Apache-2.0
// Thin data transport to the pinned EffectCraft algorithms, no renderer/editor/time runtime.
extern crate self as effectcraft_keyframe;
use std::cell::Cell;
use wasm_bindgen::prelude::*;
#[derive(Clone,Copy,Default)]pub struct FeatherPoint{pub segment:usize}
#[derive(Clone,Default)]pub struct ShapePath{pub vertices:Vec<[f64;2]>,pub in_tangents:Vec<[f64;2]>,pub out_tangents:Vec<[f64;2]>,pub closed:bool,pub feather:Vec<FeatherPoint>}
impl ShapePath{
 pub fn len(&self)->usize{self.vertices.len()}pub fn is_empty(&self)->bool{self.vertices.is_empty()}
 pub fn polygon(points:&[[f64;2]],closed:bool)->Self{Self{vertices:points.to_vec(),in_tangents:vec![[0.;2];points.len()],out_tangents:vec![[0.;2];points.len()],closed,feather:Vec::new()}}
 #[cfg(test)]pub fn rect(c:[f64;2],w:f64,h:f64)->Self{Self::polygon(&[[c[0]-w/2.,c[1]-h/2.],[c[0]+w/2.,c[1]-h/2.],[c[0]+w/2.,c[1]+h/2.],[c[0]-w/2.,c[1]+h/2.]],true)}
 #[cfg(test)]pub fn ellipse(c:[f64;2],w:f64,h:f64)->Self{let k=4.*(2f64.sqrt()-1.)/3.;let(rx,ry)=(w/2.,h/2.);Self{vertices:vec![[c[0]+rx,c[1]],[c[0],c[1]+ry],[c[0]-rx,c[1]],[c[0],c[1]-ry]],in_tangents:vec![[0.,-ry*k],[rx*k,0.],[0.,ry*k],[-rx*k,0.]],out_tangents:vec![[0.,ry*k],[-rx*k,0.],[0.,-ry*k],[rx*k,0.]],closed:true,feather:Vec::new()}}
}
#[path="upstream-interp.rs"]mod upstream;
thread_local!{static LIVE:Cell<u32>=const{Cell::new(0)};}
#[wasm_bindgen]pub fn live_sessions()->u32{LIVE.with(Cell::get)}
fn error(text:impl AsRef<str>)->JsValue{JsValue::from_str(text.as_ref())}
fn finite(n:f64)->Result<f64,JsValue>{if n.is_finite(){Ok(n)}else{Err(error("E_PA_SMART_MORPH_NUMBER: finite Float64 required"))}}
fn count(n:f64)->Result<usize,JsValue>{if n.is_finite()&&n>=0.&&n.fract()==0.&&n<=u32::MAX as f64{Ok(n as usize)}else{Err(error("E_PA_SMART_MORPH_COUNT: unsigned transport count required"))}}
fn options(a:&[f64])->Result<upstream::InterpOpts,JsValue>{
 if a.len()!=8||a.iter().any(|v|!v.is_finite())||![0.,1.].contains(&a[0])||!(0. ..=100.).contains(&a[1])||!(0. ..=100.).contains(&a[2])||![0.,1.,2.].contains(&a[3])||![0.,1.].contains(&a[4])||![0.,1.].contains(&a[5])||![0.,1.,2.,3.].contains(&a[6]){return Err(error("E_PA_SMART_MORPH_OPTIONS: explicit documented interpolation controls required"));}
 Ok(upstream::InterpOpts{linear:a[0]!=0.,bending_resistance:a[1],quality:a[2],matching:match a[3] as u32{1=>upstream::Matching::Curve,2=>upstream::Matching::Polyline,_=>upstream::Matching::Auto},one_to_one:a[4]!=0.,first_vertices_match:a[5]!=0.,add_vertices:None})
}
#[wasm_bindgen]pub struct Engine{pending:ShapePath,inputs:[ShapePath;2],output:Vec<ShapePath>,pair:Option<(ShapePath,ShapePath,upstream::InterpOpts)>,data:Vec<f64>}
impl Drop for Engine{fn drop(&mut self){LIVE.with(|n|n.set(n.get().saturating_sub(1)));}}
#[wasm_bindgen]
impl Engine{
 #[wasm_bindgen(constructor)]pub fn new()->Self{LIVE.with(|n|n.set(n.get()+1));Self{pending:ShapePath::default(),inputs:Default::default(),output:Vec::new(),pair:None,data:Vec::new()}}
 pub fn begin_input(&mut self,closed:bool){self.pending=ShapePath{closed,..Default::default()};}
 pub fn append_input(&mut self,values:&[f64])->Result<(),JsValue>{
  if values.len()%6!=0||values.iter().any(|v|!v.is_finite()){return Err(error("E_PA_SMART_MORPH_INPUT: finite vertex/in/out XY rows required"));}
  let n=values.len()/6;for list in [&mut self.pending.vertices,&mut self.pending.in_tangents,&mut self.pending.out_tangents]{list.try_reserve(n).map_err(|_|error("E_PA_SMART_MORPH_MEMORY: allocation failed"))?;}
  for p in values.chunks_exact(6){self.pending.vertices.push([p[0],p[1]]);self.pending.in_tangents.push([p[2],p[3]]);self.pending.out_tangents.push([p[4],p[5]]);}Ok(())
 }
 pub fn finish_input(&mut self,slot:u32)->Result<(),JsValue>{if slot>1||self.pending.is_empty(){return Err(error("E_PA_SMART_MORPH_INPUT: one nonempty path for slot0/1 required"));}self.inputs[slot as usize]=std::mem::take(&mut self.pending);self.output=Vec::new();self.data=Vec::new();self.pair=None;Ok(())}
 /// Modes0reverse,1rotate,2insert,3polyline,4correspond,5interpolate,
 /// 6shape-contexts,7match-cost,8crossings,9metrics,10adopt frozen pair.
 pub fn resolve(&mut self,mode:u32,value:f64,settings:&[f64],max_vertices:u32)->Result<u32,JsValue>{
  finite(value)?;if self.inputs[0].is_empty(){return Err(error("E_PA_SMART_MORPH_STATE: load source first"));}
  self.output=Vec::new();self.data=Vec::new();let a=&self.inputs[0];
  match mode{
   0=>self.output.push(upstream::reversed(a)),
   1=>{if !a.closed{return Err(error("E_PA_SMART_MORPH_CLOSURE: rotation needs a closed contour"));}self.output.push(upstream::rotate(a,count(value)?%a.len()));}
   2|3=>{let n=count(value)?;if n<a.len()&&mode==2||n<if a.closed{3}else{2}||n>max_vertices as usize{return Err(error("E_GRAPHICS_LIMIT: requested vertices violate geometry/contract output bounds"));}self.output.push(if mode==2{upstream::with_vertex_count(a,n)}else{upstream::polyline(a,n)});}
   4|10=>{
    let b=&self.inputs[1];if b.is_empty()||a.closed!=b.closed{return Err(error("E_PA_SMART_MORPH_TOPOLOGY: nonempty matching closure required"));}
    let mut o=options(settings)?;
    let (ra,rb)=if mode==10{if a.len()!=b.len(){return Err(error("E_PA_SMART_MORPH_TOPOLOGY: frozen correspondence counts differ"));}(a.clone(),b.clone())}else{
     let mut n=a.len().max(b.len());
     if !(o.one_to_one&&a.len()==b.len()){
      let wanted=match settings[6] as u32{0=>n,1=>{if settings[7]<=0.{return Err(error("E_PA_SMART_MORPH_OPTIONS: positive vertex spacing required"));}count((upstream::length(a).max(upstream::length(b))/settings[7]).ceil())?},2=>count(settings[7])?,3=>{if settings[7]<=0.||settings[7]>100.{return Err(error("E_PA_SMART_MORPH_OPTIONS: positive percent<=100 required"));}count((100./settings[7]).ceil())?},_=>unreachable!()};n=n.max(wanted);
     }
     if n>max_vertices as usize{return Err(error("E_GRAPHICS_LIMIT: correspondence exceeds existing PathData command policy"));}
     let curves=match o.matching{upstream::Matching::Curve=>true,upstream::Matching::Polyline=>false,upstream::Matching::Auto=>upstream::has_curves(a)||upstream::has_curves(b)};
     let (pa,pb)=if o.one_to_one&&a.len()==b.len(){(a.clone(),b.clone())}else if curves{(upstream::with_vertex_count(a,n),upstream::with_vertex_count(b,n))}else{(upstream::polyline(a,n),upstream::polyline(b,n))};
     // Preallocate requested counts explicitly, then use original matching. This
     // bypasses upstream's artistic2000 cap without patching its numerical kernel.
     o.one_to_one=true;upstream::correspond(&pa,&pb,&o)
    };
    self.output=vec![ra.clone(),rb.clone()];self.pair=Some((ra,rb,o));
   }
   5=>{let(a,b,o)=self.pair.as_ref().ok_or_else(||error("E_PA_SMART_MORPH_STATE: prepare/adopt correspondence first"))?;self.output.push(if value==0.{a.clone()}else if value==1.{b.clone()}else{upstream::interpolate(a,b,value,o)});}
   6=>{self.data=upstream::shape_contexts(&a.vertices).iter().flat_map(|v|v.iter().copied()).collect();}
   7|8=>{let b=&self.inputs[1];if a.len()!=b.len()||b.is_empty(){return Err(error("E_PA_SMART_MORPH_TOPOLOGY: equal correspondence required"));}
    self.data.push(if mode==8{upstream::paths_cross(a,b) as f64}else{let use_sc=value!=0.;let sa=use_sc.then(||upstream::shape_contexts(&a.vertices));let sb=use_sc.then(||upstream::shape_contexts(&b.vertices));upstream::cost(&a.vertices,&b.vertices,sa.as_deref(),sb.as_deref(),0)});
   }
   9=>{let(c,r)=upstream::frame(&a.vertices);self.data=vec![a.len() as f64,u8::from(a.closed) as f64,upstream::length(a),upstream::signed_area(&a.vertices),c[0],c[1],r];}
   _=>return Err(error("E_PA_SMART_MORPH_OPERATION: unknown operation"))
  }
  for path in &self.output{if path.vertices.iter().chain(&path.in_tangents).chain(&path.out_tangents).flatten().any(|v|!v.is_finite()){return Err(error("E_PA_SMART_MORPH_PRECISION: output outside finite Float64"));}}
  if self.data.iter().any(|v|!v.is_finite()){return Err(error("E_PA_SMART_MORPH_PRECISION: diagnostic outside finite Float64"));}Ok(self.output.len() as u32)
 }
 pub fn output_info(&self,index:u32)->Result<Vec<f64>,JsValue>{let p=self.output.get(index as usize).ok_or_else(||error("E_PA_SMART_MORPH_RANGE: output index"))?;Ok(vec![p.len() as f64,u8::from(p.closed) as f64])}
 pub fn read_output(&self,index:u32,start:u32,count:u32)->Result<Vec<f64>,JsValue>{let p=self.output.get(index as usize).ok_or_else(||error("E_PA_SMART_MORPH_RANGE: output index"))?;let end=(start as usize).checked_add(count as usize).ok_or_else(||error("E_PA_SMART_MORPH_RANGE: overflow"))?;if end>p.len(){return Err(error("E_PA_SMART_MORPH_RANGE: output vertices"));}let mut out=Vec::new();for i in start as usize..end{out.extend(p.vertices[i]);out.extend(p.in_tangents[i]);out.extend(p.out_tangents[i]);}Ok(out)}
 pub fn data_len(&self)->u32{self.data.len() as u32}
 pub fn read_data(&self,start:u32,count:u32)->Result<Vec<f64>,JsValue>{let end=(start as usize).checked_add(count as usize).ok_or_else(||error("E_PA_SMART_MORPH_RANGE: overflow"))?;self.data.get(start as usize..end).map(|v|v.to_vec()).ok_or_else(||error("E_PA_SMART_MORPH_RANGE: diagnostics"))}
 pub fn reset_results(&mut self){self.output=Vec::new();self.data=Vec::new();}
 pub fn clear(&mut self){self.pending=ShapePath::default();self.inputs=Default::default();self.output=Vec::new();self.data=Vec::new();self.pair=None;}
}
