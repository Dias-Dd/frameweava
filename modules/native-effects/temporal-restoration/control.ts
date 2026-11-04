import {integer,split,fail} from '../closure-filters/control.ts';
export {integer,split,fail};
export function grainTables(n:number,t:number,nb:number,tb:number,window:'box'|'hann'){
 const one=(i:number,size:number)=>window==='box'||size===1?1:.5-.5*Math.cos(2*Math.PI*i/(size-1)),values:number[]=[];
 for(let z=0;z<t;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++)values.push(...split(one(x,n)*one(y,n)*one(z,t)));
 for(let j=0;j<nb*tb;j++){const angle=2*Math.PI*j/(nb*tb);values.push(...split(Math.cos(angle)),...split(Math.sin(angle)));}return Float32Array.from(values);
}
export function sameColor(a:import('../../../src/media/surface.ts').ColorEncoding,b:import('../../../src/media/surface.ts').ColorEncoding){return a.primaries===b.primaries&&a.whitePoint===b.whitePoint&&a.transfer===b.transfer&&a.reference===b.reference&&a.range===b.range&&a.referenceWhiteNits===b.referenceWhiteNits;}
