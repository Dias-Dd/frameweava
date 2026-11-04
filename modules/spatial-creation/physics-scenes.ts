import {BoxGeometry,SphereGeometry} from 'three';
import {seededRandom} from '../../src/core/time.ts';
import type {Signal} from '../../src/core/types.ts';
import type {ModuleLoader} from '../../src/plugins/sdk.ts';
import type {Vec3,MeshData} from '../graphics-contracts/types.ts';
import type {ClothOptions} from '../deformable-effects/src/factories.ts';
import type {RigidWorldOptions} from '../rigid-body-effects/native.ts';
import {clothScene,rigidScene,type PhysicsAppearance,type ClothDecoration} from './physics.ts';
import {clothSheet,ballBody,boxBody,groundBody,assetNumber,assetVector,assetError} from './physics-assets.ts';
import {geometryData} from './geometry.ts';
import {validateCreation,materialKeys} from './lifecycle.ts';
import type {CreationInit,AnimatedVec3} from './types.ts';

export interface ClothPresetOptions extends PhysicsAppearance {
 size?:readonly [number,number];segments?:readonly [number,number];
 /** Immutable setup; wind Signals are sampled by existing fixed substeps. */
 pin?:'top'|'left'|'corners'|'none';wind?:AnimatedVec3;
 simulation?:Omit<ClothOptions,'fps'>;maxValueBytes?:number;
}
const viewKeys=['camera',...materialKeys,'maxRayTests','maxBytes'];
const clothKeys=[...viewKeys,'size','segments','pin','wind','simulation','maxValueBytes'];
function view(o:PhysicsAppearance){return {format:o.format,finish:o.finish,post:o.post,signal:o.signal,camera:o.camera,ink:o.ink,opacity:o.opacity,emissive:o.emissive,roughness:o.roughness,metalness:o.metalness,maxBytes:o.maxBytes,maxRayTests:o.maxRayTests};}
function meshPins(mesh:MeshData,segments:readonly [number,number],pin:ClothPresetOptions['pin']){const [x,y]=segments;return pin==='none'?[]:pin==='corners'?['r0c0','r0c'+x]:pin==='left'?Array.from({length:y+1},(_,i)=>'r'+i+'c0'):Array.from({length:x+1},(_,i)=>'r0c'+i);}
function setupCloth(init:CreationInit,o:ClothPresetOptions,kind:'hanging'|'flag'|'drape'){
 validateCreation(init,o,clothKeys);const size=o.size??(kind==='drape'?[2.5,2.5]:kind==='flag'?[2.1,1.25]:[2.4,1.6]),segments=o.segments??[12,8];
 const mesh=clothSheet({id:'creation.'+kind,size,segments,center:kind==='drape'?[0,1,0]:[0,.2,0],plane:kind==='drape'?'xz':'xy',maxValueBytes:o.maxValueBytes});
 const pin=o.pin??(kind==='flag'?'left':kind==='drape'?'none':'top');if(!['top','left','corners','none'].includes(pin))assetError('pin must be top, left, corners or none');
 const aspect=init.width/init.height,half=size[1]/2,decorations:ClothDecoration[]=[];
 if(kind==='drape'){
  decorations.push({mesh:geometryData('creation.obstacle',new SphereGeometry(.65,12,8)),material:{ink:[.035,.055,.09],roughness:.4,metalness:.5}});
  const floor=geometryData('creation.floor',new BoxGeometry(4,.1,4));floor.restPositions=floor.restPositions.map(([x,y,z])=>[x,y-.85,z]);decorations.push({mesh:floor,material:{ink:[.025,.035,.05],roughness:.8}});
 }else{
  const support=geometryData('creation.support',kind==='flag'?new BoxGeometry(.05,size[1]+.5,.05):new BoxGeometry(size[0]+.1,.045,.045));support.restPositions=support.restPositions.map(([x,y,z])=>kind==='flag'?[x-size[0]/2-.025,y+.2-half*.15,z]:[x,y+.2+half+.025,z]);decorations.push({mesh:support,material:{ink:[.12,.16,.2],metalness:.6,roughness:.25}});
 }
 const fixedVertices=meshPins(mesh,segments,pin),initial=mesh.restPositions.map((p,i)=>{const u=i%(segments[0]+1)/segments[0],v=Math.floor(i/(segments[0]+1))/segments[1];return [p[0],p[1],p[2]+(kind==='drape'?0:.025*Math.sin(u*Math.PI*4)*Math.sin(v*Math.PI))] as Vec3;});
 const wind=o.wind??o.simulation?.aerodynamics?.wind??(kind==='drape'?[0,0,0]:kind==='flag'?[.5,.1,1.8]:[.25,0,.8]);
 const simulation:Omit<ClothOptions,'fps'>={substeps:4,iterations:16,gravity:[0,-2,0],surfaceDensity:.3,stretchCompliance:1e-6,bendCompliance:1e-3,dampingRate:.4,fixedVertices,positions:initial,...kind==='drape'?{collision:{radii:.012,colliders:[{id:'sphere',kind:'sphere' as const,center:[0,0,0] as Vec3,radius:.65,friction:.3},{id:'floor',kind:'plane' as const,normal:[0,1,0] as Vec3,offset:-.8,friction:.5}]}}:{},...o.simulation,
  aerodynamics:{density:1.225,normalDrag:1,tangentialDrag:.02,...o.simulation?.aerodynamics,wind:[...wind] as [Signal<number>,Signal<number>,Signal<number>]}};
 const camera=o.camera??{projection:'orthographic' as const,position:(kind==='drape'?[3,2.6,4]:[2,.8,6]) as Vec3,target:[0,.15,0] as Vec3,viewHeight:Math.max(kind==='drape'?3.4:2.8,size[0]/aspect*1.45,size[1]*1.6),near:.01,far:30};
 return {mesh,simulation,decorations,camera,renderPrecision:'float32' as const};
}
export async function hangingCloth(init:CreationInit,o:ClothPresetOptions={},load?:ModuleLoader){const setup=setupCloth(init,o,'hanging');return clothScene(init,{...view(o),ink:o.ink??[.03,.5,.85],roughness:o.roughness??.42,metalness:o.metalness??.08,...setup},load);}
export async function windFlag(init:CreationInit,o:ClothPresetOptions={},load?:ModuleLoader){const setup=setupCloth(init,o,'flag');return clothScene(init,{...view(o),ink:o.ink??[.95,.22,.055],roughness:o.roughness??.4,metalness:o.metalness??.05,...setup},load);}
export async function drapedCloth(init:CreationInit,o:ClothPresetOptions={},load?:ModuleLoader){const setup=setupCloth(init,o,'drape');return clothScene(init,{...view(o),ink:o.ink??[.14,.65,.5],roughness:o.roughness??.38,metalness:o.metalness??.1,...setup},load);}

