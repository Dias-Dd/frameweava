import type {FrameContext} from '../../../src/core/types.ts';
import type {NativeGpuScope} from '../../native-gpu/authoring.ts';
import {linear709} from '../../../src/media/surface.ts';
export const sceneWarp=(c:FrameContext)=>({amount:12,frequency:2.71,seed:2147483647,time:c.time});
export const sceneShadow={radius:3,offset:[4.25,3.5] as const,color:[-.15,.1,.6] as const,opacity:.65};
export const sceneGlow={radius:2,intensity:.7,threshold:.05};
export function sceneSource(g:NativeGpuScope,width:number,height:number,c:FrameContext){return g.compile({abiVersion:1,id:'example/native-pa-shape',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{let uv=(vec2f(p)+.5)/vec2f(outputSize());let q=(uv-vec2f(.46+paramF32(0u)*.12,.5))/vec2f(.28,.32);let a=1.-smoothstep(.9,1.,length(q));return vec4f(vec3f(2.5,-.1,.5)*a,a);}'}).then(k=>g.run(k,[],{parameters:Float32Array.of(c.progress),output:{width,height,format:'rgba32float',alpha:'premultiplied',color:linear709}}));}
