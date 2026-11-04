// SPDX-License-Identifier: MIT
// Classic marching-cubes edge/triangle cases from pinned Three0.186.1/MIT.
// F64 interpolation, gradient preparation, capacity preflight and Graphics adapter are authored adaptations.
import {edgeTable,triTable} from 'three/addons/objects/MarchingCubes.js';
import {validateMeshData} from '../../graphics-contracts/validate.ts';
import {assertJson,checkSignals} from '../../../src/core/graph.ts';
import {evaluate} from '../../../src/core/animation.ts';
import {object,dense,integer,number,vector,localContext,signalVector} from './check.ts';
import type {Vec3,FrameContext} from './types.ts';
import type {IsosurfaceGeometryOptions,IsosurfaceGeometry,IsosurfaceSampleOptions,IsosurfaceSample,MetaballSampleOptions} from './isosurface-types.ts';
const corners:Vec3[]=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const typedPrototype=Object.getPrototypeOf(Float64Array.prototype),nativeBuffer=Object.getOwnPropertyDescriptor(typedPrototype,'buffer')!.get!,nativeLength=Object.getOwnPropertyDescriptor(typedPrototype,'length')!.get!,nativeTag=Object.getOwnPropertyDescriptor(typedPrototype,Symbol.toStringTag)!.get!,privateByteLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength')!.get!;
const caseTriangles=Array.from({length:256},(_,c)=>{let n=0;while(n<16&&triTable[c*16+n]!==-1)n++;return n/3;});
function fail(code:string,message:string,details?:Record<string,number>):never {throw Object.assign(new Error(message),{code:'E_ISOSURFACE_'+code,...details?{details}:{}});}
function translated(e:unknown):never {const v=e as {code?:string;message?:string};if(v.code?.startsWith('E_RIG_'))throw Object.assign(new Error(v.message,{cause:e}),{code:v.code.replace('E_RIG_','E_ISOSURFACE_')});throw e;}
function scalar(v:unknown,fallback:number,name:string,context?:FrameContext,min=-Number.MAX_VALUE){const data=v??fallback;assertJson(data);checkSignals(data);if(typeof data!=='number'&&!context)fail('CONTEXT',name+' Signal requires FrameContext');return number(context?evaluate(data,context):data,name,min);}
const unit=(v:Vec3):Vec3|null=>{const length=Math.hypot(...v);return length>0&&Number.isFinite(length)?v.map(x=>x/length) as Vec3:null;};

