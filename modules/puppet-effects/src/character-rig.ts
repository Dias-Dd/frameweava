// SPDX-License-Identifier: Apache-2.0. Actual pinned Three CCD solver, no renderer.
import {Bone,BufferGeometry,MeshBasicMaterial,SkinnedMesh,Skeleton,Matrix4,Vector3,Euler,Quaternion} from 'three';
import {CCDIKSolver,type IK} from 'three/addons/animation/CCDIKSolver.js';
import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import {time as checkTime} from '../../spatial-fields/parameters.ts';
import {validateCharacterAsset,characterError as fail,characterNumber as number,characterVector as vector,characterObject as object} from './character-asset.ts';
import type {CharacterAsset,CharacterControls,CharacterRigOptions,CharacterPose,JointLimit,Matrix4 as Matrix} from './character-types.ts';

/** Reuses real Bone/Skeleton/CCDIKSolver objects. Every sample resets to bind,
 * so ordinary FrameContext evaluation is independent of prior frame requests. */
export function createCharacterRig(input:CharacterAsset,options:CharacterRigOptions={}){
 const asset=validateCharacterAsset(input);object(options,['chains','limits','maxSolveWork'],'rig options');const config=structuredClone(options),definitions=asset.skeleton.bones,byId=new Map(definitions.map((b,i)=>[b.id,i])),bones=definitions.map(b=>{const bone=new Bone();bone.name=b.id;return bone;}),geometry=new BufferGeometry(),material=new MeshBasicMaterial(),mesh=new SkinnedMesh(geometry,material),chains=config.chains??[],limits=config.limits??{};
 const limitOf=(id:string)=>Object.hasOwn(limits,id)?limits[id]:undefined;
 const index=(id:string)=>{const i=byId.get(id);if(i===undefined)fail('BONE','Unknown bone '+id);return i;};
 const local=definitions.map(b=>{const bind=new Matrix4().fromArray(b.bindMatrix);return b.parentId===null?bind:new Matrix4().fromArray(definitions[index(b.parentId)].inverseBindMatrix).multiply(bind);});
 const rest=local.map(m=>{const position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();m.decompose(position,rotation,scale);if(Math.min(scale.x,scale.y,scale.z)<=0||new Matrix4().compose(position,rotation,scale).elements.some((v,i)=>Math.abs(v-m.elements[i])>1e-7*Math.max(1,Math.abs(v))))fail('BIND_TRANSFORM','Native character controls require decomposable positive-scale bind transforms');return {position,rotation,scale};});
 definitions.forEach((d,i)=>{if(d.parentId===null)mesh.add(bones[i]);else bones[index(d.parentId)].add(bones[i]);});
 for(const [id,value]of Object.entries(limits)){index(id);object(value,['min','max','axis'],'joint limit');const lo=vector(value.min,'minimum rotation'),hi=vector(value.max,'maximum rotation');lo.forEach((v,i)=>{if(v>hi[i]||v< -Math.PI||hi[i]>Math.PI)fail('LIMIT','Euler XYZ joint bounds must lie in [-pi,pi]');});if(value.axis){const axis=new Vector3(...vector(value.axis,'hinge axis'));if(axis.length()<1e-9)fail('LIMIT','Hinge axis must be nonzero');axis.normalize();value.axis=axis.toArray();}}
 if(!Array.isArray(chains)||new Set(chains.map(c=>c.id)).size!==chains.length)fail('IK','IK chain IDs must be unique');
 const targets=chains.map(chain=>{object(chain,['id','effector','links','iterations','maxAngle'],'IK chain');if(typeof chain.id!=='string'||!chain.id||!Array.isArray(chain.links)||!chain.links.length||new Set(chain.links).size!==chain.links.length)fail('IK','Explicit IK chain ID and unique links required');let parent=definitions[index(chain.effector)].parentId;for(const id of chain.links){if(id!==parent)fail('IK','Links must follow the immediate parent chain, effector outward');parent=definitions[index(id)].parentId;}const target=new Bone();target.name='@target/'+chain.id;mesh.add(target);return target;});
 mesh.bind(new Skeleton([...bones,...targets],[...definitions.map(b=>new Matrix4().fromArray(b.inverseBindMatrix)),...targets.map(()=>new Matrix4())]),new Matrix4());
 const iks:IK[]=chains.map((chain,i)=>({
  target:bones.length+i,effector:index(chain.effector),iteration:chain.iterations??16,
  maxAngle:number(chain.maxAngle??Math.PI/4,'maxAngle',1e-8,Math.PI),
  links:chain.links.map((id:string)=>{
   const limit=limitOf(id);
   return {index:index(id),...(limit?.axis?{limitation:new Vector3(...limit.axis)}:{}),...(limit?{rotationMin:new Vector3(...limit.min),rotationMax:new Vector3(...limit.max)}:{})};
  })
 }));
 const solver=new CCDIKSolver(mesh,iks);
 const max=number(config.maxSolveWork??1e6,'maxSolveWork',1,Number.MAX_SAFE_INTEGER);let disposed=false;
 const applyLimit=(bone:Bone,limit:JointLimit|undefined)=>{if(!limit)return;if(limit.axis){const axis=new Vector3(...limit.axis),q=bone.quaternion,dot=q.x*axis.x+q.y*axis.y+q.z*axis.z,twist=new Quaternion(axis.x*dot,axis.y*dot,axis.z*dot,q.w);if(twist.lengthSq()<1e-20)fail('LIMIT','Hinge twist is degenerate');bone.quaternion.copy(twist.normalize());}bone.rotation.set(Math.max(limit.min[0],Math.min(limit.max[0],bone.rotation.x)),Math.max(limit.min[1],Math.min(limit.max[1],bone.rotation.y)),Math.max(limit.min[2],Math.min(limit.max[2],bone.rotation.z)),'XYZ');if(limit.axis){const v=new Vector3(bone.quaternion.x,bone.quaternion.y,bone.quaternion.z);if(v.cross(new Vector3(...limit.axis)).length()>1e-8)fail('LIMIT_CONFLICT','Hinge axis and Euler bounds conflict');}};
 return {asset:()=>structuredClone(asset),sample(context:FrameContext,controls:CharacterControls={}):CharacterPose{
  if(disposed)fail('DISPOSED','Character rig disposed');checkTime(context);object(controls,['bones','targets'],'character controls');for(const value of [controls.bones,controls.targets])if(value!==undefined)object(value,Object.keys(value),'control dictionary');
  for(let i=0;i<bones.length;i++){bones[i].position.copy(rest[i].position);bones[i].quaternion.copy(rest[i].rotation);bones[i].scale.copy(rest[i].scale);}
  for(const [id,value]of Object.entries(controls.bones??{})){object(value,['translation','rotation','scale'],'bone control');const bone=bones[index(id)],r=rest[index(id)];if(value.translation!==undefined)bone.position.add(new Vector3(...vector(evaluate(value.translation,context),'translation')));if(value.rotation!==undefined)bone.quaternion.multiply(new Quaternion().setFromEuler(new Euler(...vector(evaluate(value.rotation,context),'rotation'),'XYZ')));if(value.scale!==undefined){const s=vector(evaluate(value.scale,context),'scale');if(s.some(v=>v<=0))fail('TRANSFORM','Scale factors must be positive');bone.scale.multiply(new Vector3(...s));}applyLimit(bone,limitOf(id));}
  for(const [id,limit]of Object.entries(limits))applyLimit(bones[index(id)],limit);mesh.updateMatrixWorld(true);
  const requested=controls.targets??{};for(const id of Object.keys(requested))if(!chains.some(c=>c.id===id))fail('IK','Unknown IK target '+id);let work=0;const active=[] as {i:number;weight:number;position:Vector3}[];
  for(let i=0;i<chains.length;i++){const control=Object.hasOwn(requested,chains[i].id)?requested[chains[i].id]:undefined;if(!control)continue;object(control,['position','weight','iterations'],'target control');const iteration=control.iterations??chains[i].iterations??16;if(!Number.isSafeInteger(iteration)||iteration<1)fail('IK','Positive integer iterations required');work+=iteration*chains[i].links.length*bones.length;if(!Number.isSafeInteger(work)||work>max)fail('BUDGET','Full IK iteration envelope exceeds maxSolveWork');iks[i].iteration=iteration;const weight=number(evaluate(control.weight??1,context),'IK weight',0,1),position=new Vector3(...vector(evaluate(control.position,context),'target'));targets[i].position.copy(position);iks[i].blendFactor=weight;active.push({i,weight,position});}
  mesh.updateMatrixWorld(true);for(const item of active){for(const link of iks[item.i].links){const scale=new Vector3();bones[link.index].getWorldScale(scale);if(Math.max(scale.x,scale.y,scale.z)-Math.min(scale.x,scale.y,scale.z)>1e-7)fail('IK_SCALE','Pinned CCD IK is qualified for uniform world scale only');}solver.updateOne(iks[item.i]);for(const link of iks[item.i].links){const bone=bones[link.index];if(Math.abs(bone.quaternion.lengthSq()-1)>1e-6)fail('IK_DEGENERATE','Upstream CCD produced a non-unit rotation');applyLimit(bone,limitOf(definitions[link.index].id));}mesh.updateMatrixWorld(true);}
  mesh.updateMatrixWorld(true);for(const b of bones)if(Math.abs(b.quaternion.lengthSq()-1)>1e-6||b.matrixWorld.elements.some(v=>!Number.isFinite(v)||Math.abs(v)>1e9))fail('IK_DEGENERATE','Upstream CCD produced a non-unit/nonfinite pose; candidate rejected');
  return {meshId:asset.mesh.id,skeletonId:asset.skeleton.id,boneIds:definitions.map(b=>b.id),matrices:bones.map(b=>[...b.matrixWorld.elements] as Matrix),context:checkTime(context),diagnostics:{backend:'three-ccd',iterationsBudget:work,targets:active.map(t=>({id:chains[t.i].id,distance:new Vector3().setFromMatrixPosition(bones[iks[t.i].effector].matrixWorld).distanceTo(t.position),weight:t.weight}))}};
 },dispose(){if(disposed)return;disposed=true;mesh.skeleton.dispose();geometry.dispose();material.dispose();mesh.clear();}};
}
