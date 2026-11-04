// SPDX-License-Identifier: Apache-2.0
// In-progress data algorithm adapter; not yet a public package or Stage binding.
#[path="algorithm.rs"]
mod algorithm;
use kurbo::{BezPath,ParamCurveArclen,PathEl};

#[derive(Clone,Copy)]
pub struct Settings {
 pub size:f64,pub ridges:f64,pub smooth:bool,
 /// Original per-segment arclength/inverse budget, in physical px; no flattening before sampling.
 pub accuracy:f64,
 /// Caller/canonical contract budget, not a silent ridge clamp. None is explicit native unlimited.
 pub max_output_commands:Option<usize>,
}
#[derive(Debug,PartialEq)]
pub struct Output {pub paths:Vec<BezPath>,pub commands:usize,pub preserved_degenerate_contours:usize}
fn error(code:&str,description:&str)->String{format!("{code}: {description}")}
fn checked_add(a:usize,b:usize)->Result<usize,String>{a.checked_add(b).ok_or_else(||error("E_PA_ZIGZAG_RANGE","output count overflow"))}
fn checked_mul(a:usize,b:usize)->Result<usize,String>{a.checked_mul(b).ok_or_else(||error("E_PA_ZIGZAG_RANGE","output count overflow"))}
fn finite(el:&PathEl)->bool {match el{PathEl::MoveTo(p)|PathEl::LineTo(p)=>p.x.is_finite()&&p.y.is_finite(),PathEl::QuadTo(a,b)=>[a.x,a.y,b.x,b.y].iter().all(|n|n.is_finite()),PathEl::CurveTo(a,b,c)=>[a.x,a.y,b.x,b.y,c.x,c.y].iter().all(|n|n.is_finite()),PathEl::ClosePath=>true}}

/// Guard around original EffectCraft resample/emit/Rust kurbo. No editor or renderer is imported.
pub fn zigzag_paths(paths:&[BezPath],p:Settings)->Result<Output,String>{
 if !p.size.is_finite()||!p.ridges.is_finite()||p.ridges<0.||!p.accuracy.is_finite()||p.accuracy<=0.||p.max_output_commands==Some(0){return Err(error("E_PA_ZIGZAG_PARAMETER","finite size, nonnegative ridges, positive accuracy/budget required"));}
 // The managed transport is WASM32. Reject unrepresentable indices; never clamp a valid count.
 if p.ridges.round()>(u32::MAX-1) as f64{return Err(error("E_PA_ZIGZAG_RANGE","rounded ridge count exceeds WASM32 index representation"));}
 let pieces=(p.ridges.round() as usize).checked_add(1).ok_or_else(||error("E_PA_ZIGZAG_RANGE","piece count overflow"))?;
 let mut count=0;let mut preserved=0;
 // Preflight the complete result before the original allocating algorithm runs.
 for path in paths{
  if path.elements().iter().any(|el|!finite(el)){return Err(error("E_PA_ZIGZAG_INPUT","finite canonical coordinates required"));}
  if !path.elements().is_empty()&&!matches!(path.elements()[0],PathEl::MoveTo(_)){return Err(error("E_PA_ZIGZAG_INPUT","contour must start with MoveTo"));}
  for els in path.subpaths(){
   let input=BezPath::from_vec(els.to_vec());let mut segments=0;
   if p.size==0.{count=checked_add(count,els.len())?;continue;}
   for segment in input.segments(){
    let c=segment.to_cubic();let exact=c.p0==c.p1&&c.p0==c.p2&&c.p0==c.p3;
    if exact{continue;}
    // Upstream would silently discard near-zero geometry; make its numerical domain observable.
    if c.p0.distance(c.p1)<1e-9&&c.p0.distance(c.p2)<1e-9&&c.p0.distance(c.p3)<1e-9{return Err(error("E_PA_ZIGZAG_PRECISION","nonzero segment below original degenerate threshold; rescale geometry explicitly"));}
    let length=segment.arclen(p.accuracy);if !length.is_finite()||length<=0.{return Err(error("E_PA_ZIGZAG_PRECISION","segment length cannot be resolved under finite arithmetic"));}
    segments+=1;
   }
   count=checked_add(count,if segments==0{preserved+=1;els.len()}else{checked_add(checked_mul(segments,pieces)?,if matches!(els.last(),Some(PathEl::ClosePath)){2}else{1})?})?;
  }
  if p.max_output_commands.is_some_and(|limit|count>limit){return Err(error("E_PA_ZIGZAG_BUDGET","caller output-command budget exhausted before allocation"));}
 }
 let mut output=Vec::new();output.try_reserve(paths.len()).map_err(|_|error("E_PA_ZIGZAG_MEMORY","path list allocation failed"))?;
 for path in paths{
  if p.size==0.{output.push(path.clone());continue;}
  let mut result=BezPath::new();
  for els in path.subpaths(){
   let input=BezPath::from_vec(els.to_vec());
   if input.segments().all(|s|{let c=s.to_cubic();c.p0==c.p1&&c.p0==c.p2&&c.p0==c.p3}){result.extend(els.iter().copied());}
   else {let solved=algorithm::zigzag(&[input],p.size,p.ridges,p.smooth,p.accuracy);result.extend(solved[0].elements().iter().copied());}
  }
  if result.elements().iter().any(|el|!finite(el)){return Err(error("E_PA_ZIGZAG_PRECISION","displaced geometry exceeds finite representation"));}
  output.push(result);
 }
 let actual=output.iter().try_fold(0,|sum,path|checked_add(sum,path.elements().len()))?;if actual!=count{return Err(error("E_PA_ZIGZAG_OUTPUT","preflight and actual topology counts disagree"));}
 Ok(Output{paths:output,commands:count,preserved_degenerate_contours:preserved})
}

