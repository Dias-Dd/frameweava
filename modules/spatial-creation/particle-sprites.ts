/*! Earcut 3.0.2, bundled by Three 0.186.1
ISC License

Copyright (c) 2024, Mapbox

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
*/
import {Shape,ShapeGeometry,Path} from 'three';
import {linear709} from '../../src/media/surface.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import type {CreationInit} from './types.ts';
import {assetNumber,assetError} from './physics-assets.ts';

export type FieldSprite='disc'|'ring'|'star'|'petal'|'confetti';
/** Original Three Shape/Earcut triangulation + existing Native drawMesh. CPU
 * geometry only; no CPU pixel texture, custom pixel shader or extra renderer. */
export function spriteGeometry(kind:Exclude<FieldSprite,'disc'>){
 const shape=new Shape();
 if(kind==='ring'){
  shape.absarc(0,0,.9,0,Math.PI*2,false);const hole=new Path();hole.absarc(0,0,.73,0,Math.PI*2,true);shape.holes.push(hole);
 }else if(kind==='star'){
  for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.35:.92,x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();
 }else if(kind==='petal'){
  shape.moveTo(0,-.88);shape.bezierCurveTo(-.9,-.25,-.62,.8,0,.88);shape.bezierCurveTo(.62,.8,.9,-.25,0,-.88);shape.closePath();
 }else if(kind==='confetti'){
  shape.moveTo(-.42,-.8);shape.lineTo(.42,-.8);shape.lineTo(.42,.8);shape.lineTo(-.42,.8);shape.closePath();
 }else assetError('Unknown built-in particle sprite');
 const g=new ShapeGeometry(shape,12);try{const p=g.getAttribute('position');return {positions:Float32Array.from(Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),.5]).flat()),indices:Uint32Array.from(g.index?g.index.array:Array.from({length:p.count},(_,i)=>i))};}finally{g.dispose();}
}
export async function fieldSprite(init:CreationInit,kind:FieldSprite,resolution=64,format:'rgba16float'|'rgba32float'='rgba32float'){
 if(kind==='disc')return undefined;
 assetNumber(resolution,'spriteResolution',1);if(!Number.isSafeInteger(resolution))assetError('spriteResolution must be an integer');
 const mesh=spriteGeometry(kind),owned:GpuDataBuffer[]=[];
 try{
  // Immutable topology belongs to Stage initialization, never a frame epoch.
  const positions=await init.gpu.createField({type:'f32',dimensions:[mesh.positions.length/3,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},mesh.positions);owned.push(positions);
  const indices=await init.gpu.createBuffer({type:'u32',length:mesh.indices.length},mesh.indices);owned.push(indices);
  let closed=false;return {async render(){if(closed)assetError('Particle sprite is disposed');return init.gpu.drawMesh({positions,indices,color:[1,1,1,1],output:{width:resolution,height:resolution,format,alpha:'premultiplied',color:linear709}});},async dispose(){if(closed)return;closed=true;const result=await Promise.allSettled(owned.map(b=>init.gpu.releaseBuffer(b))),errors=result.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Particle sprite cleanup failed');}};
 }catch(error){await Promise.allSettled(owned.map(b=>init.gpu.releaseBuffer(b)));throw error;}
}
