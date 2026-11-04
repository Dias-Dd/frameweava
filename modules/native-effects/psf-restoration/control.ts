import {EngineError} from '../../../src/core/errors.ts';
import {exactSeconds,compareSeconds} from '../image-estimation/time.ts';
import {integer,split} from '../closure-filters/control.ts';
import type {Boundary,PsfGridV1,JointObservation} from './types.ts';
export {integer,split};
export function fail(path:string,expected:string):never{throw new EngineError('E_PSF_RESTORATION_PARAMETER','psfRestoration.'+path+': expected '+expected,{details:{path,expected}});}
export function boundary(value:Boundary|undefined){const i=['zero','clamp','mirror','wrap'].indexOf(value??'clamp');if(i<0)fail('boundary','zero | clamp | mirror | wrap');return i;}
export function gridWeights(grid:PsfGridV1,maxWords:number){
 if(!grid||typeof grid!=='object'||Array.isArray(grid)||Object.keys(grid).some(k=>!['kind','schemaVersion','anchor','columns','rows','kernelWidth','kernelHeight','kernels'].includes(k))||grid.kind!=='frameweave.psf-grid'||grid.schemaVersion!==1||grid.anchor!==undefined&&!['input','output'].includes(grid.anchor))fail('grid','strict frameweave.psf-grid v1 with input or output anchor');
 for(const key of ['columns','rows','kernelWidth','kernelHeight'] as const)if(!Number.isSafeInteger(grid[key])||grid[key]<1||grid[key]>0x7fffffff)fail('grid.'+key,'positive exact dimensions in signed coordinate domain');
 const samples=grid.kernelWidth*grid.kernelHeight,population=grid.columns*grid.rows,total=samples*population;
 if(!(grid.kernelWidth%2)||!(grid.kernelHeight%2)||!Number.isSafeInteger(total)||total*2>maxWords)fail('grid.kernels','odd support and exact pair table within actual device storage budget');
 if(!Array.isArray(grid.kernels)||grid.kernels.length!==population||Array.from(grid.kernels).some(k=>!Array.isArray(k)||k.length!==samples))fail('grid.kernels','one dense full kernel per row-major grid knot');
 const out=new Float32Array(total*2);
 for(const [j,kernel]of grid.kernels.entries()){
  let scale=0;for(const v of Array.from(kernel)){if(typeof v!=='number'||!Number.isFinite(v)||v<0)fail('grid.kernels['+j+']','finite nonnegative weights');scale=Math.max(scale,v);}if(scale===0)fail('grid.kernels['+j+']','positive kernel mass');
  // Scale first: finite weights may have a total larger than MAX_VALUE.
  const sum=kernel.reduce((s:number,x:number)=>s+x/scale,0);if(!Number.isFinite(sum)||sum<=0)fail('grid.kernels['+j+']','finite normalized mass');
  for(let k=0;k<samples;k++)out.set(split((kernel[k]/scale)/sum),(j*samples+k)*2);
 }
 return out;
}
export function orderedObservations(input:readonly JointObservation[]){
 if(!Array.isArray(input)||!input.length||Array.from(input).some(v=>!v||typeof v!=='object'||Array.isArray(v)))fail('observations','a dense nonempty explicit observation list');
 const ids=new Set<string>();for(const [i,v]of input.entries()){
  const fields=v.observed===false?['id','time','observed']:['id','time','observed','alignment','image','psf','mask','weight'];
  if(Object.keys(v).some(k=>!fields.includes(k))||v.observed!==undefined&&typeof v.observed!=='boolean'||typeof v.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(v.id)||ids.has(v.id))fail('observations['+i+']','unique stable ASCII id and known observed/missing fields');
  ids.add(v.id);exactSeconds(v.time,'observations['+i+'].time');if(v.observed!==false&&v.alignment!=='registered-reference')fail('observations['+i+'].alignment','registered-reference; PSFs must be expressed on that same reference pixel grid');
 }
 return [...input].sort((a,b)=>compareSeconds(a.time,b.time)||(a.id<b.id?-1:a.id>b.id?1:0));
}
