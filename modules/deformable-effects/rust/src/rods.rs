// SPDX-License-Identifier: MIT
// PositionBasedDynamics 2.2.0 aa62c44f0d43956452e1f960a40333ec2d6d3ea5.
// Copyright (c) 2015-present, PositionBasedDynamics contributors.
// Scalar f64 adaptation of the two fixed Cosserat PBD functions. This is PBD,
// not XPBD: local dimensionless stiffness and the original 1e-6 regularizers.
// Existing Core Runner owns all orientation/integration/checkpoint state.
use super::{contacts,put_f64,put_u32,Reader};
use super::xpbd::{V,add,sub,scale,norm,finite};
pub type Q=[f64;4]; // Graphics x,y,z,w; Eigen construction is w,x,y,z.
pub const HEADER:usize=72;
pub fn multiply(a:Q,b:Q)->Q{[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]]}
pub fn conjugate(q:Q)->Q{[-q[0],-q[1],-q[2],q[3]]}
fn square(q:Q)->f64{q[0]*q[0]+q[1]*q[1]+q[2]*q[2]+q[3]*q[3]}
fn checked(q:Q)->Result<Q,i32>{for v in q{finite(v)?;}if (square(q)-1.0).abs()>1e-9{return Err(-4);}Ok(q)}
fn unit(q:Q,reference:Q)->Result<Q,i32>{let length=finite(q[0].hypot(q[1]).hypot(q[2]).hypot(q[3]))?;if length==0.0{return Err(-7);}let mut q=q.map(|v|v/length);if q.iter().zip(reference).map(|(a,b)|a*b).sum::<f64>()<0.0{q=q.map(|v|-v);}checked(q)}
fn rotate(q:Q,v:V)->V{let [x,y,z,w]=q;[(1.0-2.0*(y*y+z*z))*v[0]+2.0*(x*y-w*z)*v[1]+2.0*(x*z+w*y)*v[2],2.0*(x*y+w*z)*v[0]+(1.0-2.0*(x*x+z*z))*v[1]+2.0*(y*z-w*x)*v[2],2.0*(x*z-w*y)*v[0]+2.0*(y*z+w*x)*v[1]+(1.0-2.0*(x*x+y*y))*v[2]]}
pub fn director(q:Q)->V{[2.0*(q[0]*q[2]+q[3]*q[1]),2.0*(q[1]*q[2]-q[3]*q[0]),q[3]*q[3]-q[0]*q[0]-q[1]*q[1]+q[2]*q[2]]}
pub fn stretch(p:[V;2],mass:[f64;2],q:Q,wq:f64,stiffness:V,length:f64)->Result<([V;2],Q),i32>{
 let denominator=finite((mass[0]+mass[1])/length+wq*4.0*length+1e-6)?;if denominator<=0.0{return Err(-7);}
 let mut gamma=scale(sub(scale(sub(p[1],p[0]),1.0/length),director(q)),1.0/denominator);
 if (stiffness[0]-stiffness[1]).abs()<1e-6&&(stiffness[0]-stiffness[2]).abs()<1e-6{for i in 0..3{gamma[i]*=stiffness[i];}}
 else{gamma=rotate(conjugate(q),gamma);for i in 0..3{gamma[i]*=stiffness[i];}gamma=rotate(q,gamma);}
 let dq=multiply([gamma[0],gamma[1],gamma[2],0.0],[-q[1],q[0],-q[3],q[2]]).map(|v|v*2.0*wq*length);
 let dp=[scale(gamma,mass[0]),scale(gamma,-mass[1])];for v in dp.iter().flatten().chain(dq.iter()){finite(*v)?;}Ok((dp,dq))
}
fn difference(q0:Q,q1:Q,rest:Q)->Q{let q=multiply(conjugate(q0),q1);let minus=std::array::from_fn(|i|q[i]-rest[i]);let plus=std::array::from_fn(|i|q[i]+rest[i]);if square(minus)>square(plus){plus}else{minus}}
pub fn bend(q:[Q;2],mass:[f64;2],stiffness:V,rest:Q)->Result<[Q;2],i32>{let mut omega=difference(q[0],q[1],rest);let denominator=finite(mass[0]+mass[1]+1e-6)?;for i in 0..3{omega[i]*=stiffness[i]/denominator;}omega[3]=0.0;let dq=[multiply(q[1],omega).map(|v|v*mass[0]),multiply(q[0],omega).map(|v|v*-mass[1])];for v in dq.iter().flatten(){finite(*v)?;}Ok(dq)}
pub struct Rod {pub edges:usize,pub closed:bool,lengths:Vec<f64>,mass:Vec<f64>,stretch:Vec<V>,rest:Vec<Q>,bending:Vec<V>}
impl Rod {
 pub fn decode(input:&[u8],particles:usize)->Result<Self,i32>{let mut r=Reader{data:input,at:0};if r.u32()?!=0x31444f52{return Err(-4);}let edges=r.u32()?;let closed=r.u32()?;if r.u32()?!=0||closed>1||particles<2||closed==1&&particles<3||edges!=if closed==1{particles}else{particles-1}{return Err(-4);}let bends=if closed==1{edges}else{edges-1};let size=16usize.checked_add(edges.checked_mul(72).ok_or(-4)?).and_then(|v|v.checked_add(bends.checked_mul(56)?)).ok_or(-4)?;if size!=input.len(){return Err(-4);}
  let mut lengths=vec![];let mut mass=vec![];let mut stretching=vec![];for _ in 0..edges{let length=r.f64()?;let w=r.f64()?;if length<=0.0||w<0.0{return Err(-4);}let _rest_q=read_q(&mut r)?;let ks=r.point()?;if ks.iter().any(|v|*v<0.0||*v>1.0){return Err(-4);}lengths.push(length);mass.push(w);stretching.push(ks);}
  let mut rest=vec![];let mut bending=vec![];for _ in 0..bends{let mut q=read_q(&mut r)?;if q[3]<0.0{q=q.map(|v|-v);}let ks=r.point()?;if ks.iter().any(|v|*v<0.0||*v>1.0){return Err(-4);}rest.push(q);bending.push(ks);}
  Ok(Self{edges,closed:closed==1,lengths,mass,stretch:stretching,rest,bending})
 }
 pub fn constraints(&self)->usize{self.edges+self.rest.len()}
 pub fn work(&self,particles:usize,iterations:usize,collision:Option<&contacts::Config>)->f64{((particles+self.edges*256+self.rest.len()*128)as f64)*iterations.max(1) as f64+collision.map_or(0.0,|c|c.work(0,iterations))}
 pub fn capacity(&self,particles:usize,collision:Option<&contacts::Config>)->Result<usize,i32>{let contacts=collision.map_or(0,|c|particles.checked_mul(c.colliders.len()).unwrap_or(usize::MAX).min(c.max_contacts));HEADER.checked_add(particles.checked_mul(48).ok_or(-4)?).and_then(|v|v.checked_add(self.edges.checked_mul(32)?)).and_then(|v|v.checked_add(contacts.checked_mul(contacts::STRIDE)?)).ok_or(-4)}
 pub fn project(&self,input:&[u8],output:&mut[u8],mass:&[f64],max_work:f64,collision:Option<&contacts::Config>,measure:bool)->Result<usize,i32>{
  let n=mass.len();if self.edges!=if self.closed{n}else{n-1}{return Err(-4);}if output.len()<self.capacity(n,collision)?{return Err(-5);}let mut r=Reader{data:input,at:0};if r.u32()?!=0x31504452{return Err(-4);}let iterations=r.u32()?;let dt=r.f64()?;if dt<=0.0||measure&&iterations!=0||!measure&&iterations==0||input.len()!=16+n*72+self.edges*32{return Err(-4);}if self.work(n,iterations,collision)>max_work{return Err(-6);}
  let mut positions=vec![];let mut previous=vec![];let mut incoming=vec![];for _ in 0..n{positions.push(r.point()?);}for _ in 0..n{previous.push(r.point()?);}for _ in 0..n{incoming.push(r.point()?);}let mut quaternions=vec![];for _ in 0..self.edges{quaternions.push(read_q(&mut r)?);}
  let mut solver=collision.map(|c|contacts::Solver::new(c,&previous,&incoming,mass,dt));if let Some(s)=&mut solver{s.generate(&positions)?;}
  for _ in 0..iterations{
   for i in 0..self.edges{let j=(i+1)%n;let (dp,dq)=stretch([positions[i],positions[j]],[mass[i],mass[j]],quaternions[i],self.mass[i],self.stretch[i],self.lengths[i])?;positions[i]=add(positions[i],dp[0]);positions[j]=add(positions[j],dp[1]);if self.mass[i]>0.0{quaternions[i]=unit(std::array::from_fn(|k|quaternions[i][k]+dq[k]),quaternions[i])?;}}
   for i in 0..self.rest.len(){let j=(i+1)%self.edges;let dq=bend([quaternions[i],quaternions[j]],[self.mass[i],self.mass[j]],self.bending[i],self.rest[i])?;let a=quaternions[i];let b=quaternions[j];if self.mass[i]>0.0{quaternions[i]=unit(std::array::from_fn(|k|a[k]+dq[0][k]),a)?;}if self.mass[j]>0.0{quaternions[j]=unit(std::array::from_fn(|k|b[k]+dq[1][k]),b)?;}}
   if let Some(s)=&mut solver{s.project(&mut positions)?;}
  }
  if !measure{if let Some(s)=&mut solver{for _ in 0..iterations{if s.position_residual(&positions)?<=collision.unwrap().tolerance{break;}s.project(&mut positions)?;}}}
  let (velocities,penetration,normal)=if let Some(s)=&mut solver{if measure{let(p,v)=s.measure(&positions)?;(incoming.clone(),p,v)}else{s.velocities(&positions,iterations)?}}else if measure{(incoming.clone(),0.0,0.0)}else{let v:Vec<V>=positions.iter().zip(&previous).map(|(p,q)|scale(sub(*p,*q),1.0/dt)).collect();(v,0.0,0.0)};
  let mut distance=0.0f64;let mut shear=0.0f64;let mut bending=0.0f64;let mut twist=0.0f64;for i in 0..self.edges{let delta=sub(positions[(i+1)%n],positions[i]);distance=distance.max((norm(delta)-self.lengths[i]).abs());shear=shear.max(norm(sub(scale(delta,1.0/self.lengths[i]),director(quaternions[i]))));}for i in 0..self.rest.len(){let d=difference(quaternions[i],quaternions[(i+1)%self.edges],self.rest[i]);bending=bending.max(d[0].hypot(d[1]));twist=twist.max(d[2].abs());}
  for v in positions.iter().flatten().chain(velocities.iter().flatten()).chain(quaternions.iter().flatten()){finite(*v)?;}for v in [distance,shear,bending,twist,penetration,normal]{finite(v)?;}
  let count=solver.as_ref().map_or(0,|s|s.contacts.len());for(i,v)in[0x31524452,n,self.edges,iterations,count,usize::from(collision.is_some())].iter().enumerate(){put_u32(output,i*4,*v);}for(i,v)in[distance,shear,bending,twist,penetration,normal].iter().enumerate(){put_f64(output,24+i*8,*v);}
  let mut at=HEADER;for v in positions.iter().flatten().chain(velocities.iter().flatten()).chain(quaternions.iter().flatten()){put_f64(output,at,*v);at+=8;}if let Some(s)=&solver{s.write(output,at,&positions);}Ok(at+count*contacts::STRIDE)
 }
}
fn read_q(r:&mut Reader)->Result<Q,i32>{checked([r.f64()?,r.f64()?,r.f64()?,r.f64()?])}
