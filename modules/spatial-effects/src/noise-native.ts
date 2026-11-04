import {evaluate} from '../../../src/core/animation.ts';
import {assertColor,linear709} from '../../../src/media/surface.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import type {GpuPixelScope} from '../../gpu-effects/pixel-types.ts';
import {resolveNoise,assertNoisePosition,type ResolvedNoise} from './noise.ts';
import {specializeNoise} from './noise-specialize.ts';
import {finite,integer,vector,spatialError} from './checks.ts';
import type {NoiseTextureOptions,NoiseTextureRendererOptions} from './noise-renderer.ts';
const nativeNoiseCode=/* wgsl */`
fn ns_state(b:u32)->fnl_state{
 var s=fnlCreateState(bitcast<i32>(paramU32(b)));s.frequency=paramF32(b+1u);s.noise_type=bitcast<i32>(paramU32(b+2u));s.rotation_type_3d=bitcast<i32>(paramU32(b+3u));s.fractal_type=bitcast<i32>(paramU32(b+4u));s.octaves=bitcast<i32>(paramU32(b+5u));s.lacunarity=paramF32(b+6u);s.gain=paramF32(b+7u);s.weighted_strength=paramF32(b+8u);s.ping_pong_strength=paramF32(b+9u);s.cellular_distance_func=bitcast<i32>(paramU32(b+10u));s.cellular_return_type=bitcast<i32>(paramU32(b+11u));s.cellular_jitter_mod=paramF32(b+12u);s.domain_warp_type=bitcast<i32>(paramU32(b+13u));s.domain_warp_amp=paramF32(b+14u);return s;
}
fn ns_vec(b:u32)->vec3f{return vec3f(paramF32(b),paramF32(b+1u),paramF32(b+2u));}
fn pixel(p:vec2u)->vec4f{
 let q=ns_vec(34u)+ns_vec(37u)*f32(p.x)+ns_vec(40u)*f32(p.y);var x=q.x;var y=q.y;var z=q.z;let state=ns_state(0u);let warp=ns_state(16u);var value=0.;
 if(paramU32(32u)==2u){if(paramU32(33u)==1u){fnlDomainWarp2D(warp,&x,&y);}value=fnlGetNoise2D(state,x,y);}else{if(paramU32(33u)==1u){fnlDomainWarp3D(warp,&x,&y,&z);}value=fnlGetNoise3D(state,x,y,z);}
 value=(value+paramF32(51u))*paramF32(50u);let alpha=paramF32(49u);return vec4f((ns_vec(46u)+ns_vec(43u)*value)*alpha,alpha);
}`;
function fields(o:ResolvedNoise){return [o.seed,o.frequency,['openSimplex2','openSimplex2S','cellular','perlin','valueCubic','value'].indexOf(o.algorithm),['none','improveXY','improveXZ'].indexOf(o.rotation3D),['none','fbm','ridged','pingPong'].indexOf(o.fractal.kind),o.fractal.octaves,o.fractal.lacunarity,o.fractal.gain,o.fractal.weightedStrength,o.fractal.pingPongStrength,['euclidean','euclideanSq','manhattan','hybrid'].indexOf(o.cellular.distance),['cellValue','distance','distance2','distance2Add','distance2Sub','distance2Mul','distance2Div'].indexOf(o.cellular.returnType),o.cellular.jitter,0,1];}
const integerFields=new Set([0,2,3,4,5,10,11,13]);
/** Full fixed upstream noise/fractal/domain-warp library, translated at build
 * time. Native GPU execution only; point/control queries retain createNoise(). */
