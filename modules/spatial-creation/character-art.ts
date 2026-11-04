import {ShapeUtils,Vector2} from 'three';
import {characterBones,validateCharacterAsset,type CharacterAsset} from '../puppet-effects/native.ts';
import {LIMITS} from '../graphics-contracts/check.ts';
import {assetNumber,assetError} from './physics-assets.ts';
export const characterJoints=['hips','chest','head','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot'] as const;
export type CharacterJoint=typeof characterJoints[number];
export const characterPalette={skin:[.92,.48,.25],shirt:[.04,.42,.54],pants:[.025,.055,.12],shoes:[.012,.019,.032],hair:[.018,.026,.04],face:[.004,.007,.012]} as const;
export type CharacterPaint=keyof typeof characterPalette;
const joints:{id:CharacterJoint;parentId:CharacterJoint|null;position:[number,number,number]}[]=[
 {id:'hips',parentId:null,position:[0,-.13,0]},{id:'chest',parentId:'hips',position:[0,.48,0]},{id:'head',parentId:'chest',position:[0,.7,0]},
 ...(['left','right'] as const).flatMap((side)=>{const s=side==='right'?1:-1;return [
  {id:side+'UpperArm',parentId:'chest',position:[s*.22,.48,0]},
  {id:side+'LowerArm',parentId:side+'UpperArm',position:[s*.56,.15,0]},
  {id:side+'Hand',parentId:side+'LowerArm',position:[s*.76,-.22,0]},
  {id:side+'UpperLeg',parentId:'hips',position:[s*.13,-.13,0]},
  {id:side+'LowerLeg',parentId:side+'UpperLeg',position:[s*.17,-.65,0]},
  {id:side+'Foot',parentId:side+'LowerLeg',position:[s*.19,-1.15,0]},
 ] as typeof joints;}),
];
type XY=readonly [number,number];
interface Patch {count:number;points:()=>XY[];bone:CharacterJoint;paint:CharacterPaint;z:number}
/** Original authored paper figure. Triangulation is the existing Three/Earcut;
 * bind matrices use characterBones; no image/model download or binding solver. */
export function characterArtwork(detail=20,maxValueBytes=64*1024**2):CharacterAsset{
 if(!Number.isSafeInteger(detail)||detail<8)assetError('Character detail must be an integer >=8');assetNumber(maxValueBytes,'maxValueBytes',1);
 const patches:Patch[]=[],half=Math.ceil(detail/2),poly=(points:XY[],bone:CharacterJoint,paint:CharacterPaint,z:number)=>patches.push({count:points.length,points:()=>points,bone,paint,z});
 function circle(x:number,y:number,r:number,bone:CharacterJoint,paint:CharacterPaint,z:number){patches.push({count:detail,points:()=>Array.from({length:detail},(_,i)=>[x+r*Math.cos(i/detail*Math.PI*2),y+r*Math.sin(i/detail*Math.PI*2)]),bone,paint,z});}
 function capsule(a:XY,b:XY,r:number,bone:CharacterJoint,paint:CharacterPaint,z:number){const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);patches.push({count:(half+1)*2,points:()=>[...Array.from({length:half+1},(_,i)=>{const t=angle-Math.PI/2+i/half*Math.PI;return [b[0]+r*Math.cos(t),b[1]+r*Math.sin(t)] as XY;}),...Array.from({length:half+1},(_,i)=>{const t=angle+Math.PI/2+i/half*Math.PI;return [a[0]+r*Math.cos(t),a[1]+r*Math.sin(t)] as XY;})],bone,paint,z});}
 for(const side of ['left','right'] as const){const s=side==='right'?1:-1,joint=(part:'UpperLeg'|'LowerLeg'|'Foot'|'UpperArm'|'LowerArm'|'Hand')=>(side+part) as CharacterJoint;
  capsule([s*.13,-.13],[s*.17,-.65],.105,joint('UpperLeg'),'pants',.005);
  capsule([s*.17,-.65],[s*.19,-1.11],.085,joint('LowerLeg'),'pants',.007);
  capsule([s*.13,-1.17],[s*.31,-1.17],.075,joint('Foot'),'shoes',.012);
  capsule([s*.22,.48],[s*.56,.15],.095,joint('UpperArm'),'shirt',.015);
  capsule([s*.56,.15],[s*.76,-.22],.068,joint('LowerArm'),'skin',.018);
  circle(s*.76,-.22,.083,joint('Hand'),'skin',.021);
 }
 poly([[-.2,.53],[.2,.53],[.27,.3],[.23,-.19],[-.23,-.19],[-.27,.3]],'chest','shirt',.014);
 capsule([0,.59],[0,.76],.07,'head','skin',.023);
 circle(0,.96,.255,'head','skin',.025);
 patches.push({count:half+1,points:()=>Array.from({length:half+1},(_,i)=>{const t=Math.PI-i/half*Math.PI;return [.255*Math.cos(t),1.04+.255*Math.sin(t)] as XY;}),bone:'head',paint:'hair',z:.028});
 circle(-.085,.975,.024,'head','face',.032);circle(.085,.975,.024,'head','face',.032);
 patches.push({count:(half+1)*2,points:()=>[...Array.from({length:half+1},(_,i)=>{const t=Math.PI+i/half*Math.PI;return [.078*Math.cos(t),.91+.045*Math.sin(t)] as XY;}),...Array.from({length:half+1},(_,i)=>{const t=Math.PI*2-i/half*Math.PI;return [.078*Math.cos(t),.92+.045*Math.sin(t)] as XY;})],bone:'head',paint:'face',z:.033});
 const vertices=patches.reduce((n,p)=>n+p.count,0),entries=patches.reduce((n,p)=>n+(p.count-2)*3,0),bytes=vertices*160+entries*8;
 if(!Number.isSafeInteger(bytes)||bytes>maxValueBytes||vertices>LIMITS.vertices||entries>LIMITS.array)assetError('Complete character artwork exceeds Graphics-v1/value budget; choose explicit detail or budget');
 const positions:[number,number,number][]=[],indices:number[]=[],uv:[number,number][]=[],weights:CharacterAsset['skeleton']['weights']=[],paints=Object.keys(characterPalette);
 for(const patch of patches){const outline=patch.points(),base=positions.length;for(const [x,y]of outline){const i=positions.push([x,y,patch.z])-1;uv.push([(paints.indexOf(patch.paint)+.5)/paints.length,.5]);weights.push({vertexId:'v'+i,influences:[{boneId:patch.bone,weight:1}]});}for(const face of ShapeUtils.triangulateShape(outline.map(p=>new Vector2(...p)),[]))indices.push(...face.map(i=>i+base));}
 const mesh={schema:'frameweave.mesh' as const,version:1 as const,id:'creation.paper-figure',coordinates:{spaceId:'creation.character',unit:'meter' as const,origin:'local' as const,x:'right' as const,y:'up' as const,z:'toward-viewer' as const,handedness:'right' as const},topology:'triangles' as const,vertexIds:positions.map((_,i)=>'v'+i),restPositions:positions,indices,uv,uvOrigin:'top-left' as const};
 return validateCharacterAsset({mesh,skeleton:{schema:'frameweave.skeleton',version:1,id:'creation.paper-figure.rig',coordinates:mesh.coordinates,meshId:mesh.id,bones:characterBones(joints),weights}});
}
