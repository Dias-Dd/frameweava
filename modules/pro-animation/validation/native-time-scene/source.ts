// Editable shot-specific procedural source, not a new library effect.
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import type {NativeTimeSource} from '../../src/native-time/types.ts';
export const sourceKernel={abiVersion:1 as const,id:'validation/native-time/moving-source',version:'1.0.0',inputCount:1,parameterWords:1,code:`
fn pixel(p:vec2u)->vec4f{
 let size=vec2f(outputSize());let t=paramF32(0u);let uv=(vec2f(p)+.5)/size;
 let center=vec2f(.16+.68*t,.5+.19*sin(t*6.283185307));let d=(uv-center)*size;
 let r=size.y*.105;let coverage=clamp(r+.5-length(d),0.,1.);
 let q=vec2i(clamp(uv*vec2f(size0()),vec2f(0.),vec2f(size0())-1.));
 let ink=read0(q);let stripe=select(.45,1.,fract((uv.x+uv.y)*12.)>.5);
 // Signed HDR ink remains native F32; the imported source is never display-encoded here.
 return vec4f((ink.rgb+vec3f(-3.,3.,1.5))*coverage*stripe,.75*coverage);
}`};
export async function movingSource(g:NativeGpuScope,ink:GpuPixelImage,width:number,height:number):Promise<NativeTimeSource>{
 const kernel=await g.compile(sourceKernel);return s=>g.run(kernel,[ink],{parameters:Float32Array.of(s.time),output:{width,height,color:ink.info.color,alpha:'premultiplied',format:'rgba32float'}});
}
