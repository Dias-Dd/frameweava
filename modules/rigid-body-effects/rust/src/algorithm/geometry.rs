// SPDX-License-Identifier: Apache-2.0
// Geometry construction stays in pinned Parry/Rapier, not a second collision solver.
use super::{fail, valid, vector};
use rapier::prelude::*;
use serde::{Serialize,Deserialize};
#[derive(Deserialize)] #[serde(tag="kind",rename_all="camelCase",rename_all_fields="camelCase",deny_unknown_fields)]
pub(super) enum Shape {
    Ball {radius:f64}, Cuboid {half_extents:[f64;3]}, Capsule {half_height:f64,radius:f64},
    ConvexHull {vertices:Vec<[f64;3]>}, Trimesh {vertices:Vec<[f64;3]>,indices:Vec<[u32;3]>,fix_internal_edges:bool},
}
#[derive(Deserialize,Clone,Copy)] #[serde(deny_unknown_fields)]
pub(super) struct Groups {memberships:u32,filter:u32}
impl Groups {pub(super) fn native(self)->InteractionGroups{InteractionGroups::new(Group::from_bits_retain(self.memberships),Group::from_bits_retain(self.filter),InteractionTestMode::And)}}
#[derive(Serialize,Deserialize,Clone,Copy)]
pub(super) struct Limits {pub vertices:usize,pub triangles:usize}
fn vertices(input:&[[f64;3]],limits:Limits)->Result<Vec<Vector>,i32>{
    if input.is_empty()||input.len()>limits.vertices||input.len()>16384{return fail("E_RIGID_BUDGET","Collision vertices exceed explicit budget/Graphics MeshData v1 per-mesh capacity");}
    if input.iter().any(|p|!valid(p)||p.iter().any(|x|x.abs()>1e9)){return fail("E_RIGID_GEOMETRY","Nonfinite/out-of-contract collision coordinates");}
    Ok(input.iter().map(|p|vector(*p)).collect())
}
fn scale(points:&[Vector])->Result<f64,i32>{
    let mut lo=points[0];let mut hi=lo;for p in points{lo=lo.min(*p);hi=hi.max(*p);}let s=(hi-lo).max_element();
    if !s.is_finite()||s<=0.0{return fail("E_RIGID_GEOMETRY","Collision geometry has no representable extent");}Ok(s)
}
pub(super) fn builder(shape:&Shape,limits:Limits)->Result<ColliderBuilder,i32>{
    Ok(match shape {
        Shape::Ball{radius:r}=>{if !r.is_finite()||*r<=0.0{return fail("E_RIGID_PARAMETER","Invalid ball radius");}ColliderBuilder::ball(*r)},
        Shape::Cuboid{half_extents:h}=>{if !valid(h)||h.iter().any(|v|*v<=0.0){return fail("E_RIGID_PARAMETER","Invalid cuboid extents");}ColliderBuilder::cuboid(h[0],h[1],h[2])},
        Shape::Capsule{half_height:h,radius:r}=>{if !valid(&[*h,*r])||*h<0.0||*r<=0.0{return fail("E_RIGID_PARAMETER","Invalid capsule");}ColliderBuilder::capsule_y(*h,*r)},
        Shape::ConvexHull{vertices:input}=>{
            let points=vertices(input,limits)?;if points.len()<4{return fail("E_RIGID_GEOMETRY","Convex hull needs four noncoplanar points");}let s=scale(&points)?;
            if !(s*s*s).is_finite()||s*s*s==0.0{return fail("E_RIGID_GEOMETRY","Hull volume scale under/overflows f64");}
            let relative=|p:Vector|(p-points[0])/s;
            let edge=points.iter().map(|p|relative(*p)).max_by(|a,b|a.length_squared().total_cmp(&b.length_squared())).unwrap();
            let normal=points.iter().map(|p|edge.cross(relative(*p))).max_by(|a,b|a.length_squared().total_cmp(&b.length_squared())).unwrap();
            if !points.iter().any(|p|normal.dot(relative(*p)).abs()>0.0){return fail("E_RIGID_GEOMETRY","Hull points are coplanar/collinear at f64 precision");}
            ColliderBuilder::convex_hull(&points).ok_or_else(||{let _:Result<(),i32>=fail("E_RIGID_GEOMETRY","Parry rejected convex hull geometry");-4})?
        },
        Shape::Trimesh{vertices:input,indices,fix_internal_edges}=>{
            let points=vertices(input,limits)?;let s=scale(&points)?;
            if indices.is_empty()||indices.len()>limits.triangles||indices.len()>33333{return fail("E_RIGID_BUDGET","Collision triangles exceed explicit budget/Graphics MeshData v1 capacity");}
            for t in indices{
                if t.iter().any(|i|*i as usize>=points.len()){return fail("E_RIGID_GEOMETRY","Triangle index out of range");}
                let a=points[t[0] as usize];let b=(points[t[1] as usize]-a)/s;let c=(points[t[2] as usize]-a)/s;
                let n=b.cross(c);if !n.is_finite()||n.length()==0.0{return fail("E_RIGID_GEOMETRY","Degenerate collision triangle; no silent repair");}
            }
            let flags=if *fix_internal_edges{TriMeshFlags::FIX_INTERNAL_EDGES_TWO_SIDED}else{TriMeshFlags::empty()};
            ColliderBuilder::trimesh_with_flags(points,indices.clone(),flags).map_err(|_|{let _:Result<(),i32>=fail("E_RIGID_GEOMETRY","Parry rejected triangle mesh");-4})?
        }
    })
}
