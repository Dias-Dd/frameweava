import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '../authoring.ts';
import {acescg,linear709,linear2020} from '../../../src/media/surface.ts';

// Both stages exchange the existing resident Surface handle. The texture starts
// in ACEScg, crosses Rec.2020, then explicitly enters the mesh working color.
export const pattern=defineNativeStage(async init=>{
 const g=init.gpu,k=await g.compile({abiVersion:1,id:'example/color-texture/pattern',version:'1.0.0',inputCount:0,parameterWords:1,code:`
 fn pixel(p:vec2u)->vec4f{let uv=(vec2f(p)+.5)/vec2f(outputSize());let stripe=select(.25,2.,(p.x/24u+p.y/24u)%2u==0u);return vec4f(stripe+uv.x,-.15+uv.y*.3,1.-uv.y,.3+.7*uv.x);}`});
 return {async renderAt(c){const a=await g.run(k,[],{parameters:Float32Array.of(c.frame),output:{width:init.width,height:init.height,format:'rgba32float',alpha:'straight',color:acescg}});const b=await g.convertColor(a,{version:1,color:{...linear2020,referenceWhiteNits:203}});await g.release(a);return b;}};
});
export const textured=defineNativeStage(async init=>{
 const g=init.gpu,positions=await g.createField({type:'f32',dimensions:[4,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},Float32Array.of(-.85,.8,.4,.85,.8,.4,-.85,-.8,.4,.85,-.8,.4)),uvs=await g.createField({type:'f32',dimensions:[4,1,1],components:2,semantic:'generic',channels:['u','v']},Float32Array.of(0,0,1,0,0,1,1,1)),indices=await g.createBuffer({type:'u32',length:6},Uint32Array.of(0,2,1,1,2,3)),deform=await g.compileCompute({abiVersion:1,id:'example/color-texture/deform',version:'1.0.0',bindings:[{type:'f32',access:'read_write'}],parameterWords:1,workgroupSize:[4,1,1],code:'fn compute(p:vec3u,l:vec3u,w:vec3u){let at=p.x*3u;store0(at,load0(at)+sin(paramF32(0u)*.3+f32(p.x))*.08);}'});
 return {async renderAt(c,inputs){const image=await g.convertColor(inputs.surface,{version:1,color:linear709}),mesh=await g.cloneBuffer(positions);await g.dispatch(deform,[mesh],{workItems:[4,1,1],parameters:Float32Array.of(c.frame)});const out=await g.drawMesh({positions:mesh,indices,texture:{version:1,image,uvs,filter:'linear',addressU:'clamp',addressV:'clamp'},output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied',color:linear709}});await g.releaseBuffer(mesh);await g.release(image);const reference=await g.imageToBuffer!(out,{version:1});await g.publishBuffer('reference',reference,{version:1});await g.releaseBuffer(reference);return out;}};
});
export default <Composition width={640} height={360} fps={24} durationInFrames={24} background="transparent"><Stage id="pattern" factory={pattern}/><Stage id="textured" factory={textured} inputs={{surface:ref('pattern')}} inputTypes={{surface:'surface'}}/><Layer source={ref('textured')}/></Composition>;
