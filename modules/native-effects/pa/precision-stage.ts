// Diagnostic only: scalar Pair/row controls in image lanes, never public data.
import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {linear709} from '../../../src/media/surface.ts';
import {evaluate} from '../../../src/core/animation.ts';
import {seedKernel} from './stage.ts';
import {displacementOptions} from './cases.ts';
import {split} from './filters.ts';
import {displacement} from './kernels.ts';
import {createNativePaImageEffects} from './filters.ts';
const marker=' if(paramU32(1u)!=0u)',start=displacement.code.lastIndexOf(marker);
if(start<0)throw Error('Sine displacement diagnostic boundary changed');
const code=displacement.code.slice(0,start).replace('fn pixel(p:vec2u)->vec4f{','fn pixel(out:vec2u)->vec4f{let p=vec2u(out.x%size0().x,out.y);')+`
 if(paramU32(1u)>1u){return read0(vec2i(p));}
 if(out.x<size0().x){return vec4f(x.hi.x,x.lo.x,y.hi.x,1.);}if(out.x<2u*size0().x){return vec4f(y.lo.x,wx.hi.x,wx.lo.x,1.);}return vec4f(wy.hi.x,wy.lo.x,0.,1.);}`;
export const precisionStage=defineNativeStage(init=>({async renderAt(c){const g=init.gpu,width=17,height=13,o=displacementOptions(c,1),amount=evaluate(o.amount,c),time=o.time,speed=o.speed,frequency=o.frequency,seed=o.seed,t=time*speed,control=new Float32Array(2*(width+height));for(let x=0;x<width;x++)control.set(split(Math.sin(x/width*frequency*6.283+t+seed*.13)),2*x);for(let y=0;y<height;y++)control.set(split(Math.sin(y/height*frequency*4.2-t*.7+seed*.31)),2*(width+y));
 const input=await g.run(await g.compile(seedKernel),[],{parameters:Uint32Array.of(0,1,0),output:{width,height,format:'rgba32float',alpha:'premultiplied',color:linear709}}),buffer=await g.createField({type:'f32',dimensions:[width+height,1,1],components:2,semantic:'generic'},undefined);await g.writeBuffer(buffer,control);const p=new Uint32Array(9);p[0]=1;new Float32Array(p.buffer).set([amount,...o.offset].flatMap(split),2);return g.run(await g.compile({...displacement,id:'fixture/native-pa-precision',code}),[input],{parameters:p,data:[buffer],output:{width:width*3,height,format:'rgba32float',alpha:'premultiplied',color:linear709}});
 }}));
export const meanStage=defineNativeStage(init=>{const pa=createNativePaImageEffects(init),g=init.gpu;return {async renderAt(){const input=await g.run(await g.compile({abiVersion:1,id:'fixture/native-pa-mean-seed',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{let h=(p.x*1664525u+p.y*1013904223u)^0x9e3779b9u;let v=.2+.6*f32(h&65535u)/65535.;return vec4f(v,v,v,1.);}'}),[],{output:{width:init.width,height:init.height,format:'rgba32float',alpha:'opaque',color:linear709}}),result=await pa.processImage(input,(image,f)=>f.blur(image,{radius:8,boundary:'clamp'}));return g.run(await g.compile({abiVersion:1,id:'fixture/native-pa-mean-capture',version:'1.0.0',inputCount:3,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{if(paramU32(0u)==1u){return read1(vec2i(p));}if(paramU32(0u)==2u){return read2(vec2i(p));}return read0(vec2i(p));}'}),[result,input,input],{parameters:Uint32Array.of(0),output:{alpha:'premultiplied'}});},dispose:()=>pa.dispose()};});
