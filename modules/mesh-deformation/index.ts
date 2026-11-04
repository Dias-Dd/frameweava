import {withGpuResources} from '../gpu-effects/index.ts';
import type {GpuDataBuffer,GpuPixelScope,GpuComputeKernel} from '../gpu-effects/index.ts';
import type * as T from './types.ts';
import {prepare,position,compatible,like,vec,num,scalar,animated,axis,unit,fail} from './parameters.ts';
import {code} from './kernels.ts';
export type * from './types.ts';
let cache:WeakMap<GpuPixelScope,Map<string,Promise<GpuComputeKernel>>>|undefined;
async function run(g:GpuPixelScope,name:string,inputs:GpuDataBuffer[],p:Float32Array,o:T.DeformOptions){return withGpuResources(g,async arena=>{
 cache??=new WeakMap();let programs=cache.get(g);if(!programs){programs=new Map();cache.set(g,programs);}let program=programs.get(name);if(!program){program=g.compileCompute({abiVersion:1,id:'frameweave/mesh-deformation/'+name,version:'0.1.4',bindings:[...inputs.map(()=>({type:'f32' as const,access:'read' as const})),{type:'f32',access:'read_write'}],parameterWords:48,workgroupSize:[64,1,1],code:code(name,inputs.length)});programs.set(name,program);program.catch(()=>{if(programs!.get(name)===program)programs!.delete(name);});}
 // The owner gate is single-operation: compilation must finish before allocation.
 const kernel=await program;
 if(g.stats().pendingPasses>=g.capabilities().maxPendingPasses-1)await g.complete({signal:o.signal});const out=arena.buffer(await g.createField(like(inputs[0])));await g.dispatch(kernel,[...inputs,out],{workItems:inputs[0].info.dimensions,parameters:p,signal:o.signal});return arena.keep(out);
 });}
