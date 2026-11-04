// Test-only F64/CPU references. Never imported into a production Stage.
import {pixelsFromSurface,surfaceFromPixels,linear709,type ProfessionalSurface} from '../../../src/media/surface.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import * as pa from '../../pro-animation/src/professional.ts';
import {displaceWithMap} from '../../pro-animation/src/procedural.ts';
import {surfaceFromCoverage} from '../../pro-animation/src/coverage.ts';
import {coverageValues,ink,shadowOptions,displacementOptions} from './cases.ts';
import type {NativePaImageFilters} from './filters.ts';
/** Independent positive 2D F64 convolution of F32 complements. The source is
 * zero-padded BEFORE complement; far outside the source the complement is 1. */
export function shadowReference(input:ProfessionalSurface,variant=0,opacity=shadowOptions.opacity){const o=variant===1?{...shadowOptions,offset:[100000000,0] as const}:variant===2?{...shadowOptions,radius:0,offset:[0,0] as const}:shadowOptions,p=pixelsFromSurface(input),r=Math.ceil(3*o.radius),w=o.radius===0?[1]:Array.from({length:2*r+1},(_,i)=>Math.exp(-.5*((i-r)/o.radius)**2)),sum=w.reduce((a,b)=>a+b,0),cache=new Map<string,number>();for(let i=0;i<w.length;i++)w[i]/=sum;
 const horizontal=new Map<string,number>(),h=(x:number,y:number)=>{const key=x+','+y,previous=horizontal.get(key);if(previous!==undefined)return previous;let value=0;for(let i=-r;i<=r;i++){const xx=x+i,a=xx<0||y<0||xx>=input.width||y>=input.height?0:p[(y*input.width+xx)*4+3];value+=Math.fround(1-a)*w[i+r];}value=Math.fround(value);horizontal.set(key,value);return value;};
 const g=(x:number,y:number)=>{const key=x+','+y,previous=cache.get(key);if(previous!==undefined)return previous;let value=0;for(let j=-r;j<=r;j++)value+=h(x,y+j)*w[j+r];value=Math.fround(value);cache.set(key,value);return value;};
 const out=new Float32Array(p.length);for(let y=0;y<input.height;y++)for(let x=0;x<input.width;x++){const sx=x-o.offset[0],sy=y-o.offset[1],ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,soft=g(ix,iy)*(1-fx)*(1-fy)+g(ix+1,iy)*fx*(1-fy)+g(ix,iy+1)*(1-fx)*fy+g(ix+1,iy+1)*fx*fy,at=(y*input.width+x)*4,coverage=opacity*p[at+3];out.set([Math.fround(2*soft)*coverage,Math.fround(-.25*soft)*coverage,Math.fround(.5*soft)*coverage,Math.fround(soft)*coverage],at);}return surfaceFromPixels(input.width,input.height,out,{format:input.format,color:input.color,alpha:'premultiplied'});}
export function reference(name:keyof NativePaImageFilters,input:ProfessionalSurface,map:ProfessionalSurface,c:FrameContext,variant=0):ProfessionalSurface{switch(name){
 case 'blur':return pa.blur(input,{radius:variant===1?0:.7,boundary:variant===2?'clamp':'transparent'},c);
 case 'glow':return pa.glow(input,{radius:.8,intensity:variant===1?0:1.3,threshold:.4,boundary:'clamp'},c);
 case 'displacement':return pa.displacement(input,displacementOptions(c,variant),c);
 case 'displaceWithMap':return displaceWithMap(input,map,{encoding:'rg-offset-px',scale:-.71300000001,boundary:variant===1?'clamp':'transparent'},c);
 case 'surfaceFromCoverage':return surfaceFromCoverage(coverageValues(input.width,input.height),{width:input.width,height:input.height,ink,workingColor:linear709,format:input.format==='rgba16float'?'rgba16float':'rgba32float'});
 case 'innerShadow':return shadowReference(input,variant);
 }}
export function chainReference(input:ProfessionalSurface,c:FrameContext){let v=pa.displacement(input,{amount:2.713,frequency:2.71,seed:2147483647,time:c.time},c);v=shadowReference(v,0,.7);return pa.glow(v,{radius:.8,intensity:.4},c);}
