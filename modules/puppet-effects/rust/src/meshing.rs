// SPDX-License-Identifier: Apache-2.0
// Bounded adapter over fixed EffectCraft geometry, using the unchanged C1 bytes ABI.
use super::{Reader,mesh_kernel as k};
use std::collections::{BTreeMap,BTreeSet};
pub struct Work {pub used:u64,pub limit:u64}
impl Work {pub fn add(&mut self,n:u64)->Result<(),i32>{self.used=self.used.checked_add(n).ok_or(-8)?;if self.used>self.limit{Err(-8)}else{Ok(())}}}
fn integer(v:f64)->Result<u64,i32>{if v<1.0||v>9007199254740991.0||v.fract()!=0.0{Err(-4)}else{Ok(v as u64)}}
fn edges(poly:&[[f64;2]])->impl Iterator<Item=([f64;2],[f64;2])>+'_ {(0..poly.len()).map(|i|(poly[i],poly[(i+1)%poly.len()]))}
fn distance(poly:&[[f64;2]],p:[f64;2])->f64{edges(poly).map(|(a,b)|{let dx=b[0]-a[0];let dy=b[1]-a[1];let t=(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)).clamp(0.0,1.0);(p[0]-a[0]-t*dx).powi(2)+(p[1]-a[1]-t*dy).powi(2)}).fold(f64::MAX,f64::min)}
fn key(a:usize,b:usize)->(usize,usize){(a.min(b),a.max(b))}
fn compensated(values:impl Iterator<Item=f64>)->f64{let mut sum=0.0;let mut correction=0.0;for x in values{let y=x-correction;let next=sum+y;correction=(next-sum)-y;sum=next;}sum}
struct Limits {vertices:usize,triangles:usize,contours:usize,pixels:usize,bytes:u64}
struct Contour {points:Vec<[f64;2]>,hole:bool,component:usize}
struct ResultMesh {vertices:Vec<[f64;2]>,components:Vec<usize>,triangles:Vec<[usize;3]>,contours:Vec<Contour>,component_count:usize,area:f64}
fn triangulate(loops:Vec<Vec<[f64;2]>>,edge:f64,tolerance:f64,holes:usize,limits:&Limits,work:&mut Work)->Result<ResultMesh,i32>{
 let mut contours=Vec::new();for original in loops{
  let hole=k::signed_area(&original)<0.0;
  if hole&&holes==2{return Err(-10);}
  let p=if tolerance>0.0{work.add((original.len() as u64).saturating_mul(original.len() as u64)*2)?;k::simplify(&original,tolerance)}else{original};
  if p.len()<3||!k::signed_area(&p).is_finite()||(k::signed_area(&p)<0.0)!=hole||k::signed_area(&p)==0.0{return Err(-9);}
  contours.push(Contour{points:p,hole,component:usize::MAX});
 }
 let outer:Vec<usize>=contours.iter().enumerate().filter_map(|(i,c)|(!c.hole).then_some(i)).collect();
 for (component,i) in outer.iter().enumerate(){contours[*i].component=component;}
 for i in 0..contours.len(){if !contours[i].hole{continue;}let p=contours[i].points[0];work.add(outer.iter().map(|o|contours[*o].points.len() as u64).sum())?;
  let owner=outer.iter().filter(|o|k::inside(&contours[**o].points,p)).min_by(|a,b|k::signed_area(&contours[**a].points).abs().total_cmp(&k::signed_area(&contours[**b].points).abs())).ok_or(-9)?;contours[i].component=contours[*owner].component;
 }
 let mut result=ResultMesh{vertices:vec![],components:vec![],triangles:vec![],contours,component_count:outer.len(),area:0.0};
 for (component,outer_index) in outer.iter().enumerate(){
  let boundary_indices:Vec<usize>=std::iter::once(*outer_index).chain(result.contours.iter().enumerate().filter_map(|(i,c)|(c.hole&&c.component==component&&holes==0).then_some(i))).collect();
  let mut polygons=Vec::new();let mut points=Vec::new();let mut constraints=Vec::new();
  for index in boundary_indices{
   let poly=&result.contours[index].points;let count=edges(poly).try_fold(0usize,|total,(a,b)|{let n=((b[0]-a[0]).hypot(b[1]-a[1])/edge).ceil().max(1.0);if !n.is_finite()||n>limits.vertices as f64{return Err(-8);}total.checked_add(n as usize).ok_or(-8)})?;
   if count+points.len()+result.vertices.len()>limits.vertices{return Err(-8);}work.add(count as u64*8)?;let dense=k::densify(poly,edge);let start=points.len();constraints.extend((0..dense.len()).map(|i|(start+i,start+(i+1)%dense.len())));points.extend_from_slice(&dense);polygons.push(dense);
  }
  let poly=&polygons[0];let area=k::signed_area(poly).abs()-polygons.iter().skip(1).map(|p|k::signed_area(p).abs()).sum::<f64>();if area<=0.0||!area.is_finite(){return Err(-9);}
  let min_x=poly.iter().map(|p|p[0]).fold(f64::MAX,f64::min);let max_x=poly.iter().map(|p|p[0]).fold(f64::MIN,f64::max);let min_y=poly.iter().map(|p|p[1]).fold(f64::MAX,f64::min);let max_y=poly.iter().map(|p|p[1]).fold(f64::MIN,f64::max);let dy=edge*3.0f64.sqrt()*0.5;
  let columns=((max_x-min_x)/edge).ceil()+1.0;let rows=((max_y-min_y)/dy).ceil()+1.0;let candidates=columns*rows;let boundaries=points.len();if !candidates.is_finite()||candidates>work.limit as f64{return Err(-8);}work.add((candidates as u64).saturating_mul(boundaries as u64*4+8))?;
  let inside=|p:[f64;2]|k::inside(poly,p)&&!polygons.iter().skip(1).any(|h|k::inside(h,p));
  let mut row=0u64;let mut y=min_y+dy*0.5;while y<max_y{let mut col=0u64;let mut x=min_x+if row%2==1{edge*0.5}else{0.0}+edge*0.25;while x<max_x{
   let id=row.checked_mul(100003).and_then(|r|r.checked_add(col)).ok_or(-8)?;let p=[x+k::jitter(id*2)*edge*0.08,y+k::jitter(id*2+1)*edge*0.08];
   if inside(p)&&polygons.iter().all(|poly|distance(poly,p)>=(0.55*edge).powi(2)){if result.vertices.len()+points.len()>=limits.vertices{return Err(-8);}points.push(p);}
   let next=x+edge;if next<=x{return Err(-9);}x=next;col+=1;
  }let next=y+dy;if next<=y{return Err(-9);}y=next;row+=1;}
  let mut triangles=k::delaunay(&points,work)?;k::recover_edges(&points,&mut triangles,&constraints,work)?;
  triangles.retain(|t|inside([(points[t[0]][0]+points[t[1]][0]+points[t[2]][0])/3.0,(points[t[0]][1]+points[t[1]][1]+points[t[2]][1])/3.0]));
  if result.triangles.len()+triangles.len()>limits.triangles{return Err(-8);}
  let mut topology:BTreeMap<(usize,usize),usize>=BTreeMap::new();let mut used=BTreeSet::new();let mut areas=Vec::new();for t in &triangles{let cross=k::cross(points[t[0]],points[t[1]],points[t[2]]);if !cross.is_finite()||cross<=0.0{return Err(-9);}areas.push(cross*0.5);for i in t{used.insert(*i);}for(a,b)in[(t[0],t[1]),(t[1],t[2]),(t[2],t[0])]{*topology.entry(key(a,b)).or_default()+=1;}}
  let boundary:BTreeSet<_>=constraints.iter().map(|(a,b)|key(*a,*b)).collect();
  if triangles.is_empty()||topology.iter().any(|(e,n)|*n!=if boundary.contains(e){1}else{2})||boundary.iter().any(|e|topology.get(e)!=Some(&1)){return Err(-9);}
  let max_coordinate=points.iter().flatten().map(|v|v.abs()).fold(1.0,f64::max);let error=64.0*f64::EPSILON*max_coordinate.powi(2)*(triangles.len()+points.len()) as f64;
  if (compensated(areas.into_iter())-area).abs()>error.max(1e-10){return Err(-9);}
  let mut map=vec![usize::MAX;points.len()];for i in used{map[i]=result.vertices.len();result.vertices.push(points[i]);result.components.push(component);}
  result.triangles.extend(triangles.iter().map(|t|t.map(|i|map[i])));result.area+=area;
 }
 Ok(result)
}
pub fn run(input:&[u8],output:&mut[u8])->Result<usize,i32>{
 let mut r=Reader{data:input,at:0};if r.u32()?!=0x314d5050{return Err(-4);}let w=r.u32()?;let h=r.u32()?;let limits=Limits{vertices:r.u32()?,triangles:r.u32()?,contours:r.u32()?,pixels:0,bytes:0};let holes=r.u32()?;let max_pixels=r.u32()?;let edge=r.f64()?;let tolerance=r.f64()?;let expansion=r.f64()?;let max_work=integer(r.f64()?)?;let max_bytes=integer(r.f64()?)?;let limits=Limits{pixels:max_pixels,bytes:max_bytes,..limits};
 if w==0||h==0||w>16384||h>16384||limits.vertices<3||limits.vertices>16384||limits.triangles<1||limits.triangles>33333||limits.contours==0||holes>2||edge<=0.0||tolerance<0.0{return Err(-4);}
 let source_pixels=w.checked_mul(h).ok_or(-8)?;let bit_bytes=source_pixels.checked_add(7).ok_or(-8)?/8;if r.at+bit_bytes!=input.len()||source_pixels>limits.pixels{return Err(-8);}
 let pad=expansion.max(0.0).ceil()+2.0;if pad>usize::MAX as f64/4.0{return Err(-8);}let pad=pad as usize;let pw=w.checked_add(pad*2).ok_or(-8)?;let ph=h.checked_add(pad*2).ok_or(-8)?;let pixels=pw.checked_mul(ph).ok_or(-8)?;
 if pixels>limits.pixels||(pixels as u64).saturating_mul(64)>limits.bytes||(pixels as u64).saturating_mul(64)>usize::MAX as u64{return Err(-8);}
 let mut work=Work{used:0,limit:max_work};work.add(pixels as u64*8)?;let mut on=vec![false;pixels];for y in 0..h{for x in 0..w{let i=y*w+x;on[(y+pad)*pw+x+pad]=(input[r.at+i/8]>>(i%8))&1==1;}}
 let grid=k::expand(&k::Grid{w:pw,h:ph,on},expansion);let count=grid.on.iter().filter(|b|**b).count();
 let mut boundary=0u64;for y in 0..ph{for x in 0..pw{if !grid.on[y*pw+x]{continue;}for(dx,dy)in[(-1,0),(1,0),(0,-1),(0,1)]{if !grid.at(x as i64+dx,y as i64+dy){boundary+=1;}}}}
 let planned=pixels as u64*64+boundary*256+limits.vertices as u64*1024+limits.triangles as u64*128;if planned>limits.bytes||planned>usize::MAX as u64{return Err(-8);}
 let mut loops=k::trace_all(&grid,limits.contours,&mut work)?;for p in loops.iter_mut().flatten(){p[0]-=pad as f64;p[1]-=pad as f64;}
 let mesh=triangulate(loops,edge,tolerance,holes,&limits,&mut work)?;
 let contour_values:usize=mesh.contours.iter().map(|c|12+c.points.len()*16).sum();let required=48+mesh.vertices.len()*20+mesh.triangles.len()*12+contour_values;if required>output.len(){return Err(-5);}
 let mut at=0;let u=|out:&mut[u8],at:&mut usize,x:usize|{out[*at..*at+4].copy_from_slice(&(x as u32).to_le_bytes());*at+=4;};let f=|out:&mut[u8],at:&mut usize,x:f64|{out[*at..*at+8].copy_from_slice(&x.to_le_bytes());*at+=8;};
 for x in [0x324d5050,mesh.vertices.len(),mesh.triangles.len(),mesh.contours.len(),mesh.component_count,pixels,count,holes]{u(output,&mut at,x);}f(output,&mut at,work.used as f64);f(output,&mut at,mesh.area);
 for (p,c) in mesh.vertices.iter().zip(&mesh.components){f(output,&mut at,p[0]);f(output,&mut at,p[1]);u(output,&mut at,*c);}for t in &mesh.triangles{for i in t{u(output,&mut at,*i);}}
 for c in &mesh.contours{u(output,&mut at,usize::from(c.hole));u(output,&mut at,c.component);u(output,&mut at,c.points.len());for p in &c.points{f(output,&mut at,p[0]);f(output,&mut at,p[1]);}}
 Ok(at)
}