/** CPU geometry only; no material pixels, GPU context, simulation clock or history cache. */
export function createIsosurfaceGeometry(options:IsosurfaceGeometryOptions):IsosurfaceGeometry {try{
  const o=object(options,'isosurface geometry',['id','cells','bounds','inside','triangleCapacity','coordinates','maxVerticesPerMesh','maxBytes','maxWork']);
  if(typeof o.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(o.id))fail('PARAMETER','Explicit stable ID, at most96 Graphics-safe characters required');
  const raw=dense(o.cells??[24,24,24],'cells');if(raw.length!==3)fail('PARAMETER','Three cell counts required');const cells=raw.map(v=>integer(v,'cells')) as [number,number,number],dims=cells.map(x=>x+1),sampleCount=dims.reduce((a,b)=>a*b,1),cellCount=cells.reduce((a,b)=>a*b,1),capacity=integer(o.triangleCapacity??10000,'triangleCapacity'),maxVertices=integer(o.maxVerticesPerMesh??16384,'maxVerticesPerMesh',3,16384),chunkTriangles=Math.floor(maxVertices/3),chunkCount=Math.ceil(capacity/chunkTriangles),maxBytes=integer(o.maxBytes??128*1024*1024,'maxBytes'),maxWork=integer(o.maxWork??100000000,'maxWork'),plannedBytes=sampleCount*40+cellCount+capacity*3*240,plannedWork=sampleCount*96+cellCount*32+capacity*192,inside=o.inside??'above';
  if(inside!=='above'&&inside!=='below')fail('PARAMETER','inside must be above or below');
  if(![...dims,sampleCount,cellCount,capacity*3,chunkCount,plannedBytes,plannedWork].every(Number.isSafeInteger)||plannedBytes>maxBytes||plannedWork>maxWork)fail('BUDGET','Grid/triangle plan exceeds explicit bytes/work or numeric domain');
  const bounds=object(o.bounds??{min:[-1,-1,-1],max:[1,1,1]},'bounds',['min','max']),min=vector(bounds.min,'bounds.min'),max=vector(bounds.max,'bounds.max'),extent=min.map((x,k)=>number(max[k]-x,'extent',Number.MIN_VALUE)),spacing=extent.map((x,k)=>number(x/cells[k],'spacing',Number.MIN_VALUE)),minimumSpacing=Math.min(...spacing);
  if(spacing.some((h,k)=>min[k]+h===min[k]||max[k]-h===max[k]))fail('RANGE','Grid stations collapse in F64; use local coordinates and an explicit model');
  const coordinates=o.coordinates??{spaceId:'isosurface.world',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},chunks:{start:number;count:number;id:string}[]=[],meshes=[];
  for(let start=0;start<capacity;start+=chunkTriangles){const count=Math.min(chunkTriangles,capacity-start),id=chunkCount===1?o.id:o.id+'.'+chunks.length,vertices=count*3;chunks.push({start,count,id});meshes.push(validateMeshData({schema:'frameweave.mesh',version:1,id,coordinates,topology:'triangles',vertexIds:Array.from({length:vertices},(_,i)=>'v'+i),restPositions:Array.from({length:vertices},()=>[0,0,0]),indices:Array.from({length:count},(_,i)=>inside==='above'?[i*3,i*3+1,i*3+2]:[i*3,i*3+2,i*3+1]).flat()}));}
  let field=new Float64Array(sampleCount),gradients=new Float64Array(sampleCount*3),gradientReady=new Uint8Array(sampleCount),masks=new Uint8Array(cellCount),disposed=false;
  const strides=[1,dims[0],dims[0]*dims[1]],index=(x:number,y:number,z:number)=>x+y*strides[1]+z*strides[2],offsets=corners.map(c=>index(...c));
  function check(){if(disposed)fail('DISPOSED','Isosurface geometry disposed');}
  function extract(level:number):IsosurfaceSample {
    let maximum=Math.abs(level);for(const value of field)maximum=Math.max(maximum,Math.abs(value));if(maximum===0)maximum=1;
    let triangleCount=0,cell=0;
    for(let z=0;z<cells[2];z++)for(let y=0;y<cells[1];y++)for(let x=0;x<cells[0];x++){const base=index(x,y,z);let mask=0;for(let c=0;c<8;c++)if(field[base+offsets[c]]<level)mask|=1<<c;masks[cell++]=mask;triangleCount+=caseTriangles[mask];}
    if(triangleCount>capacity)fail('CAPACITY','Complete surface needs '+triangleCount+' triangles; increase explicit triangleCapacity',{requiredTriangles:triangleCount,triangleCapacity:capacity});
    gradientReady.fill(0);
    function gradient(q:number,xyz:Vec3):Vec3 {if(!gradientReady[q]){for(let k=0;k<3;k++){const lo=xyz[k]>0,hi=xyz[k]<cells[k],a=q-(lo?strides[k]:0),b=q+(hi?strides[k]:0);gradients[q*3+k]=(field[b]/maximum-field[a]/maximum)/(Number(lo)+Number(hi))*(minimumSpacing/spacing[k]);}gradientReady[q]=1;}return [gradients[q*3],gradients[q*3+1],gradients[q*3+2]];}
    const positions:Vec3[]=[],normals:Vec3[]=[];let gradientFallbacks=0;cell=0;
    for(let z=0;z<cells[2];z++)for(let y=0;y<cells[1];y++)for(let x=0;x<cells[0];x++){
      const mask=masks[cell++],bits=edgeTable[mask];if(!bits)continue;const base=index(x,y,z),vertices:Vec3[]=Array(12),directions:(Vec3|null)[]=Array(12);
      for(let e=0;e<12;e++)if(bits&(1<<e)){const [ai,bi]=edges[e],a=corners[ai],b=corners[bi],qa=base+offsets[ai],qb=base+offsets[bi],va=field[qa],vb=field[qb],scale=Math.max(Math.abs(va),Math.abs(vb),Math.abs(level)),t=number((level/scale-va/scale)/(vb/scale-va/scale),'edge fraction',0,1),origin:Vec3=[x,y,z];
        vertices[e]=origin.map((v,k)=>number(min[k]+extent[k]*((v+a[k]+(b[k]-a[k])*t)/cells[k]),'surface position')) as Vec3;
        const ga=gradient(qa,origin.map((v,k)=>v+a[k]) as Vec3),gb=gradient(qb,origin.map((v,k)=>v+b[k]) as Vec3),sign=inside==='above'?-1:1;directions[e]=unit(ga.map((v,k)=>sign*(v+(gb[k]-v)*t)) as Vec3);
      }
      for(let t=0;t<caseTriangles[mask];t++){const edgeIds=Array.from({length:3},(_,j)=>triTable[mask*16+t*3+j]),p=edgeIds.map(e=>vertices[e]),a=unit(p[1].map((v,k)=>v-p[0][k]) as Vec3),b=unit(p[2].map((v,k)=>v-p[0][k]) as Vec3),sign=inside==='above'?1:-1,face=a&&b?unit([sign*(a[1]*b[2]-a[2]*b[1]),sign*(a[2]*b[0]-a[0]*b[2]),sign*(a[0]*b[1]-a[1]*b[0])]):null;
        for(let j=0;j<3;j++){positions.push([...p[j]]);const n=directions[edgeIds[j]];if(!n)gradientFallbacks++;normals.push([...(n??face??[0,1,0])]);}
      }
    }
    const draws=chunks.map(c=>{const activeCount=Math.max(0,Math.min(c.count,triangleCount-c.start))*3,p:Vec3[]=Array.from({length:c.count*3},(_,i)=>i<activeCount?positions[c.start*3+i]:[...min]),n:Vec3[]=Array.from({length:c.count*3},(_,i)=>i<activeCount?normals[c.start*3+i]:[0,1,0]);return {id:c.id,positions:p,normals:n,visible:activeCount>0};});
    return {draws,triangleCount,active:triangleCount>0,level,gradientFallbacks};
  }
  function sample(input:IsosurfaceSampleOptions):IsosurfaceSample {try{check();const s=object(input,'isosurface sample',['values','level','context']),context=s.context===undefined?undefined:localContext(s.context),values=s.values;
    let length:number;if(Array.isArray(values)){dense(values,'values');length=values.length;}else {if(!ArrayBuffer.isView(values)||!['Float32Array','Float64Array'].includes(nativeTag.call(values)))fail('PARAMETER','Use dense scalar arrays or actual Float32/64Array, not proxy/non-float data');try{privateByteLength.call(nativeBuffer.call(values));}catch{fail('PARAMETER','Shared backing is not a private ArrayBuffer');}length=nativeLength.call(values);}
    const samples=values as ArrayLike<unknown>;if(length!==sampleCount)fail('SHAPE','Expected '+sampleCount+' x-fastest scalar samples');for(let i=0;i<sampleCount;i++)field[i]=number(samples[i],'field scalar');return extract(scalar(s.level,0,'level',context));
  }catch(e){translated(e);}}
  function sampleMetaballs(input:MetaballSampleOptions):IsosurfaceSample {try{check();const s=object(input,'metaball sample',['balls','context','level']),context=localContext(s.context),list=dense(s.balls,'balls');if(!Number.isSafeInteger(plannedWork+sampleCount*list.length*32)||plannedWork+sampleCount*list.length*32>maxWork)fail('BUDGET','Metaball field work exceeds configured budget');const balls=list.map(v=>{const b=object(v,'metaball',['center','radius','strength']);if(!Object.hasOwn(b,'radius'))fail('PARAMETER','Metaball support radius is required');return {center:signalVector(b.center,'center',context),radius:scalar(b.radius,1,'radius',context,Number.MIN_VALUE),strength:scalar(b.strength,1,'strength',context)};});
    for(let z=0;z<dims[2];z++)for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++){const p=[x,y,z].map((v,k)=>min[k]+extent[k]*(v/cells[k]));let value=0;for(const b of balls){const d=Math.hypot(...p.map((v,k)=>(v-b.center[k])/b.radius)),q=Math.max(0,1-d*d);value=number(value+b.strength*q*q*q,'metaball density');}field[index(x,y,z)]=value;}return extract(scalar(s.level,.125,'level',context));
  }catch(e){translated(e);}}
  return {meshes,sample,sampleMetaballs,describe(){check();return {cells:[...cells],samples:sampleCount,triangleCapacity:capacity,chunks:chunkCount,vertices:capacity*3,plannedBytes,plannedWork,maxBytes,maxWork,inside};},dispose(){if(disposed)return;disposed=true;field=new Float64Array(0);gradients=new Float64Array(0);gradientReady=new Uint8Array(0);masks=new Uint8Array(0);}};
}catch(e){translated(e);}}