function axial(p:Float32Array,o:T.AxisOptions,toward?:T.Axis){const a=axis(o.axis),b=toward===undefined?(a+1)%3:axis(toward);if(a===b)fail('PARAMETER','Axes must differ');new Uint32Array(p.buffer).set([a,b],44);}
const input=(v:GpuDataBuffer,c:T.FrameContext,o:T.DeformOptions,keys:string[],cost?:number)=>prepare(o,keys,c,position(v),cost);
/** Scale, intrinsic X/Y/Z rotations in radians, then translation about center. */
export async function transformPositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.TransformOptions={}){const p=input(v,c,o,['translation','rotation','scale']);p.set(animated(o.scale,[1,1,1],c,'scale'),4);p.set(animated(o.rotation,[0,0,0],c,'rotation'),7);p.set(animated(o.translation,[0,0,0],c,'translation'),10);return run(g,'transform',[v],p,o);}
/** Axial twist; rate radians/meter, offset radians. */
export async function twistPositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.TwistOptions={}){const p=input(v,c,o,['axis','rate','offset']);axial(p,o);p[6]=scalar(o.rate,.5,c,'rate',-128,128);p[7]=scalar(o.offset,0,c,'offset',-1e4,1e4);return run(g,'twist',[v],p,o);}
/** Cylindrical bend preserving the axial centerline arc length; stable at zero curvature. */
export async function bendPositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.BendOptions={}){const p=input(v,c,o,['axis','toward','curvature']);axial(p,o,o.toward);p[6]=scalar(o.curvature,.4,c,'curvature',-128,128);return run(g,'bend',[v],p,o);}
/** Linear signed transverse scale. Negative scales intentionally permit inversion. */
export async function taperPositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.TaperOptions={}){const p=input(v,c,o,['axis','slope']);axial(p,o);p[6]=scalar(o.slope,.25,c,'slope',-128,128);return run(g,'taper',[v],p,o);}
/** Area/volume preserving single-plane shear. */
export async function shearPositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.ShearOptions={}){const p=input(v,c,o,['axis','toward','amount']);axial(p,o,o.toward);p[6]=scalar(o.amount,.5,c,'amount',-128,128);return run(g,'shear',[v],p,o);}
/** Positive axial stretch; transverse compensation yields unit determinant when requested. */
export async function stretchPositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.StretchOptions={}){const p=input(v,c,o,['axis','factor','preserveVolume']);axial(p,o);p[6]=scalar(o.factor,1.3,c,'factor',1e-4,1e4);if(o.preserveVolume!==undefined&&typeof o.preserveVolume!=='boolean')fail('PARAMETER','preserveVolume must be boolean');new Uint32Array(p.buffer)[7]=Number(o.preserveVolume??true);return run(g,'stretch',[v],p,o);}
/** Compact cosine bulge in |axial distance| < length/2; no cumulative state. */
export async function bulgePositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.BulgeOptions={}){const p=input(v,c,o,['axis','amplitude','length']);axial(p,o);p[6]=scalar(o.amplitude,.4,c,'amplitude',-1,1e4);p[7]=num(o.length??2,'length',1e-4,1e8);return run(g,'bulge',[v],p,o);}
/** Blend toward a sphere; an exact center vertex stays at center. */
export async function spherifyPositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.SpherifyOptions={}){const p=input(v,c,o,['radius','amount']);p[6]=scalar(o.radius,1,c,'radius',0,1e8);p[7]=scalar(o.amount,1,c,'amount',0,1);return run(g,'spherify',[v],p,o);}
/** Blend radial coordinates toward a cylinder; axial coordinates stay unchanged. */
export async function cylindrifyPositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.CylindrifyOptions={}){const p=input(v,c,o,['axis','radius','amount']);axial(p,o);p[6]=scalar(o.radius,1,c,'radius',0,1e8);p[7]=scalar(o.amount,1,c,'amount',0,1);return run(g,'cylindrify',[v],p,o);}
/** Planar sine displacement, frequency radians/meter, phase explicit existing Signal. */
export async function wavePositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.WaveOptions={}){const p=input(v,c,o,['direction','displacement','amplitude','frequency','phase']);p.set(unit(vec(o.direction??[0,1,0],'direction')),4);p.set(unit(vec(o.displacement??[0,0,1],'displacement')),7);p[10]=scalar(o.frequency,3,c,'frequency',-1e4,1e4);p[11]=scalar(o.phase,0,c,'phase',-1e6,1e6);p[12]=scalar(o.amplitude,.2,c,'amplitude');return run(g,'wave',[v],p,o);}
/** Radial damped ripple displacing along the selected axis. */
export async function ripplePositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.RippleOptions={}){const p=input(v,c,o,['axis','amplitude','frequency','phase','decay']);axial(p,o);p[6]=scalar(o.amplitude,.2,c,'amplitude');p[7]=scalar(o.frequency,5,c,'frequency',-1e4,1e4);p[8]=scalar(o.phase,0,c,'phase',-1e6,1e6);p[9]=num(o.decay??.3,'decay',0,1e4);return run(g,'ripple',[v],p,o);}
/** Seeded trilinear value noise along explicit normals, not a physical solver or fBm. */
export async function noiseDisplacePositions(g:GpuPixelScope,v:GpuDataBuffer,normals:GpuDataBuffer,c:T.FrameContext,o:T.NoiseOptions={}){compatible(v,normals,'normal');const p=input(v,c,o,['amplitude','frequency','offset','seed'],120);p[6]=num(o.frequency??2,'frequency',0,128);p[7]=scalar(o.amplitude,.15,c,'amplitude');p.set(vec(o.offset??[0,0,0],'offset'),8);const seed=num(o.seed??c.seed,'seed',0,0xffffffff);if(!Number.isInteger(seed))fail('PARAMETER','Seed must be u32');new Uint32Array(p.buffer)[12]=seed;const extent=p[3]+Math.max(...Array.from(p.slice(0,3)).map(Math.abs));if(extent*p[6]+Math.max(...Array.from(p.slice(8,11)).map(Math.abs))>2**20)fail('RANGE','Noise coordinates exceed qualified f32 lattice domain');return run(g,'noise',[v,normals],p,o);}
/** Corresponding vertices only; caller retains topology/order, no automatic correspondence. */
export async function morphPositions(g:GpuPixelScope,v:GpuDataBuffer,target:GpuDataBuffer,c:T.FrameContext,o:T.MorphOptions={}){compatible(v,target);const p=input(v,c,o,['amount']);p[6]=scalar(o.amount,.5,c,'amount',0,1);return run(g,'morph',[v,target],p,o);}
/** Eight-corner trilinear free-form cage, no ARAP/elasticity or self-intersection solver. */
export async function cageDeformPositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.CageOptions){const p=input(v,c,o,['min','max','corners','outside'],160),lo=vec(o.min??[-1,-1,-1],'min'),hi=vec(o.max??[1,1,1],'max');if(lo.some((x,i)=>Math.fround(hi[i])-Math.fround(x)<1e-4))fail('PARAMETER','Cage extent must remain positive in f32');p.set(lo,4);p.set(hi,7);if(o.outside!==undefined&&!['extend','preserve'].includes(o.outside))fail('PARAMETER','Unknown outside policy');new Uint32Array(p.buffer)[10]=Number(o.outside==='preserve');if(!Array.isArray(o.corners)||o.corners.length!==8)fail('PARAMETER','Exactly eight XYZ corners required');o.corners.forEach((v,i)=>p.set(vec(v,'corner'),12+i*3));return run(g,'cage',[v],p,o);}
/** Compact C1 radial proportional edit toward target; no attraction integration/time step. */
export async function attractPositions(g:GpuPixelScope,v:GpuDataBuffer,c:T.FrameContext,o:T.AttractOptions={}){const p=input(v,c,o,['target','radius','strength']);p.set(animated(o.target,[0,1,0],c,'target'),6);p[9]=num(o.radius??2,'radius',1e-4,1e8);p[10]=scalar(o.strength,.5,c,'strength',0,1);return run(g,'attract',[v],p,o);}
/** Explicit single publication barrier/readback. Returns detached CPU XYZ copies, never GPU handles.
 * All invalid input/overflow candidates are rejected here. Raw buffers remain provisional. */
export async function readDeformedPositions(g:GpuPixelScope,v:GpuDataBuffer,options:{signal?:AbortSignal}={}):Promise<[number,number,number][]> {const n=position(v),raw=await g.readBuffer(v,options);if(raw.some(x=>!Number.isFinite(x)||Math.abs(x)>1e30))fail('DATA','Invalid coordinate/normal or overflow in GPU deformation chain');return Array.from({length:n},(_,i)=>[raw[3*i],raw[3*i+1],raw[3*i+2]]);}
