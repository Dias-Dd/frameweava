// SPDX-License-Identifier: MIT
// Adapted from PositionBasedDynamics2.2.0, aa62c44f0d43956452e1f960a40333ec2d6d3ea5.
// Copyright (c) 2015-present, PositionBasedDynamics contributors.
// Original MIT text and exact sources are in vendor/pbd.
// f64 scalar adaptation: compliance instead of inverse stiffness; explicit numeric/degenerate
// errors instead of a fixed world/mass epsilon. Isometric Q is retained as coef*K*K^T,
// evaluated about a local anchor, avoiding cancellation of large absolute position products.
pub type V = [f64; 3];
pub fn sub(a: V, b: V) -> V { [a[0]-b[0],a[1]-b[1],a[2]-b[2]] }
pub fn scale(a: V, s: f64) -> V { [a[0]*s,a[1]*s,a[2]*s] }
pub fn dot(a: V, b: V) -> f64 { a[0]*b[0]+a[1]*b[1]+a[2]*b[2] }
pub fn add(a: V, b: V) -> V { [a[0]+b[0],a[1]+b[1],a[2]+b[2]] }
pub fn cross(a: V,b: V)->V {[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
pub fn norm(a: V)->f64 { a[0].hypot(a[1]).hypot(a[2]) }
pub fn finite(v: f64)->Result<f64,i32>{if v.is_finite(){Ok(v)}else{Err(-7)}}
fn alpha(compliance:f64,dt:f64)->Result<f64,i32>{let a=finite(compliance/(dt*dt))?;if a<0.0||compliance>0.0&&a==0.0{Err(-7)}else{Ok(a)}}
pub fn distance(p:[V;2],mass:[f64;2],rest:f64,compliance:f64,dt:f64,lambda:&mut f64)->Result<[V;2],i32>{
    let n=sub(p[0],p[1]);let d=finite(norm(n))?;if d==0.0{return Err(-9);}
    let c=d-rest;let a=alpha(compliance,dt)?;let k=finite(mass[0]+mass[1]+a)?;
    if k==0.0 {if c.abs()<=64.0*f64::EPSILON*(d+rest){return Ok([[0.0;3];2]);}return Err(-10);}
    let delta=finite(-(c+a*(*lambda))/k)?;*lambda=finite(*lambda+delta)?;
    let pt=scale(n,delta/d);let out=[scale(pt,mass[0]),scale(pt,-mass[1])];for v in out.iter().flatten(){finite(*v)?;}Ok(out)
}
// The pinned upstream solve_VolumeConstraint supplies cross products, but omits
// the 1/6 in the derivative of its signed volume. Explicitly corrected here;
// the unmodified source and its under-relaxation counterexample stay archived.
pub fn signed_volume(p:[V;4])->Result<f64,i32>{let determinant=finite(dot(cross(sub(p[1],p[0]),sub(p[2],p[0])),sub(p[3],p[0])))?;let volume=finite(determinant/6.0)?;if determinant!=0.0&&volume==0.0{return Err(-7);}Ok(volume)}
pub fn volume_gradients(p:[V;4])->Result<[V;4],i32>{let gradients=[cross(sub(p[1],p[2]),sub(p[3],p[2])),cross(sub(p[2],p[0]),sub(p[3],p[0])),cross(sub(p[0],p[1]),sub(p[3],p[1])),cross(sub(p[1],p[0]),sub(p[2],p[0]))].map(|v|scale(v,1.0/6.0));for x in gradients.iter().flatten(){finite(*x)?;}Ok(gradients)}
/// C is m^3, gradient m^2, compliance m^5/N. No fixed length/volume epsilon.
pub fn volume(p:[V;4],mass:[f64;4],rest:f64,compliance:f64,dt:f64,lambda:&mut f64)->Result<[V;4],i32>{
    let c=finite(signed_volume(p)?-rest)?;let gradients=volume_gradients(p)?;let a=alpha(compliance,dt)?;let mut denominator=a;for i in 0..4{denominator+=mass[i]*dot(gradients[i],gradients[i]);}finite(denominator)?;
    if denominator==0.0{if c==0.0{return Ok([[0.0;3];4]);}if mass.iter().all(|v|*v==0.0){return Err(-10);}if gradients.iter().flatten().all(|v|*v==0.0){return Err(-9);}return Err(-7);}
    let delta=finite(-(c+a*(*lambda))/denominator)?;let candidate_lambda=finite(*lambda+delta)?;let mut corrections=[[0.0;3];4];for i in 0..4{corrections[i]=scale(gradients[i],delta*mass[i]);for v in corrections[i]{finite(v)?;}}*lambda=candidate_lambda;Ok(corrections)
}
#[derive(Clone,Debug)]
pub struct Bend {pub k:[f64;4],pub coefficient:f64}
impl Bend {
    /** Input order: opposite0, opposite1, shared-edge0, shared-edge1, as upstream. */
    pub fn new(p:[V;4])->Result<Self,i32>{
        let x=[p[2],p[3],p[0],p[1]];let e0=sub(x[1],x[0]);let e1=sub(x[2],x[0]);let e2=sub(x[3],x[0]);let e3=sub(x[2],x[1]);let e4=sub(x[3],x[1]);
        let cot=|a:V,b:V|->Result<f64,i32>{let n=finite(norm(cross(a,b)))?;if n==0.0{return Err(-9);}finite(dot(a,b)/n)};
        let c01=cot(e0,e1)?;let c02=cot(e0,e2)?;let c03=cot(scale(e0,-1.0),e3)?;let c04=cot(scale(e0,-1.0),e4)?;
        let area=finite(0.5*norm(cross(e0,e1))+0.5*norm(cross(e0,e2)))?;if area==0.0{return Err(-9);}let coefficient=finite(-3.0/(2.0*area))?;
        let k=[c03+c04,c01+c02,-c01-c03,-c02-c04];for v in k {finite(v)?;}Ok(Self{k,coefficient})
    }
    fn energy_gradient(&self,p:[V;4])->Result<(f64,[V;4]),i32>{
        let x=[p[2],p[3],p[0],p[1]];let anchor=x[0];let mut sum=[0.0;3];for i in 0..4 {sum=add(sum,scale(sub(x[i],anchor),self.k[i]));}
        let energy=finite(0.5*self.coefficient*dot(sum,sum))?;let gradients=self.k.map(|k|scale(sum,self.coefficient*k));for v in gradients.iter().flatten(){finite(*v)?;}Ok((energy,gradients))
    }
    pub fn project(&self,p:[V;4],mass:[f64;4],rest_energy:f64,compliance:f64,dt:f64,lambda:&mut f64)->Result<[V;4],i32>{
        let (energy,gradient)=self.energy_gradient(p)?;let m=[mass[2],mass[3],mass[0],mass[1]];let a=alpha(compliance,dt)?;let mut denominator=a;for i in 0..4 {denominator+=m[i]*dot(gradient[i],gradient[i]);}finite(denominator)?;
        let c=energy-rest_energy;if denominator==0.0 {if c==0.0{return Ok([[0.0;3];4]);}return Err(-10);}
        let delta=finite(-(c+a*(*lambda))/denominator)?;*lambda=finite(*lambda+delta)?;
        let out=[scale(gradient[2],delta*m[2]),scale(gradient[3],delta*m[3]),scale(gradient[0],delta*m[0]),scale(gradient[1],delta*m[1])];for v in out.iter().flatten(){finite(*v)?;}Ok(out)
    }
    pub fn residual(&self,p:[V;4],target:f64)->Result<f64,i32>{Ok((self.energy_gradient(p)?.0-target).abs())}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn volume_gradient_matches_numerical_derivatives(){let p=[[0.3,-0.2,0.7],[1.4,0.2,-0.4],[-0.1,1.2,0.5],[0.4,-0.5,1.8]];let gradients=volume_gradients(p).unwrap();for i in 0..4{for k in 0..3{let mut a=p;let mut b=p;a[i][k]+=1e-6;b[i][k]-=1e-6;let d=(signed_volume(a).unwrap()-signed_volume(b).unwrap())/2e-6;assert!((gradients[i][k]-d).abs()<1e-9);}}}
    #[test] fn volume_one_free_vertex_matches_hard_and_compliant_analytic_solutions(){for compliance in [0.0,0.01]{let p=[[0.0;3],[1.0,0.0,0.0],[0.0,1.0,0.0],[0.0,0.0,2.0]];let mut lambda=0.0;let result=volume(p,[0.0,0.0,0.0,1.0],1.0/6.0,compliance,0.1,&mut lambda).unwrap();let expected=-1.0/(1.0+36.0*compliance/0.01);assert!((result[3][2]-expected).abs()<1e-14);assert_eq!(result[0],[0.0;3]);}}
    #[test] fn volume_rank_two_recovers_but_collinear_and_underflow_fail_explicitly(){let p=[[0.0;3],[1.0,0.0,0.0],[0.0,1.0,0.0],[0.0,0.0,0.0]];assert!(volume(p,[0.0,0.0,0.0,1.0],1.0/6.0,0.0,0.1,&mut 0.0).unwrap()[3][2]>0.9);assert_eq!(volume([[0.0;3];4],[1.0;4],1.0,0.0,0.1,&mut 0.0).unwrap_err(),-9);let tiny=p.map(|v|scale(v,1e-100));assert_eq!(volume(tiny,[1.0;4],1e-300,0.0,0.1,&mut 0.0).unwrap_err(),-7);}
    #[test] fn equal_mass_distance_and_heavy_mass_do_not_depend_on_a_fixed_epsilon(){for inv in [1.0,1e-10]{let mut l=0.0;let p=[[0.0,0.0,0.0],[2.0,0.0,0.0]];let c=distance(p,[inv,inv],1.0,0.0,1.0/24.0,&mut l).unwrap();assert!((c[0][0]-0.5).abs()<1e-15);assert!((c[1][0]+0.5).abs()<1e-15);}}
    #[test] fn compliance_and_lambda_have_physical_time_step_semantics(){let mut l=0.0;let c=distance([[0.0,0.0,0.0],[2.0,0.0,0.0]],[1.0,1.0],1.0,0.01,0.1,&mut l).unwrap();assert!((c[0][0]-1.0/3.0).abs()<1e-14);assert!((l+1.0/3.0).abs()<1e-14);}
    #[test] fn quadratic_bend_is_flat_and_translation_invariant(){let rest=[[-1.0,0.0,0.0],[1.0,0.0,0.0],[0.0,-1.0,0.0],[0.0,1.0,0.0]];let b=Bend::new(rest).unwrap();assert_eq!(b.residual(rest,0.0).unwrap(),0.0);let mut p=rest;p[0][2]=0.3;let mut lambda=0.0;let a=b.project(p,[1.0;4],0.0,0.001,0.01,&mut lambda).unwrap();let translated=p.map(|v|add(v,[1e7,-2e7,3e7]));let mut l2=0.0;let c=b.project(translated,[1.0;4],0.0,0.001,0.01,&mut l2).unwrap();for i in 0..4 {for j in 0..3 {assert!((a[i][j]-c[i][j]).abs()<1e-9);}}}
    #[test] fn singular_and_inconsistent_constraints_fail_instead_of_silent_skip(){assert_eq!(distance([[0.0;3];2],[1.0;2],1.0,0.0,0.01,&mut 0.0).unwrap_err(),-9);assert_eq!(distance([[0.0;3],[2.0,0.0,0.0]],[0.0;2],1.0,0.0,0.01,&mut 0.0).unwrap_err(),-10);assert!(Bend::new([[0.0;3];4]).is_err());}
}
