// SPDX-License-Identifier: Apache-2.0
#[path = "arap.rs"] mod arap;
#[path = "mesh-kernel.rs"] mod mesh_kernel;
#[path = "meshing.rs"] mod meshing;
use std::collections::BTreeSet;
struct Reader<'a> { data: &'a [u8], at: usize }
impl Reader<'_> {
    fn u32(&mut self) -> Result<usize,i32> { let end=self.at.checked_add(4).ok_or(-4)?; let b=self.data.get(self.at..end).ok_or(-4)?; self.at=end; Ok(u32::from_le_bytes(b.try_into().unwrap()) as usize) }
    fn f64(&mut self) -> Result<f64,i32> { let end=self.at.checked_add(8).ok_or(-4)?; let b=self.data.get(self.at..end).ok_or(-4)?; self.at=end; let v=f64::from_le_bytes(b.try_into().unwrap()); if v.is_finite() { Ok(v) } else { Err(-4) } }
    fn point(&mut self) -> Result<[f64;2],i32> { Ok([self.f64()?,self.f64()?]) }
}
// Private bytes-v1 operation 1: ARP1, n/t/pins/edges/refine u32, maxWork f64,
// XY f64, triangles u32, triangle weights f64, pins(u32,XY), edges(u32,u32,XY,weight).
// Output: n/u32, aggregate CG iterations/u32, max relative residual/f64, XY/f64.
pub fn run(op:u32,input:&[u8],output:&mut [u8])->Result<usize,i32>{
    if op==2 {return meshing::run(input,output);}
    if op!=1 { return Err(-3); }
    let mut r=Reader {data:input,at:0};
    if r.u32()?!=0x31505241 {return Err(-4);}
    let n=r.u32()?;let t=r.u32()?;let pins=r.u32()?;let edges=r.u32()?;let refine=r.u32()?;let budget=r.f64()?;
    let expected=32usize.checked_add(n.checked_mul(16).ok_or(-4)?).and_then(|v|v.checked_add(t.checked_mul(20)?)).and_then(|v|v.checked_add(pins.checked_mul(20)?)).and_then(|v|v.checked_add(edges.checked_mul(32)?)).ok_or(-4)?;
    if n<3||t==0||pins==0||pins>n||expected!=input.len()||budget<1.0||budget.fract()!=0.0 {return Err(-4);}
    let nf=n as f64;let tf=t as f64;let ef=edges as f64;
    let work=(8.0*nf+50.0)*(108.0*tf+4.0*nf+8.0*ef)+(refine as f64+1.0)*2.0*(4.0*nf+50.0)*(12.0*tf+2.0*nf+4.0*ef);
    if !work.is_finite()||work>budget {return Err(-6);}
    let required=16+n*16;if output.len()<required {return Err(-5);}
    let mut rest=Vec::with_capacity(n);for _ in 0..n {let p=r.point()?;if p.iter().any(|x|x.abs()>1e9){return Err(-4);}rest.push(p);}
    let mut tris=Vec::with_capacity(t);let mut used=vec![false;n];
    for _ in 0..t {let tri=[r.u32()?,r.u32()?,r.u32()?];if tri.iter().any(|i|*i>=n)||tri[0]==tri[1]||tri[1]==tri[2]||tri[2]==tri[0]{return Err(-4);}
        let [a,b,c]=tri.map(|i|rest[i]);let e=[b[0]-a[0],b[1]-a[1]];let f=[c[0]-a[0],c[1]-a[1]];let cross=(e[0]*f[1]-e[1]*f[0]).abs();let mut longest=0f64;
        for (i,j) in [(0,1),(1,2),(2,0)] {let p=rest[tri[i]];let q=rest[tri[j]];let len=(p[0]-q[0]).powi(2)+(p[1]-q[1]).powi(2);if len<=1e-18 {return Err(-4);}longest=longest.max(len);}
        if cross<=longest*1e-12 {return Err(-4);}for i in tri {used[i]=true;}tris.push(tri);
    }
    if used.iter().any(|u|!*u){return Err(-4);}
    let mut weights=Vec::with_capacity(t);for _ in 0..t {let w=r.f64()?;if w<=0.0||w>1e9{return Err(-4);}weights.push(w);}
    let mut h=arap::Handles::default();let mut fixed=BTreeSet::new();
    for _ in 0..pins {let i=r.u32()?;let p=r.point()?;if i>=n||!fixed.insert(i)||p.iter().any(|x|x.abs()>1e9){return Err(-4);}h.fixed.push((i,p));}
    for _ in 0..edges {let i=r.u32()?;let j=r.u32()?;let vec=r.point()?;let weight=r.f64()?;if i>=n||j>=n||i==j||weight<=0.0||weight>1e9||vec.iter().any(|x|x.abs()>1e9){return Err(-4);}h.edges.push(arap::EdgeTarget{i,j,vec,weight});}
    // A pin must anchor every topological component, even if a soft edge joins components.
    let mut parent:Vec<usize>=(0..n).collect();fn root(p:&mut[usize],mut i:usize)->usize{while p[i]!=i {p[i]=p[p[i]];i=p[i];}i}
    for tri in &tris {let a=root(&mut parent,tri[0]);for i in [tri[1],tri[2]]{let b=root(&mut parent,i);parent[b]=a;}}
    let anchored:BTreeSet<usize>=fixed.iter().map(|i|root(&mut parent,*i)).collect();for i in 0..n {if !anchored.contains(&root(&mut parent,i)){return Err(-4);}}
    let mut stats=arap::Diagnostics::default();let positions=arap::deform(&rest,&tris,&weights,&h,refine,&mut stats).map_err(|_|-7)?;
    if positions.iter().flatten().any(|v|!v.is_finite()||v.abs()>1e9)||stats.iterations>u32::MAX as usize {return Err(-7);}
    output[0..4].copy_from_slice(&(n as u32).to_le_bytes());output[4..8].copy_from_slice(&(stats.iterations as u32).to_le_bytes());output[8..16].copy_from_slice(&stats.max_relative_residual.to_le_bytes());
    for (i,value) in positions.iter().flatten().enumerate(){output[16+i*8..24+i*8].copy_from_slice(&value.to_le_bytes());}Ok(required)
}
