// SPDX-License-Identifier: MIT
// Adapted from pinned PBD2.2.0 solve_DihedralConstraint (Bridson angle gradients).
// Copyright (c) 2015-present, PositionBasedDynamics contributors. Full MIT in vendor/pbd.
// Signed atan2 angle, local scaling, XPBD compliance/lambda, movable edge vertices
// and explicit errors replace unsigned acos/PBD stiffness/early fixed-vertex skip.
use super::xpbd::{V,sub,scale,dot,cross,norm,finite,add};
use std::f64::consts::{PI,TAU};

pub fn difference(angle:f64,target:f64)->f64 {
    let mut delta=(angle-target)%TAU;
    if delta>=PI {delta-=TAU;} else if delta< -PI {delta+=TAU;}
    delta
}
/// Opposite0, opposite1, common-edge0, common-edge1. Flat consistently oriented faces => 0.
pub fn geometry(p:[V;4])->Result<(f64,[V;4]),i32>{
    let relative=p.map(|v|sub(v,p[2]));
    let mut magnitude=0.0f64;
    for v in relative.iter().flatten(){finite(*v)?;magnitude=magnitude.max(v.abs());}
    if magnitude==0.0{return Err(-9);}
    let x=relative.map(|v|v.map(|n|n/magnitude));
    let edge=sub(x[3],x[2]);let length=finite(norm(edge))?;
    if length==0.0{return Err(-9);}
    let axis=scale(edge,1.0/length);
    let normal0=cross(sub(x[2],x[0]),sub(x[3],x[0]));
    let normal1=cross(sub(x[3],x[1]),sub(x[2],x[1]));
    let area0=finite(norm(normal0))?;let area1=finite(norm(normal1))?;
    if area0==0.0||area1==0.0{return Err(-9);}
    let n0=normal0.map(|v|v/area0);let n1=normal1.map(|v|v/area1);
    let sine=finite(dot(axis,cross(n0,n1)))?;let cosine=finite(dot(n0,n1))?.clamp(-1.0,1.0);
    let angle=difference(sine.atan2(cosine),0.0);
    let d0=scale(n0,length/area0);let d1=scale(n1,length/area1);
    let d2=add(scale(n0,dot(sub(x[0],x[3]),axis)/area0),scale(n1,dot(sub(x[1],x[3]),axis)/area1));
    let d3=add(scale(n0,dot(sub(x[2],x[0]),axis)/area0),scale(n1,dot(sub(x[2],x[1]),axis)/area1));
    let gradients=[d0,d1,d2,d3].map(|v|v.map(|a|-a/magnitude));
    for v in gradients.iter().flatten(){finite(*v)?;}
    Ok((angle,gradients))
}
/// Constraint C is radians, gradient rad/m; compliance rad/(N*m), not distance compliance.
pub fn project(p:[V;4],mass:[f64;4],target:f64,compliance:f64,dt:f64,lambda:&mut f64)->Result<[V;4],i32>{
    let (angle,gradients)=geometry(p)?;let c=difference(angle,target);
    let alpha=finite(compliance/(dt*dt))?;
    if alpha<0.0||compliance>0.0&&alpha==0.0{return Err(-7);}
    let mut denominator=alpha;
    for i in 0..4{denominator+=mass[i]*dot(gradients[i],gradients[i]);}finite(denominator)?;
    if denominator==0.0 {if c==0.0{return Ok([[0.0;3];4]);}return Err(-10);}
    let delta=finite(-(c+alpha*(*lambda))/denominator)?;
    let candidate=finite(*lambda+delta)?;let mut result=[[0.0;3];4];
    for i in 0..4{result[i]=scale(gradients[i],delta*mass[i]);for v in result[i]{finite(v)?;}}
    *lambda=candidate;Ok(result)
}

#[cfg(test)]mod tests {
    use super::*;
    fn fixture()->[V;4]{[[0.1,1.1,0.3],[-0.2,-0.8,-0.1],[-1.0,0.1,0.0],[1.2,-0.1,0.2]]}
    #[test]fn gradients_match_independent_central_differences_and_rigid_null_modes(){
        let p=fixture();let (_,g)=geometry(p).unwrap();
        for i in 0..4{for k in 0..3{let mut a=p;let mut b=p;a[i][k]+=1e-6;b[i][k]-=1e-6;let expected=difference(geometry(a).unwrap().0,geometry(b).unwrap().0)/2e-6;assert!((expected-g[i][k]).abs()<3e-10,"{i}/{k}: {expected} vs {}",g[i][k]);}}
        let mut translation=[0.0;3];let mut rotation=[0.0;3];for i in 0..4{translation=add(translation,g[i]);rotation=add(rotation,cross(p[i],g[i]));}assert!(norm(translation)<1e-14);assert!(norm(rotation)<1e-14);
    }
    #[test]fn signed_and_small_angles_and_wrapped_branch_are_explicit(){
        let mut p=[[0.0,1.0,0.0],[0.0,-1.0,0.0],[-1.0,0.0,0.0],[1.0,0.0,0.0]];
        assert_eq!(geometry(p).unwrap().0,0.0);p[0][2]=1e-10;assert!((geometry(p).unwrap().0+1e-10).abs()<1e-24);p[0][2]=-0.5;assert!(geometry(p).unwrap().0>0.0);
        assert_eq!(difference(PI,-PI),0.0);assert_eq!(difference(PI,0.0),-PI);assert!((difference(-PI+0.01,PI-0.02)-0.03).abs()<1e-14);
    }
    #[test]fn free_edge_vertices_are_not_silently_skipped_and_compliance_is_xpbd(){
        let p=fixture();let mut lambda=0.0;let c=geometry(p).unwrap().0;let correction=project(p,[0.0,0.0,1.0,1.0],0.0,0.0,0.01,&mut lambda).unwrap();assert!(norm(correction[2])+norm(correction[3])>0.0);let next=std::array::from_fn(|i|add(p[i],correction[i]));assert!(geometry(next).unwrap().0.abs()<c.abs());
        let (_,g)=geometry(p).unwrap();let mass=[1.0,2.0,3.0,4.0];let alpha=0.003/0.01f64.powi(2);let den=alpha+(0..4).map(|i|mass[i]*dot(g[i],g[i])).sum::<f64>();let mut previous=0.05;let expected=-(c+alpha*previous)/den;project(p,mass,0.0,0.003,0.01,&mut previous).unwrap();assert!((previous-(0.05+expected)).abs()<1e-15);
    }
    #[test]fn relative_geometry_scales_without_world_epsilon_and_rejects_degenerate_faces(){
        let p=fixture();let (angle,g)=geometry(p).unwrap();for factor in [1e-9,1e9]{let q=p.map(|v|scale(v,factor));let (a,h)=geometry(q).unwrap();assert!((a-angle).abs()<1e-14);for i in 0..4{for k in 0..3{assert!((h[i][k]*factor-g[i][k]).abs()<1e-13);}}}
        assert_eq!(geometry([[0.0;3];4]).unwrap_err(),-9);let mut bad=p;bad[3]=bad[2];assert_eq!(geometry(bad).unwrap_err(),-9);
    }
}
