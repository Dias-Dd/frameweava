// SPDX-License-Identifier: Apache-2.0
// Physics steps/snapshots only. The existing Frameweave FixedStepRunner remains in JS.
use rapier::prelude::*;
use rapier::geometry::{ContactForceEvent,CollisionEventFlags,ContactPair};
use rapier::pipeline::{PhysicsWorld,EventHandler};
use serde::{Serialize,Deserialize};
use std::{cell::RefCell,sync::Mutex};
mod geometry;mod queries;
use geometry::{Shape,Groups,Limits};

#[derive(Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)]
struct Config {gravity:[f64;3],dt:f64,iterations:usize,ccd_substeps:usize,length_unit:f64,max_linear_velocity:f64,allowed_linear_error:f64,prediction_distance:f64,max_corrective_velocity:f64,contact_recycling:bool,contact_clustering:bool,contact_softness:Softness,static_contact_softness:Softness,bodies:Vec<BodyConfig>,joints:Vec<JointConfig>,max_events:usize,max_contact_points:usize,max_geometry_vertices:usize,max_geometry_triangles:usize,max_query_results:usize}
#[derive(Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)]
struct Softness {frequency:f64,damping_ratio:f64}
#[derive(Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)]
struct BodyConfig {kind:String,position:[f64;3],rotation:[f64;4],linear_velocity:[f64;3],angular_velocity:[f64;3],linear_damping:f64,angular_damping:f64,gravity_scale:f64,can_sleep:bool,ccd:bool,lock_translation:[bool;3],lock_rotation:[bool;3],colliders:Vec<ColliderConfig>}
#[derive(Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)]
struct ColliderConfig {shape:Shape,position:[f64;3],rotation:[f64;4],density:f64,friction:f64,restitution:f64,sensor:bool,force_threshold:f64,groups:Option<Groups>}
#[derive(Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)]
struct JointConfig {kind:String,body_a:usize,body_b:usize,anchor_a:[f64;3],anchor_b:[f64;3],axis:Option<[f64;3]>,limits:Option<[f64;2]>,motor:Option<Motor>,rest_length:Option<f64>,stiffness:Option<f64>,damping:Option<f64>,contacts:bool}
#[derive(Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)]
struct Motor {velocity:f64,max_force:f64}
#[derive(Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)]
struct Step {step:u64,dt:f64,controls:Vec<Control>}
#[derive(Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)]
struct Control {index:usize,force:[f64;3],torque:[f64;3],target:Option<[f64;3]>}
#[derive(Serialize,Deserialize,Clone)] #[serde(rename_all="camelCase")]
struct ContactPoint {point_a:[f64;3],point_b:[f64;3],normal:[f64;3]}
#[derive(Serialize,Deserialize,Clone)] #[serde(rename_all="camelCase")]
struct Event {kind:String,collider_a:usize,collider_b:usize,sensor:bool,started:bool,total_force:[f64;3],total_magnitude:f64,max_force_direction:[f64;3],max_force_magnitude:f64,points:Vec<ContactPoint>}
#[derive(Serialize,Deserialize)]
struct State {world:PhysicsWorld,bodies:Vec<RigidBodyHandle>,colliders:Vec<ColliderHandle>,joints:Vec<ImpulseJointHandle>,step:u64,dt:f64,events:Vec<Event>,max_events:usize,max_contact_points:usize,geometry_limits:Limits,max_query_results:usize}
thread_local! {static STATE:RefCell<Option<State>>=const{RefCell::new(None)};static ERROR:RefCell<String>=const{RefCell::new(String::new())};}
fn fail<T>(code:&str,message:&str)->Result<T,i32>{ERROR.with(|e|*e.borrow_mut()=serde_json::json!({"code":code,"message":message}).to_string());Err(-4)}
pub fn dispose(){STATE.with(|s|*s.borrow_mut()=None);}
pub fn world_count()->u32{STATE.with(|s|u32::from(s.borrow().is_some()))}
fn vector(v:[f64;3])->Vector{Vector::from_array(v)}
fn valid(v:&[f64])->bool{v.iter().all(|v|v.is_finite())}
fn rotation(q:[f64;4])->Result<Rotation,i32>{if !valid(&q)||(q.iter().map(|x|x*x).sum::<f64>()-1.0).abs()>1e-8{return fail("E_RIGID_PARAMETER","A finite unit XYZW quaternion is required");}Ok(Rotation::from_xyzw(q[0],q[1],q[2],q[3]))}
fn pose(p:[f64;3],q:[f64;4])->Result<rapier::math::Pose,i32>{if !valid(&p){return fail("E_RIGID_PARAMETER","Nonfinite position");}Ok(rapier::math::Pose::from_parts(vector(p),rotation(q)?))}
fn create(config:Config)->Result<State,i32>{
    if !valid(&config.gravity)||!config.dt.is_finite()||config.dt<=0.0||!config.length_unit.is_finite()||config.length_unit<=0.0||config.iterations==0||config.max_events==0||config.max_contact_points==0||!valid(&[config.max_linear_velocity,config.allowed_linear_error,config.prediction_distance,config.max_corrective_velocity])||config.max_linear_velocity<=0.0||config.allowed_linear_error<0.0||config.prediction_distance<0.0||config.max_corrective_velocity<0.0{return fail("E_RIGID_PARAMETER","Invalid fixed-step, solver or event limits");}
    let mut world=PhysicsWorld::new();world.gravity=vector(config.gravity);world.integration_parameters.dt=config.dt;world.integration_parameters.num_solver_iterations=config.iterations;world.integration_parameters.max_ccd_substeps=config.ccd_substeps;world.integration_parameters.length_unit=config.length_unit;world.integration_parameters.friction_model=FrictionModel::Coulomb;
    world.integration_parameters.normalized_max_linear_velocity=config.max_linear_velocity;world.integration_parameters.normalized_allowed_linear_error=config.allowed_linear_error;world.integration_parameters.normalized_prediction_distance=config.prediction_distance;world.integration_parameters.normalized_max_corrective_velocity=config.max_corrective_velocity;world.integration_parameters.contact_recycling=config.contact_recycling;world.integration_parameters.contact_clustering=config.contact_clustering;
    if !valid(&[config.contact_softness.frequency,config.contact_softness.damping_ratio,config.static_contact_softness.frequency,config.static_contact_softness.damping_ratio])||config.contact_softness.frequency<=0.0||config.static_contact_softness.frequency<=0.0||config.contact_softness.damping_ratio<0.0||config.static_contact_softness.damping_ratio<0.0{return fail("E_RIGID_PARAMETER","Invalid contact softness");}
    world.integration_parameters.contact_softness=rapier::dynamics::SpringCoefficients::new(config.contact_softness.frequency,config.contact_softness.damping_ratio);world.integration_parameters.static_contact_softness=rapier::dynamics::SpringCoefficients::new(config.static_contact_softness.frequency,config.static_contact_softness.damping_ratio);
    let mut handles=Vec::new();let mut colliders=Vec::new();let mut joints=Vec::new();
    let limits=Limits{vertices:config.max_geometry_vertices,triangles:config.max_geometry_triangles};let mut vertex_count=0usize;let mut triangle_count=0usize;
    if limits.vertices==0||limits.triangles==0||config.max_query_results==0{return fail("E_RIGID_BUDGET","Invalid geometry/query budgets");}
    for b in config.bodies {
        if !valid(&b.linear_velocity)||!valid(&b.angular_velocity)||!valid(&[b.linear_damping,b.angular_damping,b.gravity_scale])||b.linear_damping<0.0||b.angular_damping<0.0{return fail("E_RIGID_PARAMETER","Invalid body velocity/damping");}
        let builder=match b.kind.as_str(){"dynamic"=>RigidBodyBuilder::dynamic(),"fixed"=>RigidBodyBuilder::fixed(),"kinematic"=>RigidBodyBuilder::kinematic_position_based(),_=>return fail("E_RIGID_PARAMETER","Unknown body kind")};
        let mut locks=LockedAxes::empty();for (i,flag) in [LockedAxes::TRANSLATION_LOCKED_X,LockedAxes::TRANSLATION_LOCKED_Y,LockedAxes::TRANSLATION_LOCKED_Z].iter().enumerate(){if b.lock_translation[i]{locks|=*flag;}}
        for (i,flag) in [LockedAxes::ROTATION_LOCKED_X,LockedAxes::ROTATION_LOCKED_Y,LockedAxes::ROTATION_LOCKED_Z].iter().enumerate(){if b.lock_rotation[i]{locks|=*flag;}}
        let body=world.insert_body(builder.pose(pose(b.position,b.rotation)?).linvel(vector(b.linear_velocity)).angvel(vector(b.angular_velocity)).linear_damping(b.linear_damping).angular_damping(b.angular_damping).gravity_scale(b.gravity_scale).can_sleep(b.can_sleep).ccd_enabled(b.ccd).locked_axes(locks));handles.push(body);
        for c in b.colliders {
            if !valid(&[c.density,c.friction,c.restitution,c.force_threshold])||c.density<=0.0||c.friction<0.0||c.restitution<0.0||c.restitution>1.0||c.force_threshold<0.0{return fail("E_RIGID_PARAMETER","Invalid collider material");}
            match &c.shape{
                Shape::ConvexHull{vertices}=>{vertex_count=vertex_count.saturating_add(vertices.len());},
                Shape::Trimesh{vertices,indices,..}=>{if b.kind!="fixed"{return fail("E_RIGID_GEOMETRY","Triangle mesh environments must be fixed");}vertex_count=vertex_count.saturating_add(vertices.len());triangle_count=triangle_count.saturating_add(indices.len());},_=>{}
            }
            if vertex_count>limits.vertices||triangle_count>limits.triangles{return fail("E_RIGID_BUDGET","Aggregate collision geometry exceeds configuration budgets");}
            let mut builder=geometry::builder(&c.shape,limits)?;
            if let Shape::ConvexHull{..}=&c.shape{let mass=builder.shape.mass_properties(c.density);let inertia=mass.principal_inertia();if !mass.mass().is_finite()||mass.mass()<=0.0||!inertia.is_finite()||inertia.min_element()<=0.0{return fail("E_RIGID_NUMERIC","Hull mass/inertia underflows, overflows or is not positive");}}
            if let Some(groups)=c.groups{builder=builder.collision_groups(groups.native());}
            let collider=builder.position(pose(c.position,c.rotation)?).density(c.density).friction(c.friction).restitution(c.restitution).sensor(c.sensor).contact_force_event_threshold(c.force_threshold).active_events(ActiveEvents::COLLISION_EVENTS|ActiveEvents::CONTACT_FORCE_EVENTS).user_data(colliders.len() as u128);
            colliders.push(world.colliders.insert_with_parent(collider,body,&mut world.bodies));
        }
    }
    for j in config.joints {
        if j.body_a>=handles.len()||j.body_b>=handles.len()||j.body_a==j.body_b||!valid(&j.anchor_a)||!valid(&j.anchor_b){return fail("E_RIGID_PARAMETER","Invalid joint endpoints");}
        let a=vector(j.anchor_a);let b=vector(j.anchor_b);
        let joint:GenericJoint=match j.kind.as_str(){
            "fixed"=>FixedJointBuilder::new().local_anchor1(a).local_anchor2(b).contacts_enabled(j.contacts).build().into(),
            "spherical"=>SphericalJointBuilder::new().local_anchor1(a).local_anchor2(b).contacts_enabled(j.contacts).build().into(),
            "revolute"|"prismatic"=>{let axis=j.axis.ok_or(-4)?;if !valid(&axis)||(vector(axis).length_squared()-1.0).abs()>1e-8{return fail("E_RIGID_PARAMETER","Joint axis must be a finite unit vector");}if let Some(l)=j.limits {if !valid(&l)||l[0]>l[1]{return fail("E_RIGID_PARAMETER","Invalid joint limits");}}if let Some(ref m)=j.motor{if !valid(&[m.velocity,m.max_force])||m.max_force<0.0{return fail("E_RIGID_PARAMETER","Invalid joint motor");}}
                if j.kind=="revolute"{let mut x=RevoluteJointBuilder::new(vector(axis)).local_anchor1(a).local_anchor2(b).contacts_enabled(j.contacts);if let Some(l)=j.limits{x=x.limits(l);}if let Some(m)=j.motor{x=x.motor_velocity(m.velocity,1.0).motor_max_force(m.max_force);}x.build().into()}
                else{let mut x=PrismaticJointBuilder::new(vector(axis)).local_anchor1(a).local_anchor2(b).contacts_enabled(j.contacts);if let Some(l)=j.limits{x=x.limits(l);}if let Some(m)=j.motor{x=x.motor_velocity(m.velocity,1.0).motor_max_force(m.max_force);}x.build().into()}
            },
            "spring"=>{let length=j.rest_length.ok_or(-4)?;let stiffness=j.stiffness.ok_or(-4)?;let damping=j.damping.ok_or(-4)?;if !valid(&[length,stiffness,damping])||length<0.0||stiffness<0.0||damping<0.0{return fail("E_RIGID_PARAMETER","Invalid spring");}SpringJointBuilder::new(length,stiffness,damping).local_anchor1(a).local_anchor2(b).contacts_enabled(j.contacts).build().into()},
            _=>return fail("E_RIGID_PARAMETER","Unknown joint kind")};
        joints.push(world.impulse_joints.insert(handles[j.body_a],handles[j.body_b],joint,true));
    }
    Ok(State{world,bodies:handles,colliders,joints,step:0,dt:config.dt,events:Vec::new(),max_events:config.max_events,max_contact_points:config.max_contact_points,geometry_limits:limits,max_query_results:config.max_query_results})
}
struct Collector<'a>{handles:&'a[ColliderHandle],events:Mutex<Vec<Event>>,overflow:Mutex<bool>,limit:usize,point_limit:usize}
impl Collector<'_>{
    fn pair(&self,colliders:&ColliderSet,a:ColliderHandle,b:ColliderHandle)->Option<(usize,usize)>{let i=usize::try_from(colliders.get(a)?.user_data).ok()?;let j=usize::try_from(colliders.get(b)?.user_data).ok()?;if self.handles.get(i)!=Some(&a)||self.handles.get(j)!=Some(&b){return None;}Some((i,j))}
    fn push(&self,event:Event){let mut events=self.events.lock().unwrap();if events.len()>=self.limit||event.points.len()>self.point_limit{*self.overflow.lock().unwrap()=true;}else{events.push(event);}}
}
impl EventHandler for Collector<'_>{
    fn handle_collision_event(&self,bodies:&RigidBodySet,colliders:&ColliderSet,event:CollisionEvent,pair:Option<&ContactPair>){
        let (a,b,flags,started)=match event{CollisionEvent::Started(a,b,f)=>(a,b,f,true),CollisionEvent::Stopped(a,b,f)=>(a,b,f,false)};let Some((a,b))=self.pair(colliders,a,b)else{*self.overflow.lock().unwrap()=true;return;};
        let mut points=Vec::new();if let Some(pair)=pair{for m in pair.solver_manifolds(){for sc in &m.data.solver_contacts{if points.len()>self.point_limit{break;}let (p,q)=m.data.solver_contact_world_points(sc,bodies);points.push(ContactPoint{point_a:p.to_array(),point_b:q.to_array(),normal:m.data.normal.to_array()});}}}
        self.push(Event{kind:if started{"started"}else{"stopped"}.into(),collider_a:a,collider_b:b,sensor:flags.contains(CollisionEventFlags::SENSOR),started,total_force:[0.0;3],total_magnitude:0.0,max_force_direction:[0.0;3],max_force_magnitude:0.0,points});
    }
    fn handle_contact_force_event(&self,dt:f64,_bodies:&RigidBodySet,colliders:&ColliderSet,pair:&ContactPair,magnitude:f64){let e=ContactForceEvent::from_contact_pair(dt,pair,magnitude);let Some((a,b))=self.pair(colliders,e.collider1,e.collider2)else{*self.overflow.lock().unwrap()=true;return;};self.push(Event{kind:"force".into(),collider_a:a,collider_b:b,sensor:false,started:e.started,total_force:e.total_force.to_array(),total_magnitude:e.total_force_magnitude,max_force_direction:e.max_force_direction.to_array(),max_force_magnitude:e.max_force_magnitude,points:Vec::new()});}
    fn handle_soft_body_tear_event(&self,_bodies:&SoftBodySet,_event:&SoftBodyTearEvent){}
}
fn step(state:&mut State,input:Step)->Result<(),i32>{
    if input.step!=state.step+1||input.dt!=state.dt||input.controls.len()!=state.bodies.len(){return fail("E_RIGID_TIME","Step number/dt/controls disagree with the initialized world");}
    let mut used=vec![false;state.bodies.len()];for c in input.controls{if c.index>=state.bodies.len()||used[c.index]||!valid(&c.force)||!valid(&c.torque)||c.target.is_some_and(|v|!valid(&v)){return fail("E_RIGID_PARAMETER","Invalid per-step controls");}used[c.index]=true;let body=&mut state.world.bodies[state.bodies[c.index]];body.reset_forces(false);body.reset_torques(false);if c.force!=[0.0;3]{body.add_force(vector(c.force),true);}if c.torque!=[0.0;3]{body.add_torque(vector(c.torque),true);}if let Some(p)=c.target{if !body.is_kinematic(){return fail("E_RIGID_PARAMETER","Kinematic target given to another body type");}body.set_next_kinematic_translation(vector(p));}}
    let collector=Collector{handles:&state.colliders,events:Mutex::new(Vec::new()),overflow:Mutex::new(false),limit:state.max_events,point_limit:state.max_contact_points};state.world.step_with_events(&(),&collector);
    if !state.world.quarantine().is_empty(){return fail("E_RIGID_NUMERIC","Rapier quarantined nonfinite physical state; reset or dispose");}if *collector.overflow.lock().unwrap(){return fail("E_RIGID_EVENT_BUDGET","Contact event/point budget exceeded; no partial events are published");}
    state.events=collector.events.into_inner().unwrap();state.step=input.step;Ok(())
}
fn json<T:Serialize>(v:&T,output:&mut[u8])->Result<usize,i32>{let bytes=serde_json::to_vec(v).map_err(|_|-4)?;copy(&bytes,output)}
fn copy(bytes:&[u8],output:&mut[u8])->Result<usize,i32>{if bytes.len()>output.len(){return fail("E_RIGID_BYTES","Output exceeds existing bytes-v1 capacity");}output[..bytes.len()].copy_from_slice(bytes);Ok(bytes.len())}
pub fn run(op:u32,input:&[u8],output:&mut[u8])->Result<usize,i32>{
    if op==8{return ERROR.with(|e|copy(e.borrow().as_bytes(),output));}
    if op==6{return json(&serde_json::json!({"worlds":world_count(),"rapier":"0.36.1","precision":"f64","determinism":"enhanced"}),output);}
    if op==1{let config:Config=serde_json::from_slice(input).map_err(|_|{ERROR.with(|e|*e.borrow_mut()="{\"code\":\"E_RIGID_PARAMETER\",\"message\":\"Invalid world config\"}".into());-4})?;let candidate=create(config)?;STATE.with(|s|*s.borrow_mut()=Some(candidate));return copy(b"{}",output);}
    STATE.with(|slot|{let mut slot=slot.borrow_mut();let state=slot.as_mut().ok_or(-4)?;match op{
        2=>{let request:Step=serde_json::from_slice(input).map_err(|_|-4)?;step(state,request)?;copy(b"{}",output)},
        3=>{let bytes=postcard::to_stdvec(state).map_err(|_|-4)?;copy(&bytes,output)},
        4=>{let restored:State=postcard::from_bytes(input).map_err(|_|-4)?;if restored.dt!=state.dt||restored.bodies!=state.bodies||restored.colliders!=state.colliders||restored.joints!=state.joints{return fail("E_RIGID_SNAPSHOT","Snapshot belongs to another initialized topology");}*state=restored;copy(b"{}",output)},
        5=>{let bodies=state.bodies.iter().map(|h|{let b=&state.world.bodies[*h];serde_json::json!({"position":b.translation().to_array(),"rotation":b.rotation().to_array(),"linearVelocity":b.linvel().to_array(),"angularVelocity":b.angvel().to_array(),"sleeping":b.is_sleeping(),"mass":b.mass()})}).collect::<Vec<_>>();json(&serde_json::json!({"step":state.step,"bodies":bodies,"events":state.events}),output)},
        9=>json(&queries::meshes(state)?,output),
        10..=13=>json(&queries::run(state,op,input)?,output),
        7=>json(&serde_json::json!({"step":state.step,"events":state.events}),output),
        _=>Err(-3)
    }})
}
