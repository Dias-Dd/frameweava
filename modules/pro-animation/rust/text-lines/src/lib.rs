// SPDX-License-Identifier: Apache-2.0
// Transport/lifecycle only. Unicode algorithms remain original registry crates.
pub mod analysis;
use std::cell::Cell;
use wasm_bindgen::prelude::*;
thread_local!{static LIVE:Cell<u32>=const{Cell::new(0)};}
#[wasm_bindgen] pub fn live_sessions()->u32{LIVE.with(Cell::get)}
#[wasm_bindgen] pub struct Engine{result:Option<analysis::Analysis>}
impl Drop for Engine{fn drop(&mut self){LIVE.with(|n|n.set(n.get().saturating_sub(1)));}}
fn error(s:impl AsRef<str>)->JsValue{JsValue::from_str(s.as_ref())}
fn range(start:u32,count:u32,len:usize)->Result<std::ops::Range<usize>,JsValue>{let a=start as usize;let b=a.checked_add(count as usize).ok_or_else(||error("E_PA_TEXT_RANGE: query overflow"))?;if b>len{return Err(error("E_PA_TEXT_RANGE: query exceeds results"));}Ok(a..b)}
impl Engine{fn ready(&self)->Result<&analysis::Analysis,JsValue>{self.result.as_ref().ok_or_else(||error("E_PA_TEXT_STATE: analyze text first"))}}
#[wasm_bindgen]
impl Engine{
 #[wasm_bindgen(constructor)]pub fn new()->Self{LIVE.with(|n|n.set(n.get()+1));Self{result:None}}
 pub fn analyze(&mut self,text:&str,base:u32)->Result<u32,JsValue>{self.result=None;let result=analysis::analyze(text,base).map_err(error)?;let count=u32::try_from(result.runs.len()).map_err(|_|error("E_PA_TEXT_RANGE: run count exceeds transport"))?;self.result=Some(result);Ok(count)}
 pub fn analyze_line(&mut self,text:&str,base:u32,start:u32,end:u32)->Result<u32,JsValue>{self.result=None;let result=analysis::analyze_line(text,base,start as usize,end as usize).map_err(error)?;let count=u32::try_from(result.runs.len()).map_err(|_|error("E_PA_TEXT_RANGE: run count exceeds transport"))?;self.result=Some(result);Ok(count)}
 pub fn metadata(&self)->Result<Vec<f64>,JsValue>{let r=self.ready()?;let b=unicode_bidi::UNICODE_VERSION;let s=unicode_script::UNICODE_VERSION;let g=unicode_segmentation::UNICODE_VERSION;Ok(vec![r.length as f64,r.paragraphs.len() as f64,r.runs.len() as f64,r.bidi_runs.len() as f64,r.visual_indices.len() as f64,r.candidates.len() as f64,b.0 as f64,b.1 as f64,b.2 as f64,s.0 as f64,s.1 as f64,s.2 as f64,g.0 as f64,g.1 as f64,g.2 as f64])}
 pub fn read_paragraphs(&self,start:u32,count:u32)->Result<Vec<f64>,JsValue>{let r=self.ready()?;Ok(r.paragraphs[range(start,count,r.paragraphs.len())?].iter().flat_map(|p|[p.start as f64,p.end as f64,p.level as f64]).collect())}
 pub fn read_levels(&self,start:u32,count:u32)->Result<Vec<f64>,JsValue>{let r=self.ready()?;Ok(r.levels[range(start,count,r.levels.len())?].iter().flat_map(|p|p.map(|x|x as f64)).collect())}
 pub fn read_runs(&self,start:u32,count:u32)->Result<Vec<f64>,JsValue>{let r=self.ready()?;Ok(r.runs[range(start,count,r.runs.len())?].iter().flat_map(|p|[p.paragraph as f64,p.start as f64,p.end as f64,p.level as f64,p.script as f64,p.flags as f64,p.candidates.start as f64,p.candidates.len() as f64]).collect())}
 pub fn read_candidates(&self,start:u32,count:u32)->Result<Vec<f64>,JsValue>{let r=self.ready()?;Ok(r.candidates[range(start,count,r.candidates.len())?].iter().map(|&tag|tag as f64).collect())}
 pub fn read_bidi_runs(&self,start:u32,count:u32)->Result<Vec<f64>,JsValue>{let r=self.ready()?;Ok(r.bidi_runs[range(start,count,r.bidi_runs.len())?].iter().flat_map(|p|[p.paragraph as f64,p.start as f64,p.end as f64,p.level as f64]).collect())}
 pub fn read_visual_indices(&self,start:u32,count:u32)->Result<Vec<f64>,JsValue>{let r=self.ready()?;Ok(r.visual_indices[range(start,count,r.visual_indices.len())?].iter().map(|&p|p as f64).collect())}
 pub fn reset_results(&mut self){self.result=None;}
}
