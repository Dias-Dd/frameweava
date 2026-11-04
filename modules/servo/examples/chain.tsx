import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {createGpuPixelEffects} from '../../gpu-effects/pixel-effects.ts';
import {linear709} from '../../../src/media/surface.ts';
import {createServo} from '../index.ts';

export const scene=defineNativeStage(async init=>{
 const {gpu,width,height}=init;
 const source=await gpu.compile({abiVersion:1,id:'example/servo-source',version:'1.0.0',inputCount:0,parameterWords:1,
  code:'fn pixel(p:vec2u)->vec4f{let uv=(vec2f(p)+.5)/vec2f(outputSize());return vec4f(uv.x*2.,uv.y-.25,.25+paramF32(0u)*.25,1.);}'});
 const first=await createServo(gpu,{profile:'sdr-srgb8',execution:'trusted-local',width,height,input:true,
  html:`<img style="position:absolute;inset:0;width:100%;height:100%" src="{{frameweave.input}}"><style>.card{position:absolute;left:5%;top:12%;padding:12px 18px;background:#152238dd;border:2px solid white;border-radius:10px;color:white;font:18px sans-serif}#time{font:12px monospace;color:#7fffd4}</style><div class="card">Native → Servo → Blur<div id="time"></div></div>`,
  javascript:`window.frameweaveRender=c=>{document.getElementById('time').textContent='Frame '+c.frame+' · '+c.time.toFixed(3)+'s';}`});
 const second=await createServo(gpu,{profile:'sdr-srgb8',execution:'trusted-local',width,height,input:true,
  html:`<img style="position:absolute;inset:0;width:100%;height:100%" src="{{frameweave.input}}"><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" style="position:absolute;right:8px;bottom:8px"><circle cx="32" cy="32" r="26" fill="#101c2ddd" stroke="#7fffd4" stroke-width="3"/><path d="M18 32h28M32 18v28" stroke="white" stroke-width="2"/></svg>`});
 const effects=createGpuPixelEffects(gpu);
 return {async renderAt(context){
  const input=await gpu.run(source,[],{parameters:new Float32Array([context.time]),output:{width,height,color:linear709,format:'rgba32float',alpha:'opaque'}});
  const html=await first.render(input,{context});
  const blurred=await effects.blur(html,{radius:1,boundary:'clamp',format:'rgba32float'});
  return second.render(blurred,{context});
 },async dispose(){await first.dispose();await second.dispose();}};
});
export default <Composition width={320} height={180} fps={24} durationInFrames={24} background="transparent"><Stage id="servo" factory={scene}/><Layer source={ref('servo')}/></Composition>;
