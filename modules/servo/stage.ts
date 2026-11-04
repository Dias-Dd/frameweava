import {defineNativeStage,type NativeStageFactory} from '../native-gpu/authoring.ts';
import type {GpuPixelImage,GpuPixelKernel} from '../gpu-effects/pixel-types.ts';
import {EngineError} from '../../src/core/errors.ts';
import {createServo} from './index.ts';
import type {ServoDocument} from './document.ts';

export interface ServoStageOptions<P extends Record<string,unknown>=Record<string,unknown>> {
 /** HTML/JS/assets are immutable initialization data. This profile is SDR. */
 document?:ServoDocument;html?:string;css?:string;javascript?:string;
 /** Optional image input port. Input must already satisfy the Servo SDR boundary. */
 input?:string;defaults?:P;
 /** CSS property name -> evaluated Stage prop name. Scalars only. */
 variables?:Readonly<Record<string,string>>;
 timeoutMs?:number;
}
/** Convenience factory within the existing Native Stage; no Web Stage or new clock. */
export function servoStage<P extends Record<string,unknown>=Record<string,unknown>>(options:ServoStageOptions<P>):NativeStageFactory<Record<string,GpuPixelImage>,Partial<P>> {
 const bad=(message:string):never=>{throw new EngineError('E_SERVO_OPTIONS',message);};
 if(!options||typeof options!=='object'||Object.keys(options).some(k=>!['document','html','css','javascript','input','defaults','variables','timeoutMs'].includes(k)))bad('Expected Servo Stage options');
 if(options.document&&(options.html!==undefined||options.css!==undefined||options.javascript!==undefined))bad('Choose a prepared document or inline HTML/CSS/JavaScript');
 const d=options.document;
 if(d&&(d.version!==1||d.profile!=='sdr-srgb8'||typeof d.html!=='string'||typeof d.javascript!=='string'||!Array.isArray(d.resources)))bad('Expected prepared Servo document v1 (SDR sRGB8)');
 for(const key of ['html','css','javascript','input'] as const)if(options[key]!==undefined&&typeof options[key]!=='string')bad(`${key} must be a string`);
 if(options.input!==undefined&&!options.input)bad('Image input port cannot be empty');
 const variables={...options.variables};
 for(const [css,prop]of Object.entries(variables))if(!/^--[A-Za-z_][A-Za-z0-9_-]*$/.test(css)||css.startsWith('--fw-')||typeof prop!=='string'||!prop)bad('CSS variable names must be custom properties outside --fw-, mapped to Stage prop names');
 // The wrapper is installed once, after the author's initialization script.
 const javascript=(d?.javascript??options.javascript??'')+`\n;(()=>{const render=window.frameweaveRender;const variables=${JSON.stringify(variables)};window.frameweaveRender=(c,p)=>{const s=document.documentElement.style;s.setProperty('--fw-time',String(c.time));s.setProperty('--fw-frame',String(c.frame));s.setProperty('--fw-progress',String(c.progress));for(const [name,key]of Object.entries(variables)){const v=p[key];if(v===undefined){s.removeProperty(name);continue;}if(typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean')throw Object.assign(Error('CSS variables require scalar Stage props'),{code:'E_SERVO_CSS_PARAMETER'});s.setProperty(name,String(v));}return render?.(c,p);};})();`;
 const html=d?.html??`<style>${options.css??''}</style>${options.html??''}`,input=options.input,defaults=options.defaults??{};
 return defineNativeStage<Record<string,GpuPixelImage>,Partial<P>>(async init=>{
  const ui=await createServo(init.gpu,{profile:'sdr-srgb8',execution:'trusted-local',width:init.width,height:init.height,seed:init.seed,input:input!==undefined,html,javascript,...options.timeoutMs===undefined?{}:{timeoutMs:options.timeoutMs}});
  let resize:GpuPixelKernel|undefined;
  return {
   async renderAt(context,inputs,props){
    const source=input===undefined?undefined:inputs[input],preview=context.preview;
    if(input!==undefined&&!source)throw new EngineError('E_SERVO_INPUT',"Missing Servo image input '"+input+"'");
    const render={context,parameters:{...defaults,...props}};
    if(!source||!preview||source.info.width!==preview.renderWidth||source.info.height!==preview.renderHeight||
       source.info.width===init.width&&source.info.height===init.height)return ui.render(source,render);
    // Keep Servo's viewport and CSS pixels logical. Upsample only its image
    // input, on the same owner, while other preview passes use proxy sizes.
    resize??=await init.gpu.compile({abiVersion:1,id:'frameweave/servo-preview-input',version:'1.0.0',inputCount:1,parameterWords:0,code:`
fn pm(i:vec2i)->vec4f {
 let v=read0(clamp(i,vec2i(0),vec2i(size0())-1));
 return vec4f(select(v.rgb,v.rgb*v.a,alpha0()==1u),select(v.a,1.,alpha0()==2u));
}
fn pixel(p:vec2u)->vec4f {
 let q=(vec2f(p)+.5)*vec2f(size0())/vec2f(outputSize())-.5;
 let a=vec2i(floor(q));let f=fract(q);
 return mix(mix(pm(a),pm(a+vec2i(1,0)),f.x),mix(pm(a+vec2i(0,1)),pm(a+1),f.x),f.y);
}`});
    const logical=await init.gpu.run(resize,[source],{output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied'}});
    try{return await ui.render(logical,render);}finally{await init.gpu.release(logical);}
   },
   dispose(){return ui.dispose();},
  };
 });
}
