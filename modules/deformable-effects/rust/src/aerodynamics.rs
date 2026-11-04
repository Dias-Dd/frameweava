// SPDX-License-Identifier: Apache-2.0
// Authored thin-face quadratic drag and prescribed surface traction in SI units.
// No Bullet/NvCloth/CFD engine implementation is copied. Existing C1 and XPBD remain.
use super::{Reader,put_u32,put_f64};
use super::xpbd::{add,sub,scale,cross,dot,norm,finite};
use std::collections::BTreeSet;

pub struct Aerodynamics {faces:Vec<[usize;3]>}
impl Aerodynamics {
    pub fn decode(input:&[u8],n:usize)->Result<Self,i32>{
        let mut r=Reader{data:input,at:0};if r.u32()?!=0x31434641{return Err(-4);}
        let count=r.u32()?;
        if count==0||input.len()!=8usize.checked_add(count.checked_mul(12).ok_or(-4)?).ok_or(-4)?{return Err(-4);}
        let mut faces=Vec::with_capacity(count);let mut seen=BTreeSet::new();
        for _ in 0..count {let ids=[r.u32()?,r.u32()?,r.u32()?];let mut sorted=ids;sorted.sort_unstable();
            if ids.iter().any(|i|*i>=n)||sorted[0]==sorted[1]||sorted[1]==sorted[2]||!seen.insert(sorted){return Err(-4);}faces.push(ids);
        }Ok(Self{faces})
    }
    pub fn work(&self,n:usize)->f64 {n as f64+self.faces.len() as f64*256.0}
    pub fn sample(&self,input:&[u8],output:&mut[u8],mass:&[f64],max_work:f64)->Result<usize,i32>{
        let n=mass.len();let capacity=80usize.checked_add(n.checked_mul(24).ok_or(-4)?).ok_or(-4)?;
        if output.len()<capacity{return Err(-5);}if self.work(n)>max_work{return Err(-6);}
        let mut r=Reader{data:input,at:0};if r.u32()?!=0x31534641||r.u32()?!=n||input.len()!=64+n*48{return Err(-4);}
        let density=r.f64()?;let normal_drag=r.f64()?;let tangent_drag=r.f64()?;let pressure=r.f64()?;let wind=r.point()?;
        if density<0.0||normal_drag<0.0||tangent_drag<0.0{return Err(-4);}
        let mut positions=Vec::with_capacity(n);let mut velocities=Vec::with_capacity(n);
        for _ in 0..n{positions.push(r.point()?);}for _ in 0..n{velocities.push(r.point()?);}
        let mut forces=vec![[0.0;3];n];let mut active=0usize;let mut degenerate=0usize;let mut power=0.0f64;
        for ids in &self.faces {
            let area_vector=cross(sub(positions[ids[1]],positions[ids[0]]),sub(positions[ids[2]],positions[ids[0]]));
            let twice_area=finite(norm(area_vector))?;
            if twice_area==0.0{degenerate+=1;continue;}
            let area=finite(twice_area*0.5)?;if area==0.0{return Err(-7);}
            let normal=area_vector.map(|x|x/twice_area);let mut force=scale(normal,finite(pressure*area)?);
            if density>0.0&&(normal_drag>0.0||tangent_drag>0.0){
                // Division before summation avoids overflowing a finite mean unnecessarily.
                let average=add(add(scale(velocities[ids[0]],1.0/3.0),scale(velocities[ids[1]],1.0/3.0)),scale(velocities[ids[2]],1.0/3.0));
                let relative=sub(wind,average);for x in relative{finite(x)?;}
                let un=finite(dot(relative,normal))?;let tangent=sub(relative,scale(normal,un));
                let q=finite(finite(density*0.5)?*area)?;if q==0.0{return Err(-7);}
                let normal_force=if normal_drag>0.0{scale(normal,finite(finite(q*normal_drag)?*finite(un*un.abs())?)?)}else{[0.0;3]};
                let tangent_force=if tangent_drag>0.0{scale(tangent,finite(finite(q*tangent_drag)?*finite(norm(tangent))?)?)}else{[0.0;3]};
                let drag=add(normal_force,tangent_force);for x in drag{finite(x)?;}
                power=finite(power+finite(dot(drag,relative))?)?;force=add(force,drag);
            }
            for x in force{finite(x)?;}if force.iter().any(|x|*x!=0.0){active+=1;}
            // Integrating linear shape functions over a flat triangle gives area/3.
            let share=scale(force,1.0/3.0);for i in ids{forces[*i]=add(forces[*i],share);for x in forces[*i]{finite(x)?;}}
        }
        let mut total=[0.0;3];let mut dynamic=[0.0;3];let mut max_acceleration=0.0f64;
        for (i,force) in forces.iter().enumerate(){total=add(total,*force);if mass[i]>0.0{dynamic=add(dynamic,*force);let a=scale(*force,mass[i]);for x in a{finite(x)?;}max_acceleration=max_acceleration.max(finite(norm(a))?);}}
        for x in total.into_iter().chain(dynamic){finite(x)?;}
        put_u32(output,0,0x31524641);put_u32(output,4,n);put_u32(output,8,active);put_u32(output,12,degenerate);
        for k in 0..3{put_f64(output,16+k*8,total[k]);put_f64(output,40+k*8,dynamic[k]);}
        put_f64(output,64,max_acceleration);put_f64(output,72,power);
        for (i,v) in forces.iter().flatten().enumerate(){put_f64(output,80+i*8,*v);}Ok(capacity)
    }
}
