import type {MeshData,Vec2} from '../graphics-contracts/types.ts';
import {validateMeshData} from '../graphics-contracts/validate.ts';
import {LIMITS} from '../graphics-contracts/check.ts';
import {assetOptions,assetNumber,assetError} from './physics-assets.ts';
import {prepareMesh} from '../puppet-effects/src/mesh-validation.ts';
import type {Signal} from '../../src/core/types.ts';

export type AnimatedXY=readonly [Signal<number>,Signal<number>];
export interface ImagePin {
 /** Source-image coordinates, top-left [0,0], bottom-right [1,1]. */
 at:readonly [number,number];
 /** Absolute target in the same normalized space; may extend outside the image. */
 to?:AnimatedXY;
 /** Added to at/to, in fractions of source image width/height. Right/down positive. */
 offset?:AnimatedXY;
}
export interface PuppetLayoutOptions {
 pins:Readonly<Record<string,ImagePin>>;
 segments?:readonly [number,number];margin?:number;maxValueBytes?:number;
}
function pair(v:unknown,name:string):asserts v is [unknown,unknown]{if(!Array.isArray(v)||v.length!==2)assetError(name+' requires two components');}
export function checkImagePins(pins:PuppetLayoutOptions['pins']){
 if(!pins||typeof pins!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(pins)))assetError('Puppet pins must be a plain named dictionary');
 const names=Reflect.ownKeys(pins);if(!names.length)assetError('At least one Puppet pin is required');
 const used=new Set<string>();
 for(const name of names){const field=Object.getOwnPropertyDescriptor(pins,name)!;
  if(typeof name!=='string'||!name||!field.enumerable||!('value'in field))assetError('Puppet pin names must be enumerable data properties');
  const pin=field.value as ImagePin;assetOptions(pin,['at','to','offset'],'Puppet pin');pair(pin.at,'pin at');
  pin.at.forEach(v=>assetNumber(v,'pin at',0,1));const key=pin.at.join(',');if(used.has(key))assetError('Two named pins cannot constrain the same source point');used.add(key);
  if(pin.to!==undefined)pair(pin.to,'pin to');if(pin.offset!==undefined)pair(pin.offset,'pin offset');
 }
}
/** A rectangular image grid, not alpha-contour meshing. Insert every authored
 * pin row/column exactly, so there is no hidden nearest-vertex snapping. */
export function imagePuppetLayout(width:number,height:number,sourceWidth:number,sourceHeight:number,o:PuppetLayoutOptions){
 checkImagePins(o.pins);for(const n of [width,height,sourceWidth,sourceHeight])if(!Number.isSafeInteger(n)||n<1)assetError('Puppet image dimensions must be positive integers');
 const segments=o.segments??[6,8];pair(segments,'segments');for(const n of segments)if(!Number.isSafeInteger(n)||n<1)assetError('Puppet grid segments must be positive integers');
 const margin=assetNumber(o.margin??.12,'margin',0,.49),budget=assetNumber(o.maxValueBytes??64*1024**2,'maxValueBytes',1),pins=Object.entries(o.pins);
 // Prove the upper bound before constructing coordinate or vertex arrays.
 const bound=(segments[0]+1+pins.length)*(segments[1]+1+pins.length);
 if(!Number.isSafeInteger(bound)||bound*160>budget||bound>LIMITS.vertices)assetError('Puppet grid plan exceeds maxValueBytes or existing Graphics-v1 limits');
 const xs=[...new Set([...Array.from({length:segments[0]+1},(_,i)=>i/segments[0]),...pins.map(([,p])=>p.at[0])])].sort((a,b)=>a-b);
 const ys=[...new Set([...Array.from({length:segments[1]+1},(_,i)=>i/segments[1]),...pins.map(([,p])=>p.at[1])])].sort((a,b)=>a-b);
 const vertices=xs.length*ys.length,indexCount=(xs.length-1)*(ys.length-1)*6;
 if(indexCount>LIMITS.array||vertices*64+indexCount*8>budget)assetError('Puppet topology exceeds the existing value budget');
 const aspect=width/height,sourceAspect=sourceWidth/sourceHeight;
 const w=Math.min(2*aspect*(1-2*margin),2*(1-2*margin)*sourceAspect),h=w/sourceAspect;
 const world=(uv:readonly [number,number]):Vec2=>[(uv[0]-.5)*w,(.5-uv[1])*h];
 const uv:Vec2[]=ys.flatMap(y=>xs.map(x=>[x,y] as Vec2)),indices:number[]=[];
 for(let y=0;y<ys.length-1;y++)for(let x=0;x<xs.length-1;x++){const a=y*xs.length+x,b=a+1,c=a+xs.length,d=c+1;indices.push(a,c,b,b,c,d);}
 const mesh:MeshData=validateMeshData({schema:'frameweave.mesh',version:1,id:'creation.image-puppet',coordinates:{spaceId:'creation.image-puppet',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:uv.map((_,i)=>'v'+i),restPositions:uv.map(p=>[...world(p),0]),uv,uvOrigin:'top-left',indices});
 prepareMesh(mesh); // Retain the original numeric scale/conditioning checks.
 const byName=Object.fromEntries(pins.map(([name,p])=>[name,mesh.vertexIds[ys.indexOf(p.at[1])*xs.length+xs.indexOf(p.at[0])]]));
 return {mesh,byName,world,bounds:{left:-aspect,right:aspect,bottom:-1,top:1},imageSize:[w,h] as Vec2};
}
