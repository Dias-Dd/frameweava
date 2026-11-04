import type {GpuPixelKernelSourceV2} from '../../gpu-effects/pixel-types.ts';
import {math} from '../keying/kernels.ts';
import {guarded} from '../geometry/arithmetic.ts';
export const publish:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/psf-restoration/publish',version:'1.0.0',inputCount:1,dataInputs:[{type:'f32'}],parameterWords:128,code:guarded(math+`
fn pixel(p:vec2u)->vec4f{let original=associate(read0(vec2i(p)),alpha0());let i=(p.y*outputSize().x+p.x)*4u;let raw=pair(vec4f(data0(i),data0(i+1u),data0(i+2u),data0(i+3u)));var a=clampP(ch(raw,3u));if(paramU32(7u)!=0u){a=ch(original,3u);}var result=rgb(ch(raw,0u),ch(raw,1u),ch(raw,2u),a);if(paramU32(7u)!=0u&&a.hi.x==0.){result=original;}return published(mixP(original,result,argP(0u)));}
`)};
