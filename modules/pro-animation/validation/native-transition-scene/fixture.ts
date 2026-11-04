// Editable native source fixture. No files, decoded images, canvas, or pixel upload.
import type {GpuPixelKernelSourceV1} from '../../../gpu-effects/pixel-types.ts';
export const sourceKernel:GpuPixelKernelSourceV1={abiVersion:1,id:'example/pa-native-transitions/source',version:'1.0.0',inputCount:0,parameterWords:2,code:`
fn pixel(p:vec2u)->vec4f{
 let kind=paramU32(0u);let phase=paramF32(1u);let uv=(vec2f(p)+.5)/vec2f(outputSize());
 if(kind==2u){return vec4f(uv.x,uv.y,1.-uv.x,uv.y);}
 let a=select(.5,1.,((p.x/8u+p.y/8u)&1u)==0u);
 if(kind==0u){let d=length((uv-vec2f(.3+phase*.1,.5))*vec2f(1.7,1.));let ring=select(.08,1.5,abs(d-.23)<.035);return vec4f((1.+uv.x)*a,(-.12+ring*.2)*a,(.1+ring*.8)*a,a);}
 return vec4f((-.18+uv.y*.2)*a,(.5+uv.x)*a,(2.+uv.y+phase*.1)*a,a);
}`};
export const atlasKernel:GpuPixelKernelSourceV1={abiVersion:1,id:'example/pa-native-transitions/stamp',version:'1.0.0',inputCount:2,parameterWords:2,code:`
fn pixel(p:vec2u)->vec4f{let origin=vec2u(paramU32(0u),paramU32(1u));if(all(p>=origin)&&all(p-origin<size1())){return read1(vec2i(p-origin));}return read0(vec2i(p));}`};
export const transparentKernel:GpuPixelKernelSourceV1={abiVersion:1,id:'example/pa-native-transitions/transparent',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.);}'};
