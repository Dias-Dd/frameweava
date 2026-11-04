// SPDX-License-Identifier: Apache-2.0 AND (Apache-2.0 OR MIT)
// Thin data adapter to unchanged kurbo 0.13.1 arclen/inv_arclen/eval.
// Endpoint tangent helper adapts kurbo src/bezpath.rs tangents(): Copyright the Kurbo Authors.
use std::cell::Cell;
use kurbo::{PathEl,PathSeg,Point,Vec2,ParamCurve,ParamCurveArclen,ParamCurveDeriv};
use wasm_bindgen::prelude::*;
thread_local!{static LIVE:Cell<u32>=const{Cell::new(0)};}
#[wasm_bindgen]
pub fn live_sessions()->u32 {LIVE.with(Cell::get)}
fn error(s:&str)->JsValue {JsValue::from_str(s)}
struct Segment {curve:PathSeg,start:f64,end:f64,source_index:usize}
struct Contour {segments:Vec<Segment>,length:f64,closed:bool,source_count:usize}

// Adapted from the pinned private helper. It is called only when the exact endpoint
// derivative is zero. EPS is 0 rather than upstream 1e-12: no coordinate-scale threshold
// is introduced for a mathematically nonzero higher-order endpoint direction.
fn endpoint_tangent(s:PathSeg,end:bool)->Vec2 {
    let first=|v:&[Vec2]|v.iter().copied().find(|v|v.hypot()>0.0).unwrap_or(Vec2::ZERO);
    match s {
        PathSeg::Line(l)=>l.p1-l.p0,
        PathSeg::Quad(q)=>if end{first(&[q.p2-q.p1,q.p2-q.p0])}else{first(&[q.p1-q.p0,q.p2-q.p0])},
        PathSeg::Cubic(c)=>if end{first(&[c.p3-c.p2,c.p3-c.p1,c.p3-c.p0])}else{first(&[c.p1-c.p0,c.p2-c.p0,c.p3-c.p0])},
    }
}
#[wasm_bindgen]
pub struct Engine {input:Vec<PathEl>,contours:Vec<Contour>,started:bool,active:bool,accuracy:f64,geometry_output:Vec<f64>}
impl Drop for Engine {fn drop(&mut self){LIVE.with(|v|v.set(v.get().saturating_sub(1)));}}
#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new()->Self {LIVE.with(|v|v.set(v.get()+1));Self{input:Vec::new(),contours:Vec::new(),started:false,active:false,accuracy:0.0,geometry_output:Vec::new()}}
    pub fn begin(&mut self){self.reset();self.started=true;}
    /// Same bounded data transport as the existing geometry adapters; chunks contain complete records.
    pub fn append(&mut self,values:&[f64])->Result<(),JsValue>{
        if !self.started||self.accuracy>0.0{return Err(error("E_PA_CURVE_STATE: begin before append; prepared input is immutable"));}
        let mut parsed=Vec::new();let mut at=0;let mut active=self.active;
        while at<values.len(){
            let size=match values[at]{1.0|2.0=>3,3.0=>5,4.0=>7,5.0=>1,_=>return Err(error("E_PA_CURVE_INPUT: unknown command"))};
            let row=values.get(at..at+size).ok_or_else(||error("E_PA_CURVE_INPUT: truncated command"))?;
            if row.iter().any(|v|!v.is_finite()){return Err(error("E_PA_CURVE_INPUT: finite coordinates required"));}
            if row[0]!=1.0&&!active{return Err(error("E_PA_CURVE_INPUT: MoveTo required"));}
            let p=|i|Point::new(row[i],row[i+1]);
            parsed.push(match row[0]{1.0=>{active=true;PathEl::MoveTo(p(1))},2.0=>PathEl::LineTo(p(1)),3.0=>PathEl::QuadTo(p(1),p(3)),4.0=>PathEl::CurveTo(p(1),p(3),p(5)),_=>{active=false;PathEl::ClosePath}});at+=size;
        }
        self.input.try_reserve(parsed.len()).map_err(|_|error("E_PA_CURVE_MEMORY: allocation failed"))?;self.input.extend(parsed);self.active=active;Ok(())
    }
    /// Requested absolute length budget is divided across all original segments, never silently coarsened.
    pub fn prepare(&mut self,accuracy:f64)->Result<u32,JsValue>{
        if !self.started||self.accuracy>0.0||self.input.is_empty(){return Err(error("E_PA_CURVE_STATE: nonempty canonical input required"));}
        if !accuracy.is_finite()||accuracy<=0.0{return Err(error("E_PA_CURVE_ACCURACY: positive finite accuracy required"));}
        self.contours=Vec::new();
        let starts:Vec<usize>=self.input.iter().enumerate().filter_map(|(i,e)|matches!(e,PathEl::MoveTo(_)).then_some(i)).collect();
        let total=kurbo::segments(self.input.iter().copied()).count();let per=accuracy/(total.max(1) as f64);
        if per==0.0{return Err(error("E_PA_CURVE_ACCURACY: divided accuracy underflow"));}
        let mut contours=Vec::new();
        for (i,start) in starts.iter().enumerate(){
            let slice=&self.input[*start..starts.get(i+1).copied().unwrap_or(self.input.len())];
            let mut contour=Contour{segments:Vec::new(),length:0.0,closed:matches!(slice.last(),Some(PathEl::ClosePath)),source_count:0};
            for (index,curve) in kurbo::segments(slice.iter().copied()).enumerate(){
                contour.source_count+=1;
                let points=match curve{PathSeg::Line(l)=>[l.p0,l.p1,l.p0,l.p1],PathSeg::Quad(q)=>[q.p0,q.p1,q.p2,q.p2],PathSeg::Cubic(c)=>[c.p0,c.p1,c.p2,c.p3]};
                let magnitude=points.iter().flat_map(|p|[p.x.abs(),p.y.abs()]).fold(1.0,f64::max);
                if per<16.0*f64::EPSILON*magnitude{return Err(error("E_PA_CURVE_ACCURACY: requested per-segment budget below coordinate floating-point resolution"));}
                let length=curve.arclen(per);
                if !length.is_finite()||length<0.0{return Err(error("E_PA_CURVE_OUTPUT: invalid curve length"));}
                if length>0.0{let end=contour.length+length;if !end.is_finite()||end==contour.length{return Err(error("E_PA_CURVE_ACCURACY: length prefix exceeds floating-point resolution"));}contour.segments.push(Segment{curve,start:contour.length,end,source_index:index});contour.length=end;}
            }
            contours.push(contour);
        }
        self.contours=contours;self.accuracy=per;self.input=Vec::new();u32::try_from(self.contours.len()).map_err(|_|error("E_PA_CURVE_RANGE: contour index overflow"))
    }
    /// [length, closed, original segment count, allocated length budget] per contour.
    pub fn contour_info(&self,index:u32)->Result<Vec<f64>,JsValue>{let c=self.contours.get(index as usize).ok_or_else(||error("E_PA_CURVE_RANGE: unknown contour"))?;Ok(vec![c.length,if c.closed{1.0}else{0.0},c.source_count as f64,self.accuracy*c.source_count as f64])}
    /// Eight scalars per sample: x,y,unit tangent x/y,status(0 undefined,1 derivative,2 endpoint limit),source segment,t,distance.
    /// Side 0=incoming,1=outgoing at an exact segment join; endpoints always use the available segment.
    pub fn sample(&self,index:u32,distances:&[f64],side:u32)->Result<Vec<f64>,JsValue>{
        let contour=self.contours.get(index as usize).ok_or_else(||error("E_PA_CURVE_RANGE: unknown contour"))?;
        if side>1{return Err(error("E_PA_CURVE_PARAMETER: unknown join side"));}
        if contour.length==0.0{return Err(error("E_PA_CURVE_DEGENERATE: cannot sample zero-length contour"));}
        let mut result=Vec::new();result.try_reserve(distances.len().checked_mul(8).ok_or_else(||error("E_PA_CURVE_MEMORY: sample allocation overflow"))?).map_err(|_|error("E_PA_CURVE_MEMORY: sample allocation failed"))?;
        for d in distances{
            if !d.is_finite()||*d<0.0||*d>contour.length{return Err(error("E_PA_CURVE_RANGE: finite contour distance required"));}
            let at=contour.segments.partition_point(|s|if side==0{s.end<*d}else{s.end<=*d}).min(contour.segments.len()-1);let segment=&contour.segments[at];
            let t=if *d<=segment.start{0.0}else if *d>=segment.end{1.0}else{segment.curve.inv_arclen(*d-segment.start,self.accuracy)};
            let point=segment.curve.eval(t);let derivative=match segment.curve{PathSeg::Line(l)=>l.deriv().eval(t),PathSeg::Quad(q)=>q.deriv().eval(t),PathSeg::Cubic(c)=>c.deriv().eval(t)};
            let mut vector=derivative.to_vec2();let mut status=1.0;
            if vector.hypot()==0.0{if t==0.0||t==1.0{vector=endpoint_tangent(segment.curve,t==1.0);status=2.0;}else{status=0.0;}}
            let length=vector.hypot();if length==0.0{status=0.0;}else{vector/=length;}
            let row=[point.x,point.y,vector.x,vector.y,status,segment.source_index as f64,t,*d];if row.iter().any(|v|!v.is_finite()){return Err(error("E_PA_CURVE_OUTPUT: nonfinite sample"));}result.extend(row);
        }
        Ok(result)
    }
    pub fn reset(&mut self){self.input=Vec::new();self.contours=Vec::new();self.started=false;self.active=false;self.accuracy=0.0;self.geometry_output=Vec::new();}
}
