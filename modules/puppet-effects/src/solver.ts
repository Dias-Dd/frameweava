import type {ModuleLoader} from '../../../src/plugins/sdk.ts';
import {createModuleClient} from '../runtime/client.ts';
import type {MeshData,Vec2,Vec3,Puppet,PuppetOptions,PuppetConstraints,PuppetResult} from './types.ts';
import {puppetError} from './puppet-error.ts';
import {prepareMesh} from './mesh-validation.ts';
export {puppetError,prepareMesh};
function finite(v:unknown,name:string){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e9)puppetError('E_PUPPET_PARAMETER',name+' must be finite within existing graphics numeric range');return v;}
function point(v:unknown,name:string):Vec2{if(!Array.isArray(v)||v.length!==2)puppetError('E_PUPPET_PARAMETER',name+' must be XY');return [finite(v[0],name),finite(v[1],name)];}
function integer(v:unknown,name:string,min=0){if(!Number.isSafeInteger(v)||(v as number)<min)puppetError('E_PUPPET_PARAMETER',name+' must be a safe integer >= '+min);return v as number;}
export function estimateSolveWork(n:number,t:number,edges:number,refine:number){return (8*n+50)*(108*t+4*n+8*edges)+(refine+1)*2*(4*n+50)*(12*t+2*n+4*edges);}