export interface RigidPresetOptions extends PhysicsAppearance {count?:number;seed?:number;maxValueBytes?:number;simulation?:Omit<RigidWorldOptions,'fps'|'bodies'|'seed'>}
export interface BouncingBallsOptions extends RigidPresetOptions {radius?:number;spread?:number;dropHeight?:number;bounce?:number}
function population(o:RigidPresetOptions,count:number){if(!Number.isSafeInteger(count)||count<1)assetError('count must be a positive integer');const budget=assetNumber(o.maxValueBytes??64*1024**2,'maxValueBytes',1);if(!Number.isSafeInteger(count*1024)||count*1024>budget)assetError('Initial body plan exceeds maxValueBytes');}
function seed(init:CreationInit,o:RigidPresetOptions){const v=o.seed??init.seed;if(!Number.isInteger(v)||v<0||v>0xffffffff)assetError('seed must be uint32');return v;}
export async function bouncingBalls(init:CreationInit,o:BouncingBallsOptions={},load?:ModuleLoader){
 validateCreation(init,o,[...viewKeys,'count','seed','maxValueBytes','simulation','radius','spread','dropHeight','bounce']);const count=o.count??8;population(o,count);const s=seed(init,o),radius=assetNumber(o.radius??.22,'radius',Number.MIN_VALUE),columns=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/columns),spread=assetNumber(o.spread??Math.max(2.8,columns*radius*2.6),'spread',Number.MIN_VALUE),height=assetNumber(o.dropHeight??.2,'dropHeight');
 const bodies=[groundBody({size:[spread+2,.12,2.5]}),...Array.from({length:count},(_,i)=>ballBody({id:'ball'+i,radius,bounce:o.bounce??.78,position:[columns===1?0:(i%columns/(columns-1)-.5)*spread,height+Math.floor(i/columns)*radius*2.6,0],velocity:[(seededRandom(s,0,'vx'+i)-.5)*.4,0,(seededRandom(s,0,'vz'+i)-.5)*.2]}))];
 return rigidScene(init,{...view(o),camera:o.camera??{projection:'orthographic',position:[2,1.2,7],target:[0,(height+rows*radius*2.6-1.1)/2,0],viewHeight:Math.max(3,(spread+1)/(init.width/init.height)*1.35,(height+rows*radius*2.6+1.1)*1.25),near:.01,far:40},world:{substeps:4,gravity:[0,-4,0],...o.simulation,seed:s,bodies}},load);
}
export interface DominoesOptions extends RigidPresetOptions {size?:Vec3;spacing?:number;push?:number}
export async function dominoes(init:CreationInit,o:DominoesOptions={},load?:ModuleLoader){
 validateCreation(init,o,[...viewKeys,'count','seed','maxValueBytes','simulation','size','spacing','push']);const count=o.count??12;population(o,count);const s=seed(init,o),size=assetVector(o.size??[.09,.85,.3],'domino size',Number.MIN_VALUE),spacing=assetNumber(o.spacing??.25,'spacing',Number.MIN_VALUE),span=(count-1)*spacing,push=assetNumber(o.push??.3,'push',0,Math.PI/2),bodies=[groundBody({size:[span+2,.12,2]}),...Array.from({length:count},(_,i)=>boxBody({id:'domino'+i,size,position:[i*spacing-span/2,-1.1+size[1]/2,0],bounce:.02,friction:.4,body:i===0?{rotation:[0,0,-Math.sin(push/2),Math.cos(push/2)],angularVelocity:[0,0,-1],ccd:true}:{ccd:true}}))];
 return rigidScene(init,{...view(o),camera:o.camera??{projection:'orthographic',position:[2,1.3,7],target:[0,-.6,0],viewHeight:Math.max(2.8,(span+1)/(init.width/init.height)*1.35),near:.01,far:40},world:{substeps:8,gravity:[0,-6,0],...o.simulation,seed:s,bodies}},load);
}
