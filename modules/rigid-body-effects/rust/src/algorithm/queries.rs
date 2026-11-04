// SPDX-License-Identifier: Apache-2.0
// Passive queries over the existing world's collider handles (including step zero).
// O(N) outer scan; each Parry composite uses its existing BVH. No extra world/index.
use super::{State,fail,valid,vector,pose,geometry};
use rapier::prelude::*;
use rapier::parry::{query::{self,Ray,ShapeCastOptions,ShapeCastStatus},shape::FeatureId};
use serde::Deserialize;
use serde_json::{json,Value};
#[derive(Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)]
struct Filter {include_sensors:bool,exclude:Vec<usize>,groups:Option<geometry::Groups>}
impl Filter {
    fn validate(&self,s:&State,max:usize)->Result<(),i32>{
        if max==0||max>s.max_query_results||self.exclude.len()>s.colliders.len()||self.exclude.iter().any(|i|*i>=s.colliders.len()){return fail("E_RIGID_BUDGET","Invalid query result/exclusion budget");}Ok(())
    }
    fn accepts(&self,i:usize,c:&Collider)->bool{!self.exclude.contains(&i)&&(self.include_sensors||!c.is_sensor())&&self.groups.is_none_or(|g|g.native().test(c.collision_groups()))}
}
#[derive(Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)]
struct RayRequest {origin:[f64;3],direction:[f64;3],max_distance:f64,solid:bool,filter:Filter,max_results:usize}
#[derive(Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)]
struct ShapeRequest {shape:geometry::Shape,position:[f64;3],rotation:[f64;4],filter:Filter,max_results:usize,velocity:Option<[f64;3]>,max_time:Option<f64>,target_distance:Option<f64>,stop_at_penetration:Option<bool>}
fn normal(v:Vector)->Result<Value,i32>{if !v.is_finite(){return fail("E_RIGID_NUMERIC","Nonfinite query normal");}if v.length_squared()==0.0{Ok(Value::Null)}else{Ok(json!(v.to_array()))}}
fn checked(v:Vector)->Result<[f64;3],i32>{if !v.is_finite(){return fail("E_RIGID_NUMERIC","Nonfinite query witness");}Ok(v.to_array())}
fn parse<T:serde::de::DeserializeOwned>(input:&[u8])->Result<T,i32>{serde_json::from_slice(input).map_err(|_|{let _:Result<(),i32>=fail("E_RIGID_PARAMETER","Invalid native query request");-4})}
fn push(hits:&mut Vec<Value>,value:Value,max:usize)->Result<(),i32>{if hits.len()>=max{return fail("E_RIGID_QUERY_BUDGET","Query hit budget exceeded; no partial hit list is published");}hits.push(value);Ok(())}
pub(super) fn meshes(s:&State)->Result<Value,i32>{
    let mut out=Vec::new();for (i,h) in s.colliders.iter().enumerate(){let c=&s.world.colliders[*h];
        if let Some(m)=c.shape().as_trimesh(){out.push(json!({"collider":i,"kind":"trimesh","vertices":m.vertices().iter().map(|p|p.to_array()).collect::<Vec<_>>(),"indices":m.indices()}));}
        else if let Some(m)=c.shape().as_convex_polyhedron(){let (points,indices)=m.to_trimesh();out.push(json!({"collider":i,"kind":"convexHull","vertices":points.iter().map(|p|p.to_array()).collect::<Vec<_>>(),"indices":indices}));}
    }Ok(json!(out))
}
pub(super) fn run(s:&State,op:u32,input:&[u8])->Result<Value,i32>{
    let mut hits=Vec::new();
    if op==10{
        let q:RayRequest=parse(input)?;q.filter.validate(s,q.max_results)?;
        let dir=vector(q.direction);let origin=vector(q.origin);
        if !origin.is_finite()||!dir.is_finite()||(dir.length_squared()-1.0).abs()>1e-8||!q.max_distance.is_finite()||q.max_distance<0.0||!(origin+dir*q.max_distance).is_finite(){return fail("E_RIGID_PARAMETER","Invalid finite metric ray");}
        let ray=Ray::new(origin,dir);
        for (i,h) in s.colliders.iter().enumerate(){let c=&s.world.colliders[*h];if !q.filter.accepts(i,c){continue;}
            if let Some(hit)=c.shape().cast_ray_and_get_normal(c.position(),&ray,q.max_distance,q.solid){
                if !hit.time_of_impact.is_finite()||hit.time_of_impact<0.0||hit.time_of_impact>q.max_distance{return fail("E_RIGID_NUMERIC","Invalid ray distance");}
                let feature=match hit.feature{FeatureId::Vertex(n)=>json!({"kind":"vertex","index":n}),FeatureId::Edge(n)=>json!({"kind":"edge","index":n}),FeatureId::Face(n)=>json!({"kind":"face","index":n}),FeatureId::Unknown=>json!({"kind":"unknown","index":null})};
                push(&mut hits,json!({"collider":i,"distance":hit.time_of_impact,"point":checked(origin+dir*hit.time_of_impact)?,"normal":normal(hit.normal)?,"feature":feature}),q.max_results)?;
            }
        }
        hits.sort_by(|a,b|a["distance"].as_f64().unwrap().total_cmp(&b["distance"].as_f64().unwrap()).then_with(||a["collider"].as_u64().cmp(&b["collider"].as_u64())));
    }else{
        let q:ShapeRequest=parse(input)?;q.filter.validate(s,q.max_results)?;
        if matches!(q.shape,geometry::Shape::Trimesh{..}){return fail("E_RIGID_GEOMETRY","Moving query shape must be convex");}
        let shape=geometry::builder(&q.shape,s.geometry_limits)?.shape;let p=pose(q.position,q.rotation)?;
        let cast=if op==11{
            let v=q.velocity.ok_or_else(||{let _:Result<(),i32>=fail("E_RIGID_PARAMETER","Missing cast velocity");-4})?;let t=q.max_time.ok_or(-4)?;let target=q.target_distance.ok_or(-4)?;
            if !valid(&v)||!valid(&[t,target])||t<0.0||target<0.0||!(p.translation+vector(v)*t).is_finite(){return fail("E_RIGID_PARAMETER","Invalid shape-cast interval/velocity");}
            Some((vector(v),ShapeCastOptions{max_time_of_impact:t,target_distance:target,stop_at_penetration:q.stop_at_penetration.ok_or(-4)?,compute_impact_geometry_on_penetration:true}))
        }else{if q.velocity.is_some()||q.max_time.is_some()||q.target_distance.is_some()||q.stop_at_penetration.is_some(){return fail("E_RIGID_PARAMETER","Overlap query has no cast interval");}None};
        for (i,h) in s.colliders.iter().enumerate(){let c=&s.world.colliders[*h];if !q.filter.accepts(i,c){continue;}
            if let Some((velocity,options))=cast{
                let hit=query::cast_shapes(&p,velocity,shape.as_ref(),c.position(),Vector::ZERO,c.shape(),options).map_err(|_|{let _:Result<(),i32>=fail("E_RIGID_QUERY_UNSUPPORTED","Parry does not support this shape-cast pair");-4})?;
                if let Some(hit)=hit{
                    if !hit.time_of_impact.is_finite()||hit.time_of_impact<0.0||hit.time_of_impact>options.max_time_of_impact{return fail("E_RIGID_NUMERIC","Invalid cast time of impact");}
                    let mut impact=p;impact.translation+=velocity*hit.time_of_impact;
                    let status=match hit.status{ShapeCastStatus::Converged=>"converged",ShapeCastStatus::OutOfIterations=>"out-of-iterations",ShapeCastStatus::Failed=>"failed",ShapeCastStatus::PenetratingOrWithinTargetDist=>"penetrating-or-within-target"};
                    push(&mut hits,json!({"collider":i,"timeOfImpact":hit.time_of_impact,"pointMoving":checked(impact*hit.witness1)?,"pointCollider":checked(c.position()*hit.witness2)?,"normalCollider":normal(c.position().rotation*hit.normal2)?,"status":status,"subshape":hit.subshape2}),q.max_results)?;
                }
            }else if op==13{
                let hit=query::contact(&p,shape.as_ref(),c.position(),c.shape(),0.0).map_err(|_|{let _:Result<(),i32>=fail("E_RIGID_QUERY_UNSUPPORTED","Parry does not support this contact pair");-4})?;
                if let Some(hit)=hit{
                    if !hit.dist.is_finite()||hit.dist>0.0{return fail("E_RIGID_NUMERIC","Invalid signed contact distance");}
                    push(&mut hits,json!({"collider":i,"distance":hit.dist,"pointMoving":checked(hit.point1)?,"pointCollider":checked(hit.point2)?,"normalCollider":normal(hit.normal2)?}),q.max_results)?;
                }
            }else{
                let hit=query::intersection_test(&p,shape.as_ref(),c.position(),c.shape()).map_err(|_|{let _:Result<(),i32>=fail("E_RIGID_QUERY_UNSUPPORTED","Parry does not support this intersection pair");-4})?;
                if hit.intersecting{push(&mut hits,json!({"collider":i}),q.max_results)?;}
            }
        }
        if cast.is_some(){hits.sort_by(|a,b|a["timeOfImpact"].as_f64().unwrap().total_cmp(&b["timeOfImpact"].as_f64().unwrap()).then_with(||a["collider"].as_u64().cmp(&b["collider"].as_u64())));}
    }
    Ok(json!({"step":s.step,"hits":hits}))
}
