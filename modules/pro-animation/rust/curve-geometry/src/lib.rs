// SPDX-License-Identifier: Apache-2.0 AND (MIT OR Apache-2.0)
// Same original owned curve sampler, extended by query-result transport only.
include!("curve-base.rs");
use kurbo::{ParamCurveArea,ParamCurveNearest,ParamCurveExtrema,ParamCurveCurvature,Shape,BezPath,Affine,Rect,Line};
fn geometry_error(s:&str)->JsValue{error(s)}
fn geometry_extend(out:&mut Vec<f64>,row:&[f64])->Result<(),JsValue>{out.try_reserve(row.len()).map_err(|_|geometry_error("E_PA_GEOMETRY_MEMORY: query allocation failed"))?;out.extend(row);Ok(())}
fn geometry_encode(out:&mut Vec<f64>,el:PathEl)->Result<(),JsValue>{match el{PathEl::MoveTo(p)=>geometry_extend(out,&[1.,p.x,p.y]),PathEl::LineTo(p)=>geometry_extend(out,&[2.,p.x,p.y]),PathEl::QuadTo(a,b)=>geometry_extend(out,&[3.,a.x,a.y,b.x,b.y]),PathEl::CurveTo(a,b,c)=>geometry_extend(out,&[4.,a.x,a.y,b.x,b.y,c.x,c.y]),PathEl::ClosePath=>geometry_extend(out,&[5.])}}
fn geometry_path(c:&Contour)->BezPath{let mut p=BezPath::new();if let Some(first)=c.segments.first(){p.move_to(first.curve.start());for s in &c.segments{p.push(s.curve.as_path_el());}if c.closed{p.close_path();}}p}
fn geometry_jet(s:PathSeg,t:f64)->(Point,Vec2,Vec2,Option<f64>){
 let point=s.eval(t);let(d,d2,k)=match s{PathSeg::Line(l)=>(l.deriv().eval(t).to_vec2(),Vec2::ZERO,0.),PathSeg::Quad(q)=>{let d=q.deriv();(d.eval(t).to_vec2(),d.deriv().eval(t).to_vec2(),-q.curvature(t))},PathSeg::Cubic(c)=>{let d=c.deriv();(d.eval(t).to_vec2(),d.deriv().eval(t).to_vec2(),-c.curvature(t))}};
 (point,d,d2,if d.hypot()==0.{None}else{Some(k)})
}
impl Engine{
 fn geometry_contour(&self,index:u32)->Result<&Contour,JsValue>{if self.accuracy<=0.{return Err(geometry_error("E_PA_GEOMETRY_STATE: prepare the original sampler first"));}self.contours.get(index as usize).ok_or_else(||geometry_error("E_PA_GEOMETRY_CONTOUR: original contour required"))}
 fn geometry_segment(&self,contour:u32,source:u32)->Result<PathSeg,JsValue>{let c=self.geometry_contour(contour)?;let at=c.segments.binary_search_by_key(&(source as usize),|s|s.source_index).map_err(|_|geometry_error("E_PA_GEOMETRY_SEGMENT: select an original NONZERO segment; degenerate segments are explicitly excluded by the original sampler"))?;Ok(c.segments[at].curve)}
}
#[wasm_bindgen]
impl Engine{
 /// 0statistics,1tight bounds,2control bounds,3closed algebraic area,4closed winding,
 /// 5nearest point,6derivative jets,7extrema,8inflections,9external tangents,
 /// 10finite line intersections,11exact portion,12monotone ranges,
 /// 13original flatten,14original cubic-to-quadratics,15open centerline clip to rect.
 pub fn geometry_query(&mut self,mode:u32,index:u32,segment:u32,values:&[f64],accuracy:f64)->Result<u32,JsValue>{
  self.geometry_output=Vec::new();if !accuracy.is_finite()||accuracy<=0.||values.iter().any(|v|!v.is_finite()){return Err(geometry_error("E_PA_GEOMETRY_PARAMETER: positive finite accuracy and finite words required"));}
  let c=self.geometry_contour(index)?;let mut out=Vec::new();
  match mode{
   0=>out.extend([c.length,u8::from(c.closed) as f64,c.source_count as f64,c.segments.len() as f64,self.accuracy*c.source_count as f64]),
   1|2=>{let mut bounds:Option<Rect>=None;for entry in &c.segments{let s=entry.curve;let r=if mode==1{ParamCurveExtrema::bounding_box(&s)}else{let p=match s{PathSeg::Line(l)=>[l.p0,l.p1,l.p0,l.p1],PathSeg::Quad(q)=>[q.p0,q.p1,q.p2,q.p2],PathSeg::Cubic(b)=>[b.p0,b.p1,b.p2,b.p3]};Rect::from_points(p[0],p[1]).union_pt(p[2]).union_pt(p[3])};bounds=Some(bounds.map_or(r,|b|b.union(r)));}if let Some(r)=bounds{out.extend([1.,r.x0,r.y0,r.x1,r.y1]);}else{out.extend([0.;5]);}}
   3=>{if !c.closed{return Err(geometry_error("E_PA_GEOMETRY_OPEN: signed contour area requires explicit closure"));}let origin=c.segments.first().map(|s|s.curve.start()).unwrap_or(Point::ZERO);let transform=Affine::translate((-origin.x,-origin.y));let(mut sum,mut residual)=(0.,0.);for s in &c.segments{let y=(transform*s.curve).signed_area()-residual;let next=sum+y;residual=(next-sum)-y;sum=next;}out.push(sum);}
   4=>{if !c.closed||values.len()%2!=0{return Err(geometry_error("E_PA_GEOMETRY_OPEN: winding requires explicitly closed contour and XY rows"));}let p=geometry_path(c);for q in values.chunks_exact(2){out.push(p.winding(Point::new(q[0],q[1])) as f64);}}
   5=>{if values.len()%2!=0{return Err(geometry_error("E_PA_GEOMETRY_PARAMETER: XY rows required"));}for q in values.chunks_exact(2){let p=Point::new(q[0],q[1]);let mut best:Option<(usize,f64,f64,Point,f64)>=None;for s in &c.segments{let n=s.curve.nearest(p,accuracy);if best.as_ref().map_or(true,|b|n.distance_sq<b.2){let at=s.curve.eval(n.t);let distance=if n.t==0.{s.start}else if n.t==1.{s.end}else{s.start+s.curve.subsegment(0. ..n.t).arclen(self.accuracy)};best=Some((s.source_index,n.t,n.distance_sq,at,distance));}}if let Some((segment,t,d2,p,distance))=best{geometry_extend(&mut out,&[1.,segment as f64,t,p.x,p.y,d2,distance])?;}else{geometry_extend(&mut out,&[0.;7])?;}}}
   6=>{let s=self.geometry_segment(index,segment)?;for &t in values{if !(0. ..=1.).contains(&t){return Err(geometry_error("E_PA_GEOMETRY_PARAMETER: original local parameter must be[0,1]"));}let(p,d,d2,k)=geometry_jet(s,t);geometry_extend(&mut out,&[t,p.x,p.y,d.x,d.y,d2.x,d2.y,u8::from(k.is_some()) as f64,k.unwrap_or(0.)])?;}}
   7|8|9=>{let s=self.geometry_segment(index,segment)?;let ts:Vec<f64>=match mode{7=>s.extrema().into_iter().collect(),8=>s.to_cubic().inflections().into_iter().collect(),_=>{if values.len()!=2{return Err(geometry_error("E_PA_GEOMETRY_PARAMETER: external tangent point XY required"));}s.to_cubic().tangents_to_point(Point::new(values[0],values[1])).into_iter().collect()}};for t in ts{let p=s.eval(t);geometry_extend(&mut out,&[t,p.x,p.y])?;}}
   10=>{if values.len()!=5||values[4]<0.||values[4].fract()!=0.{return Err(geometry_error("E_PA_GEOMETRY_PARAMETER: finite probe endpoints and dense chunk count required"));}let line=Line::new((values[0],values[1]),(values[2],values[3]));if line.p0==line.p1{return Err(geometry_error("E_PA_GEOMETRY_PARAMETER: nonzero finite probe line required"));}for s in c.segments.iter().skip(segment as usize).take(values[4] as usize){for hit in s.curve.intersect_line(line){let p=s.curve.eval(hit.segment_t);geometry_extend(&mut out,&[s.source_index as f64,hit.segment_t,hit.line_t,p.x,p.y,u8::from((0. ..=1.).contains(&hit.segment_t)) as f64])?;}}}
   11=>{if values.len()!=2||values.iter().any(|v|!(0. ..=1.).contains(v)){return Err(geometry_error("E_PA_GEOMETRY_PARAMETER: two exact local parameters in[0,1] required"));}let s=self.geometry_segment(index,segment)?.subsegment(values[0]..values[1]);geometry_encode(&mut out,PathEl::MoveTo(s.start()))?;geometry_encode(&mut out,s.as_path_el())?;}
   12=>{let s=self.geometry_segment(index,segment)?;for range in s.extrema_ranges(){geometry_extend(&mut out,&[range.start,range.end])?;}}
   13|14=>{let s=self.geometry_segment(index,segment)?;let b=s.to_cubic();let magnitude=[b.p0,b.p1,b.p2,b.p3].iter().flat_map(|p|[p.x.abs(),p.y.abs()]).fold(1.,f64::max);if accuracy<16.*f64::EPSILON*magnitude{return Err(geometry_error("E_PA_GEOMETRY_ACCURACY: requested approximation below Float64 coordinate resolution"));}
    if mode==13{let mut failed=false;kurbo::flatten([PathEl::MoveTo(s.start()),s.as_path_el()],accuracy,|el|{if !failed{failed=geometry_encode(&mut out,el).is_err();}});if failed{return Err(geometry_error("E_PA_GEOMETRY_MEMORY: original flatten output allocation failed"));}}
    else{for(a,z,q)in b.to_quads(accuracy){geometry_extend(&mut out,&[a,z,q.p0.x,q.p0.y,q.p1.x,q.p1.y,q.p2.x,q.p2.y])?;}}
   }
   15=>{if values.len()!=4||values[0]>=values[2]||values[1]>=values[3]{return Err(geometry_error("E_PA_GEOMETRY_PARAMETER: finite nonempty XY rectangle required"));}let s=self.geometry_segment(index,segment)?;let r=Rect::new(values[0],values[1],values[2],values[3]);let corners=[Point::new(r.x0,r.y0),Point::new(r.x1,r.y0),Point::new(r.x1,r.y1),Point::new(r.x0,r.y1)];let mut ts=vec![0.,1.];for i in 0..4{for h in s.intersect_line(Line::new(corners[i],corners[(i+1)%4])){if h.segment_t>0.&&h.segment_t<1.{ts.push(h.segment_t);}}}ts.sort_by(f64::total_cmp);ts.dedup();for range in ts.windows(2){let p=s.eval((range[0]+range[1])/2.);if p.x>=r.x0&&p.x<=r.x1&&p.y>=r.y0&&p.y<=r.y1{geometry_extend(&mut out,range)?;}}}
   _=>return Err(geometry_error("E_PA_GEOMETRY_OPERATION: unknown owned data query"))
  }
  if out.iter().any(|v|!v.is_finite()){return Err(geometry_error("E_PA_GEOMETRY_PRECISION: nonfinite original numerical result; rescale inputs or adjust explicit accuracy"));}let n=u32::try_from(out.len()).map_err(|_|geometry_error("E_PA_GEOMETRY_MEMORY: query transport index overflow"))?;self.geometry_output=out;Ok(n)
 }
 pub fn geometry_read(&self,start:u32,count:u32)->Result<Vec<f64>,JsValue>{let end=(start as usize).checked_add(count as usize).ok_or_else(||geometry_error("E_PA_GEOMETRY_RANGE: integer overflow"))?;self.geometry_output.get(start as usize..end).map(|v|v.to_vec()).ok_or_else(||geometry_error("E_PA_GEOMETRY_RANGE: query rows"))}
 pub fn geometry_clear(&mut self){self.geometry_output=Vec::new();}
}
