// Original radial rotation/Jacobian from EffectCraft ops.rs, fixed861c51f8, MIT OR Apache-2.0.
// Thin normalization removes radius-scale overflow; stable unit dot and exact r0 replace epsilon.
use kurbo::{CubicBez,Point,Vec2};
fn perp(v:Vec2)->Vec2{Vec2::new(-v.y,v.x)}
fn rot(v:Vec2,theta:f64)->Vec2{let (s,c)=theta.sin_cos();Vec2::new(v.x*c-v.y*s,v.x*s+v.y*c)}
pub fn map(p:Point,angle:f64)->Point{let v=p.to_vec2();rot(v,angle*v.hypot()).to_point()}
pub fn jac(p:Point,dv:Vec2,angle:f64)->Vec2{
 let v=p.to_vec2();let r=v.hypot();let mut w=dv;
 if r>0.{w+=perp(v)*(angle*(v/r).dot(dv));}
 rot(w,angle*r)
}
/// Same endpoint/derivative-matched Hermite controls as the original twist implementation.
pub fn hermite(c:CubicBez,angle:f64)->CubicBez{
 let p0=map(c.p0,angle);let p3=map(c.p3,angle);
 CubicBez::new(p0,p0+jac(c.p0,c.p1-c.p0,angle),p3+jac(c.p3,c.p2-c.p3,angle),p3)
}
