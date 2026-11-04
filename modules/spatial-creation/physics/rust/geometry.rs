// SPDX-License-Identifier: Apache-2.0
// Closest segments: scalar f64 adaptation of pinned Parry3d-f64 0.31.1
// closest_points_segment_segment.rs (Apache-2.0, Dimforge contributors).
// Triangle barycentric/edge distance adapts pinned PBD 2.2.0 (MIT); all
// boundary edges are compared, instead of the original first-negative branch.
use super::xpbd::{V,add,sub,scale,dot,norm,cross};
pub fn lerp(a:V,b:V,t:f64)->V{add(a,scale(sub(b,a),t))}
pub fn segment(p:V,a:V,b:V)->(V,f64){let d=sub(b,a);let den=dot(d,d);let t=if den==0.0{0.0}else{(dot(sub(p,a),d)/den).clamp(0.0,1.0)};(lerp(a,b,t),t)}
pub fn triangle(p:V,a:V,b:V,c:V)->(V,[f64;3]){
 let ab=sub(b,a);let ac=sub(c,a);let ap=sub(p,a);let aa=dot(ab,ab);let bb=dot(ab,ac);let cc=dot(ac,ac);let det=aa*cc-bb*bb;
 if det>0.0{let d=dot(ap,ab);let e=dot(ap,ac);let s=(d*cc-bb*e)/det;let t=(aa*e-bb*d)/det;if s>=0.0&&t>=0.0&&s+t<=1.0{return(add(add(a,scale(ab,s)),scale(ac,t)),[1.0-s-t,s,t]);}}
 let (q0,t0)=segment(p,a,b);let (q1,t1)=segment(p,b,c);let (q2,t2)=segment(p,c,a);let candidates=[(q0,[1.0-t0,t0,0.0]),(q1,[0.0,1.0-t1,t1]),(q2,[t2,0.0,1.0-t2])];let mut best=candidates[0];let mut dist=norm(sub(p,best.0));for v in candidates.into_iter().skip(1){let d=norm(sub(p,v.0));if d<dist{best=v;dist=d;}}best
}
pub fn edges(a0:V,a1:V,b0:V,b1:V)->(V,V,f64,f64){
 let d1=sub(a1,a0);let d2=sub(b1,b0);let r=sub(a0,b0);let a=dot(d1,d1);let e=dot(d2,d2);let f=dot(d2,r);let (mut s,mut t);
 if a==0.0&&e==0.0{s=0.0;t=0.0;}else if a==0.0{s=0.0;t=(f/e).clamp(0.0,1.0);}else{let c=dot(d1,r);if e==0.0{t=0.0;s=(-c/a).clamp(0.0,1.0);}else{let b=dot(d1,d2);let ae=a*e;let bb=b*b;let den=ae-bb;s=if den>32.0*f64::EPSILON*ae.max(bb){((b*f-c*e)/den).clamp(0.0,1.0)}else{0.0};t=(b*s+f)/e;if t<0.0{t=0.0;s=(-c/a).clamp(0.0,1.0);}else if t>1.0{t=1.0;s=((b-c)/a).clamp(0.0,1.0);}}}
 (lerp(a0,a1,s),lerp(b0,b1,t),s,t)
}
pub fn unit(v:V,fallback:V)->V{let d=norm(v);if d>0.0{scale(v,1.0/d)}else{let d=norm(fallback);if d>0.0{scale(fallback,1.0/d)}else{[1.0,0.0,0.0]}}}
pub fn bounds(previous:&[V],current:&[V],ids:&[usize],pad:f64)->([f64;3],[f64;3]){let mut min=[f64::INFINITY;3];let mut max=[f64::NEG_INFINITY;3];for &id in ids{for p in [previous[id],current[id]]{for k in 0..3{min[k]=min[k].min(p[k]-pad);max[k]=max[k].max(p[k]+pad);}}}(min,max)}
pub fn overlaps(a:(V,V),b:(V,V))->bool{(0..3).all(|k|a.0[k]<=b.1[k]&&b.0[k]<=a.1[k])}
/// Conservative separating-plane advancement for linearly swept convex features.
/// At each closest pair, bound the maximum vertex closing speed along its
/// separating normal. Unlike a full speed-norm bound, pure tangential motion
/// cannot force arbitrarily small advancement. No uniform temporal sampling.
pub fn impact<F:Fn(f64)->(V,[f64;4]),C:Fn(V)->f64,T:FnMut()->Result<(),i32>>(distance:F,closing:C,thickness:f64,tolerance:f64,iterations:usize,mut tick:T)->Result<Option<(f64,V,[f64;4])>,i32>{
 let mut t=0.0;for _ in 0..iterations{tick()?;let (delta,weights)=distance(t);let d=norm(delta);if !d.is_finite(){return Err(-7);}if d<=thickness+tolerance{return Ok(Some((t,delta,weights)));}let speed=closing(scale(delta,1.0/d));if speed<=0.0{return Ok(None);}let advance=(d-thickness)/speed;if !advance.is_finite(){return Ok(None);}let next=t+advance;if next>1.0{return Ok(None);}if next==t{return Err(-21);}t=next;}
 Err(-21)
}
pub fn triangle_normal(p:[V;3])->V{cross(sub(p[1],p[0]),sub(p[2],p[0]))}
