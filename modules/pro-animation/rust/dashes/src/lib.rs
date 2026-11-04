// SPDX-License-Identifier: Apache-2.0
// Data-only adapter to unchanged kurbo::dash 0.13.1 (MIT OR Apache-2.0).
// This is not a stroke renderer. Output curves are fed to existing PathData/Clipper/coverage.
use std::cell::Cell;
use kurbo::{PathEl,Point};
use wasm_bindgen::prelude::*;
thread_local! {static LIVE:Cell<u32>=const{Cell::new(0)};}
#[wasm_bindgen]
pub fn live_sessions()->u32 {LIVE.with(Cell::get)}
fn error(message:&str)->JsValue {JsValue::from_str(message)}
#[wasm_bindgen]
pub struct Engine {input:Vec<PathEl>,output:Vec<f64>,contours:Vec<(usize,usize)>,started:bool,active:bool}
impl Drop for Engine {fn drop(&mut self){LIVE.with(|v|v.set(v.get().saturating_sub(1)));}}
#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new()->Self {LIVE.with(|v|v.set(v.get()+1));Self{input:Vec::new(),output:Vec::new(),contours:Vec::new(),started:false,active:false}}
    pub fn begin(&mut self){self.reset();self.started=true;}
    /// Complete command records per chunk: M=1/xy, L=2/xy, Q=3/cxy/xy, C=4/c1xy/c2xy/xy, Z=5.
    pub fn append(&mut self,values:&[f64])->Result<(),JsValue>{
        if !self.started{return Err(error("E_PA_DASH_STATE: begin before append"));}
        let mut parsed=Vec::new();let mut at=0;let mut active=self.active;
        while at<values.len(){
            let size=match values[at]{1.0|2.0=>3,3.0=>5,4.0=>7,5.0=>1,_=>return Err(error("E_PA_DASH_INPUT: unknown command"))};
            let row=values.get(at..at+size).ok_or_else(||error("E_PA_DASH_INPUT: truncated command"))?;
            if row.iter().any(|v|!v.is_finite()){return Err(error("E_PA_DASH_INPUT: finite coordinates required"));}
            if row[0]!=1.0&&!active{return Err(error("E_PA_DASH_INPUT: contour requires MoveTo"));}
            let p=|i|Point::new(row[i],row[i+1]);
            parsed.push(match row[0]{1.0=>{active=true;PathEl::MoveTo(p(1))},2.0=>PathEl::LineTo(p(1)),3.0=>PathEl::QuadTo(p(1),p(3)),4.0=>PathEl::CurveTo(p(1),p(3),p(5)),_=>{active=false;PathEl::ClosePath}});at+=size;
        }
        self.input.try_reserve(parsed.len()).map_err(|_|error("E_PA_DASH_MEMORY: input allocation failed"))?;
        self.input.extend(parsed);self.active=active;Ok(())
    }
    /// Original curve arclength/inversion and closed-seam handling, not pre-flattened dashing.
    pub fn dash(&mut self,pattern:&[f64],offset:f64,max_commands:u32)->Result<u32,JsValue>{
        self.output=Vec::new();self.contours=Vec::new();
        if !self.started||self.input.first().is_none(){return Err(error("E_PA_DASH_STATE: nonempty path required"));}
        let sum=pattern.iter().sum::<f64>();let period=if pattern.len()%2==1{sum*2.0}else{sum};
        if pattern.is_empty()||pattern.iter().any(|v|!v.is_finite()||*v<=0.0)||!period.is_finite()||!offset.is_finite(){return Err(error("E_PA_DASH_PARAMETER: finite positive pattern and finite offset required"));}
        // Avoid non-progress loops below f64 resolution. This is a numerical-domain check, not a count cap.
        let magnitude=self.input.iter().flat_map(|el|match el{PathEl::MoveTo(p)|PathEl::LineTo(p)=>vec![p.x,p.y],PathEl::QuadTo(a,b)=>vec![a.x,a.y,b.x,b.y],PathEl::CurveTo(a,b,c)=>vec![a.x,a.y,b.x,b.y,c.x,c.y],_=>vec![]}).map(f64::abs).fold(1.0,f64::max);
        if pattern.iter().any(|v|*v<=f64::EPSILON*magnitude*8.0){return Err(error("E_PA_DASH_ACCURACY: pattern below coordinate floating-point resolution"));}
        let mut commands=0_u64;let mut start=0;
        for el in kurbo::dash(self.input.iter().copied(),offset,pattern){
            commands+=1;
            if max_commands>0&&commands>max_commands as u64 {self.output=Vec::new();self.contours=Vec::new();return Err(error("E_PA_DASH_BUDGET: caller output command budget exhausted"));}
            if matches!(el,PathEl::MoveTo(_))&&self.output.len()>start{self.contours.push((start,self.output.len()));start=self.output.len();}
            let row=match el{PathEl::MoveTo(p)=>vec![1.0,p.x,p.y],PathEl::LineTo(p)=>vec![2.0,p.x,p.y],PathEl::QuadTo(a,b)=>vec![3.0,a.x,a.y,b.x,b.y],PathEl::CurveTo(a,b,c)=>vec![4.0,a.x,a.y,b.x,b.y,c.x,c.y],PathEl::ClosePath=>vec![5.0]};
            if row.iter().any(|v|!v.is_finite()){self.output=Vec::new();self.contours=Vec::new();return Err(error("E_PA_DASH_OUTPUT: nonfinite curve result"));}
            self.output.try_reserve(row.len()).map_err(|_|error("E_PA_DASH_MEMORY: output allocation failed"))?;self.output.extend(row);
        }
        if self.output.len()>start{self.contours.push((start,self.output.len()));}
        u32::try_from(self.contours.len()).map_err(|_|error("E_PA_DASH_RANGE: contour index overflow"))
    }
    pub fn contour_size(&self,index:u32)->Result<u32,JsValue>{let (a,b)=self.contours.get(index as usize).ok_or_else(||error("E_PA_DASH_RANGE: unknown contour"))?;u32::try_from(b-a).map_err(|_|error("E_PA_DASH_RANGE: contour size overflow"))}
    pub fn read_contour(&self,index:u32,start:u32,count:u32)->Result<Vec<f64>,JsValue>{
        let (a,b)=self.contours.get(index as usize).ok_or_else(||error("E_PA_DASH_RANGE: unknown contour"))?;
        let lo=(*a).checked_add(start as usize).ok_or_else(||error("E_PA_DASH_RANGE: overflow"))?;
        let hi=lo.checked_add(count as usize).ok_or_else(||error("E_PA_DASH_RANGE: overflow"))?;
        if hi>*b{return Err(error("E_PA_DASH_RANGE: invalid contour slice"));}Ok(self.output[lo..hi].to_vec())
    }
    pub fn reset(&mut self){self.input=Vec::new();self.output=Vec::new();self.contours=Vec::new();self.started=false;self.active=false;}
}