#[cfg(test)]
#[allow(dead_code)]
mod original {include!("../upstream/selected.rs");}

#[cfg(test)]
mod tests{
 use super::*;use kurbo::Point;
 fn settings()->Settings{Settings{size:2.,ridges:3.,smooth:false,accuracy:1e-3,max_output_commands:Some(8192)}}
 fn line()->BezPath{let mut p=BezPath::new();p.move_to((0.,0.));p.line_to((100.,0.));p}
 fn close(a:f64,b:f64,budget:f64){assert!((a-b).abs()<=budget,"{a} vs {b}, budget{budget}");}
 #[test]fn analytic_line_and_phase(){let a=zigzag_paths(&[line()],settings()).unwrap();assert_eq!(a.commands,5);for (i,el)in a.paths[0].elements().iter().enumerate(){assert_eq!(el.end_point().unwrap(),Point::new(i as f64*25.,if i%2==0{2.}else{-2.}));}let b=zigzag_paths(&[line()],Settings{size:-2.,..settings()}).unwrap();assert_eq!(b.paths[0].elements()[0].end_point().unwrap(),Point::new(0.,-2.));}
 #[test]fn smooth_retains_original_tangent_handles(){let a=zigzag_paths(&[line()],Settings{smooth:true,..settings()}).unwrap();match a.paths[0].elements()[1]{PathEl::CurveTo(a,b,p)=>{assert_eq!(a,Point::new(9.,2.));assert_eq!(b,Point::new(16.,-2.));assert_eq!(p,Point::new(25.,-2.));},_=>panic!("expected real cubic")}}
 #[test]fn closed_bisectors_and_seam(){let mut p=BezPath::new();p.move_to((0.,0.));p.line_to((100.,0.));p.line_to((100.,100.));p.line_to((0.,100.));p.close_path();let a=zigzag_paths(&[p],Settings{size:1.,ridges:2.,..settings()}).unwrap();assert_eq!(a.commands,14);let q=a.paths[0].elements()[0].end_point().unwrap();close(q.x,1./2f64.sqrt(),1e-15);close(q.y,1./2f64.sqrt(),1e-15);assert_eq!(a.paths[0].elements()[12].end_point().unwrap(),q);assert_eq!(a.paths[0].elements()[13],PathEl::ClosePath);}
 #[test]fn quadratic_symmetric_arclength_reference(){let mut p=BezPath::new();p.move_to((0.,0.));p.quad_to((50.,100.),(100.,0.));let a=zigzag_paths(&[p],Settings{size:4.,ridges:1.,accuracy:1e-8,..settings()}).unwrap();let q=a.paths[0].elements()[1].end_point().unwrap();close(q.x,50.,2e-7);close(q.y,46.,2e-7);assert_eq!(a.commands,3);}
 #[test]fn original_rust_exact_for_supported_nonzero_domain(){let mut p=BezPath::new();p.move_to((1.,2.));p.quad_to((60.,100.),(120.,0.));p.curve_to((150.,-40.),(200.,80.),(250.,20.));p.move_to((300.,20.));p.line_to((350.,60.));p.line_to((400.,10.));p.close_path();for ridges in [0.,1.,2.5,10.]{for smooth in [false,true]{let cfg=Settings{ridges,smooth,..settings()};let a=zigzag_paths(&[p.clone()],cfg).unwrap();assert_eq!(a.paths,original::zigzag(&[p.clone()],cfg.size,ridges,smooth));}}}
 #[test]fn no_silent_upstream_1000_ridge_clamp(){let cfg=Settings{ridges:1100.,..settings()};let a=zigzag_paths(&[line()],cfg).unwrap();assert_eq!(a.commands,1102);assert_eq!(original::zigzag(&[line()],2.,1100.,false)[0].elements().len(),1002);}
 #[test]fn zero_size_exact_identity_and_point_contour_preservation(){let mut p=line();p.move_to((7.,9.));p.close_path();assert_eq!(zigzag_paths(&[p.clone()],Settings{size:0.,..settings()}).unwrap().paths,vec![p.clone()]);let q=zigzag_paths(&[p],settings()).unwrap();assert_eq!(q.preserved_degenerate_contours,1);assert_eq!(q.paths[0].elements()[5],PathEl::MoveTo(Point::new(7.,9.)));assert_eq!(q.paths[0].elements()[6],PathEl::ClosePath);}
 #[test]fn budget_and_numeric_domain_fail_before_partial_result(){for cfg in [Settings{ridges:9000.,..settings()},Settings{max_output_commands:Some(4),..settings()}]{assert!(zigzag_paths(&[line()],cfg).unwrap_err().starts_with("E_PA_ZIGZAG_BUDGET"));}for cfg in [Settings{ridges:-1.,..settings()},Settings{size:f64::NAN,..settings()},Settings{accuracy:0.,..settings()}]{assert!(zigzag_paths(&[line()],cfg).unwrap_err().starts_with("E_PA_ZIGZAG_PARAMETER"));}assert!(zigzag_paths(&[line()],Settings{ridges:1e100,..settings()}).unwrap_err().starts_with("E_PA_ZIGZAG_RANGE"));let mut p=BezPath::new();p.move_to((0.,0.));p.line_to((1e-10,0.));assert!(zigzag_paths(&[p],settings()).unwrap_err().starts_with("E_PA_ZIGZAG_PRECISION"));}
}