type Prepared=ReturnType<typeof prepareMesh>;
export function encodeSolve(prepared:Prepared,input:PuppetConstraints,maxWork:number){
  if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['pins','triangleWeights','edges','refine','foldovers'].includes(k)))puppetError('E_PUPPET_PARAMETER','Unknown or invalid solve constraints');
  const {mesh,components,byId}=prepared,n=mesh.vertexIds.length,t=mesh.indices.length/3,refine=integer(input.refine??2,'refine'),edges=input.edges??[];
  if(refine>0xffffffff)puppetError('E_PUPPET_PARAMETER','refine exceeds the bytes-v1 u32 field');
  if(input.foldovers!==undefined&&!['reject','allow'].includes(input.foldovers))puppetError('E_PUPPET_PARAMETER','foldovers must be reject or allow');
  if(!Array.isArray(input.pins)||input.pins.length<1||input.pins.length>n||!Array.isArray(edges))puppetError('E_PUPPET_CONSTRAINT','At least one pin is required; pins/edges must be arrays');
  const index=(id:string)=>{const i=byId.get(id);if(i===undefined)puppetError('E_PUPPET_CONSTRAINT','Unknown vertexId '+String(id));return i;};
  const pins=input.pins.map(p=>{if(!p||typeof p!=='object'||Object.keys(p).some(k=>!['vertexId','position'].includes(k)))puppetError('E_PUPPET_CONSTRAINT','Invalid pin');return {i:index(p.vertexId),p:point(p.position,'pin.position')};});
  if(new Set(pins.map(p=>p.i)).size!==pins.length)puppetError('E_PUPPET_CONSTRAINT','Duplicate vertex pin');
  const anchored=new Set(pins.map(p=>components[p.i]));if(components.some(c=>!anchored.has(c)))puppetError('E_PUPPET_CONSTRAINT','Every topological component needs a pin');
  const weights=input.triangleWeights??Array(t).fill(1);if(!Array.isArray(weights)||weights.length!==t)puppetError('E_PUPPET_PARAMETER','triangleWeights must align to the triangle order');
  const positive=(v:number)=>{const w=finite(v,'weight');if(w<=0)puppetError('E_PUPPET_PARAMETER','Weights must be positive');return w;};
  const targets=edges.map(e=>{if(!e||typeof e!=='object'||Object.keys(e).some(k=>!['from','to','vector','weight'].includes(k)))puppetError('E_PUPPET_CONSTRAINT','Invalid edge target');const i=index(e.from),j=index(e.to);if(i===j)puppetError('E_PUPPET_CONSTRAINT','An edge needs two vertices');return {i,j,p:point(e.vector,'edge.vector'),weight:positive(e.weight)};});
  const estimatedWork=estimateSolveWork(n,t,targets.length,refine);if(!Number.isSafeInteger(estimatedWork)||estimatedWork>maxWork)puppetError('E_PUPPET_BUDGET','Solve envelope exceeds maxSolveWork; increase the reviewed budget explicitly');
  const length=32+n*16+t*20+pins.length*20+targets.length*32;if(length>16*1024*1024)puppetError('E_PUPPET_BUDGET','Input exceeds the existing bytes-v1 per-call boundary');
  const bytes=new Uint8Array(length),v=new DataView(bytes.buffer);let at=0;const u=(x:number)=>{v.setUint32(at,x,true);at+=4;},f=(x:number)=>{v.setFloat64(at,x,true);at+=8;},xy=(p:Vec2)=>{f(p[0]);f(p[1]);};
  for(const x of [0x31505241,n,t,pins.length,targets.length,refine])u(x);f(maxWork);for(const p of mesh.restPositions)xy([p[0],p[1]]);for(const i of mesh.indices)u(i);for(const w of weights)f(positive(w));for(const p of pins){u(p.i);xy(p.p);}for(const e of targets){u(e.i);u(e.j);xy(e.p);f(e.weight);}
  return {bytes,estimatedWork,refine,foldovers:input.foldovers??'reject'};
}
export function decodeSolve(prepared:Prepared,encoded:ReturnType<typeof encodeSolve>,bytes:Uint8Array,signal?:AbortSignal):PuppetResult{
          const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=prepared.mesh.vertexIds.length;if(bytes.byteLength!==16+n*16||v.getUint32(0,true)!==n)puppetError('E_PUPPET_PROTOCOL','Invalid solver output shape');
          const positions:Vec3[]=Array.from({length:n},(_,i)=>[v.getFloat64(16+i*16,true),v.getFloat64(24+i*16,true),prepared.mesh.restPositions[i][2]]),residual=v.getFloat64(8,true);
          if(!Number.isFinite(residual)||residual>1e-8||positions.some(p=>p.some(x=>!Number.isFinite(x)||Math.abs(x)>1e9)))puppetError('E_PUPPET_SOLVE','Invalid numerical result');
          let foldedTriangles=0,collapsedTriangles=0;for(let k=0;k<prepared.mesh.indices.length;k+=3){const [a,b,c]=prepared.mesh.indices.slice(k,k+3).map(i=>positions[i]),area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),ratio=area/prepared.areas[k/3];foldedTriangles+=Number(ratio<0);collapsedTriangles+=Number(Math.abs(ratio)<1e-10);}
          if(encoded.foldovers==='reject'&&(foldedTriangles||collapsedTriangles))puppetError('E_PUPPET_FOLDOVER','Pose folds or collapses triangles; no automatic repair');
          if(signal?.aborted)puppetError('E_PUPPET_CANCELLED','Cancelled solve is not published');return {positions,diagnostics:{backend:'rust-wasm' as const,cgIterations:v.getUint32(4,true),maxRelativeResidual:residual,foldedTriangles,collapsedTriangles,estimatedWork:encoded.estimatedWork}};
}
/** Context-bound factory; R1 initialize supplies only its existing verified loader/Graphics. */
export function createPuppetTools(graphics:{validateMeshData(input:unknown):MeshData},load:ModuleLoader){
  return {async createPuppet(input:MeshData,options:PuppetOptions={}):Promise<Puppet>{
    if(!options||Object.keys(options).some(k=>!['worker','signal','initializationTimeoutMs','maxSolveWork'].includes(k))||options.worker!==undefined&&typeof options.worker!=='boolean')puppetError('E_PUPPET_PARAMETER','Unknown or invalid Puppet options');
    const prepared=prepareMesh(graphics.validateMeshData(input)),maxWork=integer(options.maxSolveWork??256000000,'maxSolveWork',1);
    const client=await createModuleClient(load,{...options,worker:options.worker??true});let disposed=false,busy=false,active:Promise<PuppetResult>|undefined,closing:Promise<{remainingBuffers:number}>|undefined;
    return {
      solve(constraints){if(disposed||closing)puppetError('E_PUPPET_DISPOSED','Puppet is disposed');if(options.signal?.aborted)puppetError('E_PUPPET_CANCELLED','Puppet signal is aborted');if(busy)puppetError('E_PUPPET_BUSY','Await the active solve; calls do not reorder');const encoded=encodeSolve(prepared,constraints,maxWork);busy=true;
        const result=(async()=>{let bytes:Uint8Array;try{bytes=await client.call(1,encoded.bytes,16+prepared.mesh.vertexIds.length*16);}catch(error){const e=error as Error&{code?:string};puppetError(e.code==='E_WASM_CANCELLED'?'E_PUPPET_CANCELLED':'E_PUPPET_SOLVE',e.message+'; Rust -6=work budget, -7=nonconvergence/nonfinite output');}
          return decodeSolve(prepared,encoded,bytes,options.signal);
        })().finally(()=>{busy=false;});active=result;return result;
      },diagnostics:()=>client.diagnostics(),dispose(){return closing??=(async()=>{await active?.catch(()=>{});disposed=true;return client.dispose();})();}
    };
  }};
}
