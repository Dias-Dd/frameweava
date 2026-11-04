// SPDX-License-Identifier: Apache-2.0
// Error-controlled subdivision around the original Twist map/Jacobian, not a new renderer.
#[path="algorithm.rs"]mod algorithm;
use kurbo::{BezPath,CubicBez,Line,ParamCurve,PathEl,Point,QuadBez};
#[derive(Clone,Copy)]pub struct Settings{pub angle_degrees:f64,pub center:Point,pub radius:Option<f64>,pub accuracy:f64,pub max_output_commands:Option<usize>}
#[derive(Debug)]pub struct Output{
 pub paths:Vec<BezPath>,pub commands:usize,pub radius:f64,pub max_bound:f64,pub subdivisions:usize,pub enclosure_lines:usize,
 #[cfg(test)]pub traces:Vec<Trace>,
}
#[cfg(test)]#[derive(Debug)]pub struct Trace{pub source:CubicBez,pub t0:f64,pub t1:f64,pub output:CubicBez,pub bound:f64}
fn error(code:&str,message:&str)->String{format!("{code}: {message}")}
fn point_finite(p:Point)->bool{p.x.is_finite()&&p.y.is_finite()}
fn points(el:&PathEl)->Vec<Point>{match *el{PathEl::MoveTo(p)|PathEl::LineTo(p)=>vec![p],PathEl::QuadTo(a,b)=>vec![a,b],PathEl::CurveTo(a,b,c)=>vec![a,b,c],PathEl::ClosePath=>vec![]}}
fn controls(c:CubicBez)->[Point;4]{[c.p0,c.p1,c.p2,c.p3]}
fn normalize(p:Point,s:Settings,r:f64)->Result<Point,String>{let q=((p-s.center)/r).to_point();if !point_finite(q){Err(error("E_PA_TWIST_PRECISION","normalization exceeds finite arithmetic"))}else{Ok(q)}}
fn world(p:Point,s:Settings,r:f64)->Result<Point,String>{let q=s.center+p.to_vec2()*r;if !point_finite(q){Err(error("E_PA_TWIST_PRECISION","mapped point exceeds finite arithmetic"))}else{Ok(q)}}
fn floor(s:Settings,world_radius:f64,phase:f64)->f64{
 let magnitude=s.center.x.abs().max(s.center.y.abs()).max(world_radius);
 let ulp=magnitude.next_up()-magnitude;128.*ulp*(1.+phase).powi(2)
}
/// For G(t)=R(a|q|)q-q, |G''| <= (min(2,K R)+K R)A+(3K+K²R)V².
/// Chord error <= M2/8; Hermite(G)-chord <= M2/8, so paired-parameter error <= M2/4.
/// q is cubic; its own Hermite is exact. Bounds on R,V,A use original Bernstein hulls.
fn bound(c:CubicBez,angle:f64,radius:f64)->f64{
 let r=controls(c).iter().map(|p|p.to_vec2().hypot()).fold(0.,f64::max);let k=angle.abs();let phase=k*r;
 let v=3.*[(c.p1-c.p0).hypot(),(c.p2-c.p1).hypot(),(c.p3-c.p2).hypot()].into_iter().fold(0.,f64::max);
 let a=6.*[(c.p2.to_vec2()-2.*c.p1.to_vec2()+c.p0.to_vec2()).hypot(),(c.p3.to_vec2()-2.*c.p2.to_vec2()+c.p1.to_vec2()).hypot()].into_iter().fold(0.,f64::max);
 ((phase.min(2.)+phase)*a+(3.*k+k*k*r)*v*v)*radius*0.25*(1.+64.*f64::EPSILON)
}
fn emit_curve(input:CubicBez,s:Settings,radius:f64,angle:f64,out:&mut BezPath,stats:&mut Output)->Result<(),String>{
 let norm=CubicBez::new(normalize(input.p0,s,radius)?,normalize(input.p1,s,radius)?,normalize(input.p2,s,radius)?,normalize(input.p3,s,radius)?);
 let mut stack=vec![(norm,0.,1.)];
 while let Some((q,t0,t1))=stack.pop(){
  let r=controls(q).iter().map(|p|p.to_vec2().hypot()).fold(0.,f64::max);let rounding=floor(s,r*radius,angle.abs()*r);
  if !rounding.is_finite()||rounding>=s.accuracy{return Err(error("E_PA_TWIST_PRECISION","requested accuracy is below conservative floating-point floor"));}
  let enclosure=2.*r*radius;let theoretical=bound(q,angle,radius);let linear=enclosure.is_finite()&&enclosure<=s.accuracy-rounding;
  if linear||theoretical.is_finite()&&theoretical<=s.accuracy-rounding{
   let fitted=if linear{let a=algorithm::map(q.p0,angle);let b=algorithm::map(q.p3,angle);CubicBez::new(a,a.lerp(b,1./3.),a.lerp(b,2./3.),b)}else{algorithm::hermite(q,angle)};
   let curve=CubicBez::new(world(fitted.p0,s,radius)?,world(fitted.p1,s,radius)?,world(fitted.p2,s,radius)?,world(fitted.p3,s,radius)?);
   let actual_bound=if linear{enclosure}else{theoretical}+rounding;
   stats.commands=stats.commands.checked_add(1).ok_or_else(||error("E_PA_TWIST_RANGE","command count overflow"))?;
   if s.max_output_commands.is_some_and(|limit|stats.commands>limit){return Err(error("E_PA_TWIST_BUDGET","output command budget exhausted"));}
   out.curve_to(curve.p1,curve.p2,curve.p3);stats.max_bound=stats.max_bound.max(actual_bound);stats.enclosure_lines+=usize::from(linear);
   #[cfg(test)]stats.traces.push(Trace{source:input,t0,t1,output:curve,bound:actual_bound});
  }else{
   let tm=0.5*(t0+t1);if tm==t0||tm==t1{return Err(error("E_PA_TWIST_PRECISION","subdivision cannot resolve requested accuracy"));}
   // DFS streaming, no recursion or fixed subdivision cap. Pending work consumes the caller budget.
   if s.max_output_commands.is_some_and(|limit|stats.commands.saturating_add(stack.len()).saturating_add(2)>limit){return Err(error("E_PA_TWIST_BUDGET","pending subdivision exceeds output command budget"));}
   let (left,right)=q.subdivide();stack.push((right,tm,t1));stack.push((left,t0,tm));stats.subdivisions=stats.subdivisions.checked_add(1).ok_or_else(||error("E_PA_TWIST_RANGE","subdivision count overflow"))?;
  }
 }
 Ok(())
}
pub fn twist_paths(paths:&[BezPath],s:Settings)->Result<Output,String>{
 if !s.angle_degrees.is_finite()||!point_finite(s.center)||!s.accuracy.is_finite()||s.accuracy<=0.||s.radius.is_some_and(|r|!r.is_finite()||r<=0.)||s.max_output_commands==Some(0){return Err(error("E_PA_TWIST_PARAMETER","finite angle/center, positive accuracy/radius/budget required"));}
 let mut radius=0_f64;
 for path in paths{if !path.elements().is_empty()&&!matches!(path.elements()[0],PathEl::MoveTo(_)){return Err(error("E_PA_TWIST_INPUT","MoveTo required"));}for el in path.elements(){for p in points(el){if !point_finite(p){return Err(error("E_PA_TWIST_INPUT","finite points required"));}let distance=(p-s.center).hypot();if !distance.is_finite(){return Err(error("E_PA_TWIST_PRECISION","center distance exceeds finite arithmetic"));}radius=radius.max(distance);}}}
 radius=s.radius.unwrap_or(radius);let angle=s.angle_degrees.to_radians();
 let mut stats=Output{paths:Vec::new(),commands:0,radius,max_bound:0.,subdivisions:0,enclosure_lines:0,#[cfg(test)]traces:Vec::new()};
 if angle==0.||radius==0.{stats.commands=paths.iter().map(|p|p.elements().len()).sum();if s.max_output_commands.is_some_and(|limit|stats.commands>limit){return Err(error("E_PA_TWIST_BUDGET","identity exceeds output budget"));}stats.paths=paths.to_vec();return Ok(stats);}
 for path in paths{
  let mut out=BezPath::new();let mut cursor=None;let mut first=None;
  for el in path.elements(){match *el{
   PathEl::MoveTo(p)=>{let normalized=normalize(p,s,radius)?;let r=normalized.to_vec2().hypot();let rounding=floor(s,r*radius,angle.abs()*r);if !rounding.is_finite()||rounding>=s.accuracy{return Err(error("E_PA_TWIST_PRECISION","mapped point accuracy below floating-point floor"));}let q=world(algorithm::map(normalized,angle),s,radius)?;out.move_to(q);cursor=Some(p);first=Some(p);stats.commands+=1;stats.max_bound=stats.max_bound.max(rounding);},
   PathEl::LineTo(p)=>{let start=cursor.ok_or_else(||error("E_PA_TWIST_INPUT","MoveTo required"))?;emit_curve(kurbo::PathSeg::Line(Line::new(start,p)).to_cubic(),s,radius,angle,&mut out,&mut stats)?;cursor=Some(p);},
   PathEl::QuadTo(a,b)=>{let start=cursor.ok_or_else(||error("E_PA_TWIST_INPUT","MoveTo required"))?;emit_curve(QuadBez::new(start,a,b).raise(),s,radius,angle,&mut out,&mut stats)?;cursor=Some(b);},
   PathEl::CurveTo(a,b,c)=>{let start=cursor.ok_or_else(||error("E_PA_TWIST_INPUT","MoveTo required"))?;emit_curve(CubicBez::new(start,a,b,c),s,radius,angle,&mut out,&mut stats)?;cursor=Some(c);},
   PathEl::ClosePath=>{let start=first.ok_or_else(||error("E_PA_TWIST_INPUT","MoveTo required"))?;let last=cursor.ok_or_else(||error("E_PA_TWIST_INPUT","Close after closed path"))?;if last!=start{emit_curve(kurbo::PathSeg::Line(Line::new(last,start)).to_cubic(),s,radius,angle,&mut out,&mut stats)?;}out.close_path();stats.commands+=1;cursor=None;first=None;},
  }if s.max_output_commands.is_some_and(|limit|stats.commands>limit){return Err(error("E_PA_TWIST_BUDGET","output command budget exhausted"));}}
  stats.paths.push(out);
 }
 Ok(stats)
}

#[cfg(test)]#[allow(dead_code)]mod original{include!("../upstream/selected.rs");}

#[cfg(test)]mod tests{
 use super::*;
 fn cfg()->Settings{Settings{angle_degrees:90.,center:Point::ZERO,radius:Some(100.),accuracy:1e-3,max_output_commands:Some(8192)}}
 fn line()->BezPath{let mut p=BezPath::new();p.move_to((0.,0.));p.line_to((100.,0.));p}
 fn polar(p:Point,s:Settings,radius:f64)->Point{let d=p-s.center;let r=d.hypot();let theta=d.y.atan2(d.x)+s.angle_degrees.to_radians()*r/radius;s.center+kurbo::Vec2::new(r*theta.cos(),r*theta.sin())}
 fn dense(output:&Output,s:Settings)->f64{
  let mut maximum=0_f64;
  for tr in &output.traces{for i in 0..=32{let u=i as f64/32.;let want=polar(tr.source.eval(tr.t0+(tr.t1-tr.t0)*u),s,output.radius);let actual=tr.output.eval(u);let e=actual.distance(want);maximum=maximum.max(e);assert!(e<=tr.bound+1e-12*s.radius.unwrap_or(output.radius).max(1e-300),"error{e} > bound{}",tr.bound);assert!(e<=s.accuracy,"error{e} > accuracy{}",s.accuracy);}}
  maximum
 }
 #[test]fn analytic_polar_line_and_no64_subdivision_cap(){let s=cfg();let out=twist_paths(&[line()],s).unwrap();assert!(out.commands>64&&out.commands<8192);assert!(out.max_bound<=s.accuracy);assert!(dense(&out,s)<s.accuracy);let endpoint=out.paths[0].elements().last().unwrap().end_point().unwrap();assert!(endpoint.distance(Point::new(0.,100.))<1e-12);}
 #[test]fn original_jacobian_matches_independent_polar_difference_and_origin_limit(){let p=Point::new(0.3,0.4);let dv=kurbo::Vec2::new(0.2,-0.1);let a=0.8;let h=1e-5;let s=Settings{angle_degrees:a*180./std::f64::consts::PI,center:Point::ZERO,radius:Some(1.),..cfg()};let reference=(polar(p+dv*h,s,1.)-polar(p-dv*h,s,1.))/(2.*h);assert!((reference-algorithm::jac(p,dv,a)).hypot()<1e-9);assert_eq!(algorithm::jac(Point::ZERO,dv,a),dv);}
 #[test]fn endpoint_radius_bug_is_reproduced_and_control_hull_loop_is_actually_warped(){let mut p=BezPath::new();p.move_to((0.,0.));p.curve_to((100.,100.),(-100.,100.),(0.,0.));p.close_path();assert_eq!(original::twist(&[p.clone()],90.,[0.,0.]),vec![p.clone()]);let s=Settings{radius:None,..cfg()};let out=twist_paths(&[p.clone()],s).unwrap();assert_ne!(out.paths,vec![p]);assert!((out.radius-20000f64.sqrt()).abs()<1e-12);dense(&out,s);assert_eq!(out.paths[0].elements().last(),Some(&PathEl::ClosePath));}
 #[test]fn zero_angle_preserves_exact_q_commands_and_move_only_contours(){let mut p=line();p.move_to((50.,50.));p.quad_to((100.,40.),(90.,30.));p.close_path();p.move_to((20.,50.));p.close_path();let out=twist_paths(&[p.clone()],Settings{angle_degrees:0.,..cfg()}).unwrap();assert_eq!(out.paths,vec![p]);assert_eq!(out.max_bound,0.);}
 #[test]fn implicit_close_is_curved_and_multiple_contours_keep_closure(){let mut p=BezPath::new();p.move_to((0.,0.));p.line_to((100.,0.));p.line_to((0.,100.));p.close_path();p.move_to((20.,20.));p.close_path();let s=Settings{center:Point::new(50.,50.),..cfg()};let out=twist_paths(&[p],s).unwrap();dense(&out,s);assert_eq!(out.paths[0].elements().iter().filter(|e|matches!(e,PathEl::ClosePath)).count(),2);assert!(out.traces.iter().any(|tr|tr.source.p0==Point::new(0.,100.)&&tr.source.p3==Point::new(0.,0.)));}
 #[test]fn physical_scaling_does_not_inherit_the_old_small_geometry_identity_epsilon(){for scale in [1e-9,1.,1e9]{let mut p=BezPath::new();p.move_to((20.*scale,-30.*scale));p.curve_to((50.*scale,90.*scale),(180.*scale,-40.*scale),(100.*scale,30.*scale));let s=Settings{center:Point::new(20.*scale,-30.*scale),radius:Some(100.*scale),accuracy:1e-3*scale,..cfg()};let out=twist_paths(&[p],s).unwrap();dense(&out,s);assert!(out.max_bound<=s.accuracy);}}
 #[test]fn finite_limits_and_output_budget_are_errors_without_partial_result(){for s in [Settings{accuracy:0.,..cfg()},Settings{angle_degrees:f64::NAN,..cfg()},Settings{radius:Some(0.),..cfg()},Settings{max_output_commands:Some(0),..cfg()}]{assert!(twist_paths(&[line()],s).unwrap_err().starts_with("E_PA_TWIST_PARAMETER"));}assert!(twist_paths(&[line()],Settings{max_output_commands:Some(2),..cfg()}).unwrap_err().starts_with("E_PA_TWIST_BUDGET"));assert!(twist_paths(&[line()],Settings{center:Point::new(1e12,1e12),accuracy:1e-4,..cfg()}).unwrap_err().starts_with("E_PA_TWIST_PRECISION"));}
 #[test]fn fixed64_original_has_measurable_high_angle_error_while_adaptive_result_obeys_budget(){
  let s=Settings{angle_degrees:1080.,..cfg()};let original=original::twist(&[line()],s.angle_degrees,[0.,0.]);let curves:Vec<_>=original[0].segments().map(|s|s.to_cubic()).collect();assert_eq!(curves.len(),64);let mut old_error=0_f64;
  for (j,c)in curves.iter().enumerate(){for i in 0..=32{let u=i as f64/32.;let t=(j as f64+u)/curves.len() as f64;old_error=old_error.max(c.eval(u).distance(polar(kurbo::PathSeg::Line(Line::new((0.,0.),(100.,0.))).to_cubic().eval(t),s,100.)));}}
  let new=twist_paths(&[line()],s).unwrap();let new_error=dense(&new,s);println!("old64ErrorPx={old_error} adaptiveErrorPx={new_error} adaptiveCommands={} boundPx={}",new.commands,new.max_bound);assert!(old_error>s.accuracy);assert!(new_error<=s.accuracy);assert!(new.commands>64);
 }
 #[test]fn deterministic_curve_stress_checks_analytic_bound_including_cross_center_and_retracted_handles(){
  let mut seed=0x7654_3210u64;let mut next=||{seed=seed.wrapping_mul(6364136223846793005).wrapping_add(1);((seed>>32)as f64/u32::MAX as f64)*200.-100.};let mut maximum=0_f64;let mut samples=0;
  for index in 0..20{let p0=Point::new(next(),next());let p1=if index%4==0{p0}else{Point::new(next(),next())};let p2=Point::new(next(),next());let p3=if index%5==0{p0}else{Point::new(next(),next())};let mut path=BezPath::new();path.move_to(p0);path.curve_to(p1,p2,p3);let s=Settings{angle_degrees:if index%2==0{260.}else{-220.},radius:None,max_output_commands:Some(65536),..cfg()};let result=twist_paths(&[path],s).unwrap();maximum=maximum.max(dense(&result,s));samples+=result.traces.len()*33;}
  println!("stressCases=20 densePolarSamples={samples} maxErrorPx={maximum} targetPx=0.001; native explicit budget65536, not public Graphics publication");
 }
}
