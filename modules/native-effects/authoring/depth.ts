import {EngineError} from '../../../src/core/errors.ts';
import {depthField,createNativeRestorationEffects} from '../restoration/index.ts';
import type {NativeDepthField,LensOptions,SplitDiopterOptions,BilateralOptions} from '../restoration/types.ts';
import type {ImageAsset,ImageEffect,ImageFrame} from './types.ts';
import {withImageAssets,active} from './runtime.ts';

export interface DepthMapOptions {width?:number;height?:number;rangeM?:readonly[number,number]}
export type DepthInput=NativeDepthField|ImageAsset<NativeDepthField>;
function fail(path:string,message:string):never {throw new EngineError('E_IMAGE_DEPTH_PARAMETER',`depthMap.${path}: ${message}`,{details:{path},hint:'Use camera-space Float32 z in metres; zero means missing, not the near plane.'});}
/** Validated, detached input data, prepared once as an existing typed GPU field.
 * No color/Alpha normalization, image decoding, NDC inference or pixel effect.
 * JSON arrays and Float32Array both work; dimensions default to the Stage. */
export function depthMap(values:readonly number[]|Float32Array,options:DepthMapOptions={}):ImageAsset<NativeDepthField> {
  if(!Array.isArray(values)&&!(values instanceof Float32Array))fail('values','expected a dense number array or Float32Array');
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['width','height','rangeM'].includes(k)))fail('options','unknown depth map option');
  const data=Float32Array.from(values);let minimum=Infinity,maximum=0;
  for(let i=0;i<values.length;i++){const value=values[i],stored=data[i];if(typeof value!=='number'||!Number.isFinite(value)||!Number.isFinite(stored)||stored<0||value!==0&&stored<2**-126)fail(`values[${i}]`,'finite positive normal Float32 metres or exactly zero for missing');if(stored>0){minimum=Math.min(minimum,stored);maximum=Math.max(maximum,stored);}}
  if(options.rangeM!==undefined&&(!Array.isArray(options.rangeM)||options.rangeM.length!==2||Array.from(options.rangeM).some(v=>typeof v!=='number'||!Number.isFinite(v))))fail('rangeM','expected two finite numeric camera distances');
  const range=options.rangeM?options.rangeM.map(Math.fround):[minimum,maximum];
  if(range.length!==2||range.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<2**-126||!Number.isFinite(Math.fround(v)))||range[1]<range[0])fail('rangeM','positive finite [minimum, maximum]; supply an explicit range if every observation is missing');
  if(maximum>0&&(minimum<range[0]||maximum>range[1]))fail('rangeM','must enclose all stored non-missing Float32 samples');
  const dimensions={width:options.width,height:options.height};
  return Object.freeze({async prepare(init,control){active(control.signal);const width=dimensions.width??init.width,height=dimensions.height??init.height;if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height)||width*height!==data.length||data.length>0xffffffff)fail('dimensions','positive dimensions matching the exact sample count and existing U32 addressing');
    const buffer=await init.gpu.createField({type:'f32',dimensions:[width,height,1],components:1,semantic:'depth',space:'camera',units:'metres',channels:['z'],metadata:{rangeM:range}},data);let closing:Promise<void>|undefined;
    try{return {value:depthField(buffer),dispose(){return closing??=init.gpu.releaseBuffer(buffer);}};}catch(error){await init.gpu.releaseBuffer(buffer);throw error;}
  }} satisfies ImageAsset<NativeDepthField>);
}
const asset=(value:DepthInput):value is ImageAsset<NativeDepthField>=>{if(!value||typeof value!=='object')fail('depth','expected a depthMap declaration or borrowed typed depth field');return 'prepare'in value;};
async function resolve(value:DepthInput,frame:ImageFrame){return asset(value)?frame.asset(value):value;}
function prepare(effect:ImageEffect,depth:DepthInput){return asset(depth)?withImageAssets(effect,depth):effect;}
/** Lens focal/sensor widths are mm, focus/depth are metres, rotation is degrees. */
export function depthOfField(depth:DepthInput,options:LensOptions={}):ImageEffect {const operation:ImageEffect=async(image,frame)=>{const value=await resolve(depth,frame);return frame.process(createNativeRestorationEffects,image,(source,f)=>f.depthOfField(source,value,options));};Object.defineProperty(operation,'name',{value:'depthOfField'});return prepare(operation,depth);}
export function splitDiopter(depth:DepthInput,options:SplitDiopterOptions={}):ImageEffect {const operation:ImageEffect=async(image,frame)=>{const value=await resolve(depth,frame);return frame.process(createNativeRestorationEffects,image,(source,f)=>f.splitDiopter(source,value,options));};Object.defineProperty(operation,'name',{value:'splitDiopter'});return prepare(operation,depth);}
export function depthBilateral(depth:DepthInput,options:BilateralOptions={}):ImageEffect {const operation:ImageEffect=async(image,frame)=>{const value=await resolve(depth,frame);return frame.process(createNativeRestorationEffects,image,(source,f)=>f.depthBilateral(source,value,options));};Object.defineProperty(operation,'name',{value:'depthBilateral'});return prepare(operation,depth);}
