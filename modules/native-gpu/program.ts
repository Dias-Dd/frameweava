import {nativeParameters} from './pixel-parameters.ts';
import {nativePixelInfo as pixelInfo} from './image-info.ts';
import {randomBytes} from 'node:crypto';
import type {TVG,StageSpec} from '../../src/core/types.ts';
import {EngineError} from '../../src/core/errors.ts';
import {topologicalLevels,isPortRef} from '../../src/core/graph.ts';
import {nativePixelShader,validatePixelKernel,samePixelColor} from '../gpu-effects/pixel-shader.ts';
import type {GpuPixelImageInfo,GpuPixelKernelSourceV1} from '../gpu-effects/pixel-types.ts';
import {fixedDisplayShader} from '../gpu-effects/pixel-display-shader.ts';
import {reachWords,cuspWords} from '../gpu-effects/pixel-display-tables.ts';
import {evaluate} from '../../src/core/animation.ts';
import {layersForMedia} from '../../src/core/output-plan.ts';
import {compositionContext,isActive} from '../../src/core/time.ts';
import {CONFIG} from '../../src/shared-state/protocol.ts';
import type {NativeProgram} from './client.ts';

export interface NativePixelDescription {
 version:1;kernel:GpuPixelKernelSourceV1;inputOrder:readonly string[];
 parameterTypes:readonly ('f32'|'u32')[];
 output:Pick<GpuPixelImageInfo,'format'|'alpha'|'color'>;
}
export interface NativePlan {
 program:NativeProgram;stages:Map<string,{pass:number;output:number;description:NativePixelDescription}>;
 output:{stage:string;port:string};
}
function fail(message:string):never{throw new EngineError('E_NATIVE_ELIGIBILITY',message);}
export function nativePresentationTarget(tvg:TVG,frame:number){
 const layers=layersForMedia({...tvg,layers:evaluate(tvg.layers,compositionContext(tvg,frame))},'surface').filter(l=>frame>=l.start&&frame<l.end);
 if(layers.length!==1)fail('Native checkpoint requires one active identity Layer; compose multiple images with explicit PixelPass kernels');
 const l=layers[0],source=l.source,stage=tvg.stages.find(s=>s.id===source?.$ref);
 if(!source||!stage||stage.outputs[source.port]!=='surface'||!isActive(stage,frame)||
  l.parent||l.mask||l.isolation==='isolated'||l.effects?.length||l.blend&&l.blend!=='source-over'||
  (stage.width??tvg.composition.width)!==tvg.composition.width||(stage.height??tvg.composition.height)!==tvg.composition.height)fail('Native checkpoint cannot silently drop Layer transforms, masks, groups or inactive output');
 for(const key of ['x','y','rotation','originX','originY'] as const)if((l[key]??0)!==0)fail('Native Layer transform needs an explicit kernel in this checkpoint');
 for(const key of ['scale','scaleX','scaleY','opacity'] as const)if((l[key]??1)!==1)fail('Native Layer opacity/scale needs an explicit kernel in this checkpoint');
 return source;
}
/** Qualification is explicit. Ordinary web factories never execute in Node or
 * become native merely because they contain WGSL. No third-party code eval. */
