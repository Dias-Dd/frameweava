// SPDX-License-Identifier: Apache-2.0
// Existing Kit data binding only. Original EffectCraft/kurbo geometry is in geometry/algorithm.
pub mod geometry;
use std::cell::Cell;
use kurbo::{BezPath,PathEl,Point};
use wasm_bindgen::prelude::*;
thread_local!{static LIVE:Cell<u32>=const{Cell::new(0)};}
#[wasm_bindgen]pub fn live_sessions()->u32{LIVE.with(Cell::get)}
fn error(message:&str)->JsValue{JsValue::from_str(message)}
#[wasm_bindgen]
pub struct Engine {input:BezPath,output:Vec<f64>,started:bool,active:bool,ready:bool,commands:usize,preserved:usize}
impl Drop for Engine{fn drop(&mut self){LIVE.with(|v|v.set(v.get().saturating_sub(1)));}}
#[wasm_bindgen]
impl Engine{
 #[wasm_bindgen(constructor)]pub fn new()->Self{LIVE.with(|v|v.set(v.get()+1));Self{input:BezPath::new(),output:Vec::new(),started:false,active:false,ready:false,commands:0,preserved:0}}
 pub fn begin(&mut self){self.reset();self.started=true;}
 pub fn append(&mut self,values:&[f64])->Result<(),JsValue>{
  if !self.started{return Err(error("E_PA_ZIGZAG_STATE: begin before append"));}let mut at=0;let mut active=self.active;let mut parsed=Vec::new();
  while at<values.len(){
   let size=match values[at]{1.0|2.0=>3,3.0=>5,4.0=>7,5.0=>1,_=>return Err(error("E_PA_ZIGZAG_INPUT: unknown command"))};let row=values.get(at..at+size).ok_or_else(||error("E_PA_ZIGZAG_INPUT: truncated command"))?;
   if row.iter().any(|n|!n.is_finite()){return Err(error("E_PA_ZIGZAG_INPUT: nonfinite coordinate"));}if row[0]!=1.&&!active{return Err(error("E_PA_ZIGZAG_INPUT: MoveTo required"));}let p=|i|Point::new(row[i],row[i+1]);
   parsed.push(match row[0]{1.=>{active=true;PathEl::MoveTo(p(1))},2.=>PathEl::LineTo(p(1)),3.=>PathEl::QuadTo(p(1),p(3)),4.=>PathEl::CurveTo(p(1),p(3),p(5)),_=>{active=false;PathEl::ClosePath}});at+=size;
  }
  self.input.extend(parsed);self.active=active;Ok(())
 }
 pub fn zigzag(&mut self,size:f64,ridges:f64,smooth:bool,accuracy:f64,max_commands:u32)->Result<u32,JsValue>{
  self.output=Vec::new();self.ready=false;self.commands=0;self.preserved=0;
  if !self.started||self.input.elements().is_empty(){return Err(error("E_PA_ZIGZAG_STATE: nonempty begun path required"));}
  if max_commands==0{return Err(error("E_PA_ZIGZAG_BUDGET: explicit canonical output budget required"));}
  let result=geometry::zigzag_paths(std::slice::from_ref(&self.input),geometry::Settings{size,ridges,smooth,accuracy,max_output_commands:Some(max_commands as usize)}).map_err(|e|error(&e))?;
  let capacity=result.commands.checked_mul(7).ok_or_else(||error("E_PA_ZIGZAG_RANGE: serialized count overflow"))?;let mut output=Vec::new();output.try_reserve(capacity).map_err(|_|error("E_PA_ZIGZAG_MEMORY: output allocation failed"))?;
  for p in &result.paths{for el in p.elements(){match el{PathEl::MoveTo(p)=>output.extend([1.,p.x,p.y]),PathEl::LineTo(p)=>output.extend([2.,p.x,p.y]),PathEl::QuadTo(a,b)=>output.extend([3.,a.x,a.y,b.x,b.y]),PathEl::CurveTo(a,b,c)=>output.extend([4.,a.x,a.y,b.x,b.y,c.x,c.y]),PathEl::ClosePath=>output.push(5.)}}}
  let count=u32::try_from(result.commands).map_err(|_|error("E_PA_ZIGZAG_RANGE: command count exceeds transport"))?;u32::try_from(output.len()).map_err(|_|error("E_PA_ZIGZAG_RANGE: serialized count exceeds transport"))?;
  self.output=output;self.commands=result.commands;self.preserved=result.preserved_degenerate_contours;self.ready=true;self.started=false;Ok(count)
 }
 pub fn metadata(&self)->Result<Vec<f64>,JsValue>{if !self.ready{return Err(error("E_PA_ZIGZAG_STATE: no complete result"));}Ok(vec![self.commands as f64,self.output.len() as f64,self.preserved as f64])}
 pub fn read_output(&self,start:u32,count:u32)->Result<Vec<f64>,JsValue>{
  if !self.ready{return Err(error("E_PA_ZIGZAG_STATE: no complete result"));}let start=start as usize;let end=start.checked_add(count as usize).ok_or_else(||error("E_PA_ZIGZAG_RANGE: slice overflow"))?;if end>self.output.len(){return Err(error("E_PA_ZIGZAG_RANGE: invalid result slice"));}Ok(self.output[start..end].to_vec())
 }
 pub fn reset(&mut self){self.input=BezPath::new();self.output=Vec::new();self.started=false;self.active=false;self.ready=false;self.commands=0;self.preserved=0;}
}