export async function createNativeNoiseTextureRenderer(gpu:GpuPixelScope,options:NoiseTextureRendererOptions){
 if(!options||Object.keys(options).some(k=>!['width','height','workingColor','maxBufferBytes','maxSampleOperations'].includes(k)))spatialError('E_SPATIAL_PARAMETER','Unknown Native noise renderer options');
 const width=integer(options.width,'width'),height=integer(options.height,'height'),maxOps=integer(options.maxSampleOperations??256000000,'maxSampleOperations'),budget=integer(options.maxBufferBytes??256*1024**2,'maxBufferBytes'),working=structuredClone(options.workingColor??linear709);assertColor(working);
 if(working.transfer!=='linear'||working.reference!=='scene')spatialError('E_SPATIAL_COLOR','Scene-linear noise working colour required');
 const plannedBytes=width*height*32;if(width>16384||height>16384||width*height*16>512*1024**2||!Number.isSafeInteger(plannedBytes)||plannedBytes>budget)spatialError('E_SPATIAL_GPU_BUDGET','Complete Native noise target exceeds dimensions/bytes budget');
 const kernels=new Map<string,Promise<import('../../gpu-effects/pixel-types.ts').GpuPixelKernel>>();let disposed=false,busy=false,renders=0,lastInputs:unknown;
 return {async render(source:NoiseTextureOptions,context:FrameContext,format:'rgba16float'|'rgba32float'='rgba32float'){
  if(disposed)spatialError('E_SPATIAL_GPU_DISPOSED','Native noise renderer disposed');if(busy)spatialError('E_SPATIAL_GPU_BUSY','Await Native noise recording');
  if(!source||Object.keys(source).some(k=>!['noise','dimensions','origin','stepX','stepY','motion','ink','base','alpha','gain','bias'].includes(k)))spatialError('E_SPATIAL_PARAMETER','Unknown noise texture option');if(!['rgba16float','rgba32float'].includes(format))spatialError('E_SPATIAL_COLOR','Explicit F16/F32 output required');
  finite(context.time,'Stage time');const o=resolveNoise(source.noise),dimensions=source.dimensions??2;if(![2,3].includes(dimensions))spatialError('E_SPATIAL_PARAMETER','Noise dimensions must be2 or3');
  const origin=vector(source.origin??[0,0,0],'origin'),stepX=vector(source.stepX??[1,0,0],'stepX'),stepY=vector(source.stepY??[0,1,0],'stepY'),motion=vector(source.motion??[0,0,0],'motion');for(let i=0;i<3;i++)origin[i]+=motion[i]*context.time;
  for(const x of [0,width-1])for(const y of [0,height-1])assertNoisePosition(origin.map((v,i)=>v+stepX[i]*x+stepY[i]*y),o);
  const w=o.warp,operations=width*height*((o.fractal.kind==='none'?1:o.fractal.octaves)+(w?w.mode==='single'?1:w.octaves:0));if(!Number.isSafeInteger(operations)||operations>maxOps)spatialError('E_SPATIAL_NOISE_BUDGET','Complete octave plan exceeds maxSampleOperations');
  if(o.fractal.octaves>2147483647||w&&w.octaves>2147483647)spatialError('E_SPATIAL_NOISE_RANGE','GPU octaves require signed32');
  const noise=fields(o),warp=[...noise];if(w){warp[0]=w.seed;warp[1]=w.frequency;warp[4]={single:0,progressive:4,independent:5}[w.mode];warp[5]=w.octaves;warp[6]=w.lacunarity;warp[7]=w.gain;warp[13]=['openSimplex2','openSimplex2Reduced','basicGrid'].indexOf(w.kind);warp[14]=w.amplitude;}
  const ink=vector(source.ink??[1,1,1],'ink'),base=vector(source.base??[0,0,0],'base'),alpha=finite(evaluate(source.alpha??1,context),'alpha',0,1),gain=finite(evaluate(source.gain??1,context),'gain'),bias=finite(evaluate(source.bias??0,context),'bias'),p=new Float32Array(52),words=new Uint32Array(p.buffer),signed=new Int32Array(p.buffer);
  for(const [offset,state]of [[0,noise],[16,warp]] as const)state.forEach((value,i)=>{if(integerFields.has(i))signed[offset+i]=value;else p[offset+i]=value;});words[32]=dimensions;words[33]=Number(!!w);p.set(origin,34);p.set(stepX,37);p.set(stepY,40);p.set(ink,43);p.set(base,46);p.set([alpha,gain,bias],49);
  for(const value of [...noise,...warp,...origin,...stepX,...stepY,...ink,...base,alpha,gain,bias])if(!Number.isFinite(Math.fround(value))||value!==0&&Math.fround(value)===0)spatialError('E_SPATIAL_GPU_RANGE','Noise uniforms must fit finite nonzero F32');
  busy=true;try{const key=[dimensions,noise[2],noise[4],noise[3],warp[13],warp[4],Number(!!w)].join('-');let kernel=kernels.get(key);if(!kernel){const selected=nativeNoiseCode;
    // Replace the complete pixel branch, avoiding references to intentionally
    // absent functions from the other dimensionality or disabled warp.
    const from=selected.indexOf(' if('),to=selected.indexOf('\n value=',from),pixel=' '+(w?`fnlDomainWarp${dimensions}D(warp,&x,&y${dimensions===3?',&z':''});`:'')+`value=fnlGetNoise${dimensions}D(state,x,y${dimensions===3?',z':''});`;
    const code=specializeNoise(dimensions as 2|3,noise[2],noise[4],noise[3],warp[13],warp[4],!!w)+selected.slice(0,from)+pixel+selected.slice(to);kernel=gpu.compile({abiVersion:1,id:'frameweave/spatial-effects/fnl-native/'+key,version:'0.2.0',inputCount:0,parameterWords:52,code});kernels.set(key,kernel);kernel.catch(()=>kernels.delete(key));}
   const image=await gpu.run(await kernel,[],{parameters:words,output:{width,height,format,alpha:'premultiplied',color:working}});renders++;lastInputs={noise,warp,dimensions,enabled:!!w,origin,stepX,stepY,ink,base,style:[alpha,gain,bias]};return image;}finally{busy=false;}
 },stats:()=>({disposed,renders,plannedBytes,maxSampleOperations:maxOps,lastInputs:structuredClone(lastInputs),backend:'native-wgpu',upstream:'FastNoiseLite1.1.1',physicalGpuPeakBytes:null}),async dispose(){if(busy)spatialError('E_SPATIAL_GPU_BUSY','Await Native noise recording');disposed=true;}};
}