export function compileNativePlan(tvg:TVG,options:{width:number;height:number;slots?:number;maxBytes?:number;window?:boolean}):NativePlan {
 // TVG.effects is a catalog (including all builtins), not evidence of execution.
 // Actual Layer effect uses are rejected by nativePresentationTarget.
 if(tvg.resources.length)fail('Native checkpoint needs an explicit adapter for declared Resources');
 if(tvg.stages.length===0||tvg.stages.some(s=>s.engine!=='native-gpu'||s.seek!=='stateless'||s.entry||s.nodes||s.audio||Object.hasOwn(s.props,CONFIG)))
  fail('This native checkpoint requires explicit stateless native-gpu pixel-v1 Stages; Web/DOM/React/WebGL/audio/shared-state stay on their existing backends');
 if(options.slots!==undefined&&(!Number.isInteger(options.slots)||options.slots<1||options.slots>3))fail('Native frame slots must be 1..3 (default 2)');
 if(options.maxBytes!==undefined&&(!Number.isSafeInteger(options.maxBytes)||options.maxBytes<1))fail('Native memory budget must be a positive safe integer of bytes');
 const target=nativePresentationTarget(tvg,0);
 if(options.window&&!['transparent','#000000','#000','black'].includes(tvg.composition.background))fail('Native display checkpoint composites over black only');
 const program:NativeProgram={version:1,session:randomBytes(32).toString('hex'),slots:options.slots??2,maxBytes:options.maxBytes??1024**3,images:[],kernels:[],passes:[],display:null};
 const stages:NativePlan['stages']=new Map();
 for(const stage of topologicalLevels(tvg.stages).flat()){
  const description=stage.props.nativePixel as NativePixelDescription;
  if(!description||Object.keys(description).some(k=>!['version','kernel','inputOrder','parameterTypes','output'].includes(k))||description.version!==1||description.kernel?.abiVersion!==1||
   Object.keys(stage.outputs).length!==1||stage.outputs.surface!=='surface'||Object.keys(stage.props).some(k=>!['nativePixel','parameters'].includes(k)))
   fail('Stage '+stage.id+' needs only nativePixel/parameters props and a surface output');
  const kernel=validatePixelKernel(description.kernel,true);
  if(!Array.isArray(description.inputOrder)||description.inputOrder.length!==kernel.inputCount||new Set(description.inputOrder).size!==kernel.inputCount||
   Object.keys(stage.inputs).length!==kernel.inputCount||!Array.isArray(description.parameterTypes)||description.parameterTypes.length!==kernel.parameterWords||
   description.parameterTypes.some(t=>t!=='f32'&&t!=='u32'))fail('Stage '+stage.id+' has an invalid explicit binding/parameter layout');
  const info=pixelInfo({...description.output,width:Math.round((stage.width??tvg.composition.width)*options.width/tvg.composition.width),height:Math.round((stage.height??tvg.composition.height)*options.height/tvg.composition.height)});
  const inputs=description.inputOrder.map(name=>{
   const ref=stage.inputs[name];if(!isPortRef(ref)||ref.port!=='surface')fail('Only declared surface references are native-resident in this checkpoint');
   const producer=stages.get(ref.$ref);if(!producer)fail('Missing native producer '+ref.$ref);return producer.output;
  });
  const alpha=(info:Pick<GpuPixelImageInfo,'alpha'>)=>info.alpha==='premultiplied'?0:info.alpha==='straight'?1:2;
  const header=new Array<number>(32).fill(0);header.splice(0,4,info.width,info.height,Number(info.format==='rgba16float'),alpha(info));
  inputs.forEach((i,n)=>{
   const source=program.images[i];
   if(!samePixelColor(source.color as GpuPixelImageInfo['color'],info.color))fail('Native inputs must share explicit scene-linear color; convert with an explicit kernel');
   header.splice((n+1)*4,4,source.width,source.height,alpha(source as GpuPixelImageInfo),0);
  });
  const {version:_version,...metadata}=info;
  const output=program.images.push(metadata)-1,k=program.kernels.push({code:nativePixelShader(kernel),inputCount:kernel.inputCount,parameterWords:kernel.parameterWords,headerWords:32})-1;
  const pass=program.passes.push({kernel:k,inputs,output,header})-1;
  stages.set(stage.id,{pass,output,description:structuredClone(description)});
 }
 const last=stages.get(target.$ref);if(!last||target.port!=='surface')fail('Native presentation must reference a native surface');
 if(options.window){
  const info=program.images[last.output],expected={primaries:'acescg',whitePoint:'D60',transfer:'linear',reference:'scene',range:'full',referenceWhiteNits:100};
  if(Object.keys(info.color as object).length!==Object.keys(expected).length||Object.entries(expected).some(([k,v])=>(info.color as any)[k]!==v))fail('Native display requires explicit ACEScg and fixed ACES2 SDR100; professional intermediates remain floating point');
  const cusp=new Uint32Array(363*4);for(let i=0;i<363;i++)cusp.set(cuspWords.subarray(i*3,i*3+3),i*4);
  program.display={image:last.output,shader:fixedDisplayShader,reach:Array.from(reachWords),cusp:Array.from(cusp),profile:'aces2-sdr100-v1'};
 }
 const required=program.images.reduce((n,i)=>n+i.width*i.height*16,0)*program.slots+(options.window?program.images[last.output].width*program.images[last.output].height*16*program.slots:0);
 if(required>program.maxBytes)fail('F32 working buffers exceed native memory budget (F16 logical publication also uses 16 bytes/pixel)');
 return {program,stages,output:{stage:target.$ref,port:target.port}};
}
export {nativeParameters} from './pixel-parameters.ts';
