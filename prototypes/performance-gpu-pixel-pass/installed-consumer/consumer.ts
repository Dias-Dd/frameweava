import {
  createGpuEffectChain,linear709,surfaceFromPixels,
  type FrameContext,type ProfessionalSurface,type GpuEffectChain,type GpuEffectChainOptions,
  type FloatPixelPass,type FloatPixelPassOptions,type FloatPixelPassResult,type FloatPixelPassStats,
} from '@frameweave/engine/native';

const factory:(options:GpuEffectChainOptions)=>Promise<GpuEffectChain>=createGpuEffectChain;
const gaussian={kind:'gaussian',radius:.7,boundary:'clamp'} satisfies FloatPixelPass;
const glow={kind:'glow',radius:1,threshold:1,intensity:.5,boundary:'transparent'} satisfies FloatPixelPass;
const output:FloatPixelPassOptions={workingColor:linear709,format:'rgba32float',alpha:'premultiplied',maxBufferBytes:1024*1024};
const input:ProfessionalSurface=surfaceFromPixels(1,1,new Float32Array([2,-.5,.25,.5]),{format:'rgba32float',color:linear709,alpha:'premultiplied'});

export async function consume(chain:GpuEffectChain,canvas:HTMLCanvasElement,context:FrameContext):Promise<ProfessionalSurface|string>{
  const process:(input:ProfessionalSurface,pass:FloatPixelPass,options?:FloatPixelPassOptions)=>Promise<FloatPixelPassResult>=chain.tryProcessSurface;
  void process;
  const result=await chain.tryProcessSurface(input,gaussian,output);
  const stats:FloatPixelPassStats=result.stats;
  const version:1=stats.version;
  const backend:'webgpu'=stats.backend;
  const duration:number|null=stats.lastWallMs;
  void version;void backend;void duration;
  await chain.tryProcessSurface(input,glow,output);
  const borrowed:HTMLCanvasElement=await chain.render(canvas,context);
  void borrowed;
  await chain.complete();await chain.resize(1,1);
  const oldStats=chain.stats();const width:number=oldStats.width;void width;
  await chain.dispose();
  if(result.status==='rendered')return result.surface;
  const commit:'none'=result.commitState;
  const diagnostic:string=result.diagnostic.code;
  return commit+diagnostic;
}

// Public union remains closed; these must fail without casts or permissive any.
// @ts-expect-error Arbitrary shader fields are not part of the resolved pass.
const shader:FloatPixelPass={kind:'gaussian',radius:1,code:'arbitrary shader'};
// @ts-expect-error Authored CPU callbacks are not GPU pass descriptors.
const callback:FloatPixelPass=()=>new Float32Array(4);
// @ts-expect-error Radius must already be a resolved finite-number parameter.
const unresolved:FloatPixelPass={kind:'gaussian',radius:'one'};
void factory;void shader;void callback;void unresolved;
