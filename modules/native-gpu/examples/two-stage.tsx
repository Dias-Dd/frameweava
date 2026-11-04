import {Composition,Stage,Layer,ref,expr,acescg} from '../../../src/index.ts';
import {residentSourceKernel} from '../../gpu-effects/examples/resident-preview-kernels.ts';
import type {NativePixelDescription} from '../program.ts';

// Explicit native eligibility; no Web factory or DOM code executes in Node.
if(residentSourceKernel.abiVersion!==1)throw new Error('Native example requires pixel ABI 1');
const source:NativePixelDescription={
 version:1,kernel:residentSourceKernel,inputOrder:[],parameterTypes:['u32'],
 output:{format:'rgba32float',alpha:'premultiplied',color:acescg},
};
const filter:NativePixelDescription={
 version:1,kernel:{abiVersion:1,id:'frameweave/native-linear-scale',version:'1.0.0',inputCount:1,parameterWords:1,
  code:'fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));return vec4f(v.rgb*paramF32(0u),v.a);}'},
 inputOrder:['image'],parameterTypes:['f32'],
 output:{format:'rgba16float',alpha:'premultiplied',color:acescg},
};
export default <Composition width={1920} height={1080} fps={120} durationInFrames={240} background="transparent">
 <Stage id="source" engine="native-gpu" outputs={{surface:'surface'}} props={{nativePixel:source,parameters:[expr.frame]}}/>
 <Stage id="filter" engine="native-gpu" inputs={{image:ref('source')}} inputTypes={{image:'surface'}} outputs={{surface:'surface'}} props={{nativePixel:filter,parameters:[.5]}}/>
 <Layer source={ref('filter')}/>
</Composition>;
