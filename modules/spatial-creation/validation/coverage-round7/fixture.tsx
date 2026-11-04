import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {characterDocument,createCharacterAnimator,createCharacterRenderer,characterClip} from 'spatial-creation-candidate';import imported from '../../examples/character-asset/model.character.json';import {alphaCase} from './oracle-asset.ts';import {linear709} from '../../../../src/media/surface.ts';
export const verify=defineNativeStage(async init=>{
 // Logical lease accounting around the real admitted scope, not its cumulative recorder-slot stats.
 const leases=new Set<object>(),gpu={...init.gpu,async createBuffer(...args:Parameters<typeof init.gpu.createBuffer>){const b=await init.gpu.createBuffer(...args);leases.add(b);return b;},async releaseBuffer(b:Parameters<typeof init.gpu.releaseBuffer>[0]){await init.gpu.releaseBuffer(b);leases.delete(b);}};
 const wide=characterDocument(imported);wide.primitives[0].skin!.influences[0]=[0,1,2,3,4].map(joint=>({joint,weight:.2}));
 const animator=await createCharacterAnimator(wide),renderer=await createCharacterRenderer(gpu,wide,{width:init.width,height:init.height}),cases:{kind:number;pose:Awaited<ReturnType<typeof createCharacterAnimator>>;renderer:Awaited<ReturnType<typeof createCharacterRenderer>>}[]=[];
 for(let kind=0;kind<4;kind++){const asset=alphaCase(kind),pose=await createCharacterAnimator(asset);for(const format of ['rgba32float','rgba16float'] as const)cases.push({kind,pose,renderer:await createCharacterRenderer(gpu,asset,{width:16,height:16,format,shading:'unlit',camera:{projection:'orthographic',position:[0,0,5],target:[0,0,0],viewHeight:2,near:.01,far:30},textures:{sample:{image:'sample'}}})});}
 const texture=await init.gpu.compile({abiVersion:1,id:'frameweave/test/character-hdr-texture',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{let a=select(.25,.75,p.x==1u);let rgb=vec3f(-.5,4.,1.);return vec4f(select(rgb*a,rgb,paramU32(0u)==1u),a);}'});
 async function reject(f:()=>unknown,expected:string){try{await f();throw Error('Expected '+expected);}catch(e:any){if(e.code!==expected)throw e;}}
 return {async renderAt(c){
 const pose=animator.sample(c,{clips:[characterClip('greeting')]});await reject(()=>renderer.deform({...pose,assetHash:'wrong'}),'E_CHARACTER_POSE');
 const pending=renderer.deform(pose);await reject(()=>renderer.deform(pose),'E_CHARACTER_BUSY');await reject(()=>renderer.dispose(),'E_CHARACTER_BUSY');const data=await pending;
 try{await init.gpu.publishBuffer('deform',data,{version:1});}finally{await gpu.releaseBuffer(data);}
 const before=leases.size;await reject(()=>cases[0].renderer.render(cases[0].pose.sample(c),{}),'E_CREATION_INPUT');const after=leases.size;if(before!==after)throw Error('Failed texture validation leaked owned resources');
 const straight=c.frame===0,sample=await init.gpu.run(texture,[],{parameters:Uint32Array.of(Number(straight)),output:{width:2,height:2,format:'rgba32float',alpha:straight?'straight':'premultiplied',color:linear709}});let last;
 try{for(const [i,item]of cases.entries()){const image=await item.renderer.render(item.pose.sample(c),{sample},{opacity:c.frame===12?.5:1}),raw=await init.gpu.imageToBuffer!(image,{version:1});try{await init.gpu.publishBuffer('alpha'+i,raw,{version:1});}finally{await gpu.releaseBuffer(raw);}if(last)await init.gpu.release(last);last=image;}return last!;}finally{await init.gpu.release(sample);}
 },async dispose(){animator.dispose();for(const item of cases)item.pose.dispose();await Promise.all([renderer.dispose(),...cases.map(item=>item.renderer.dispose())]);await renderer.dispose();if(leases.size)throw Error('Character disposal leaked logical GPU buffer leases');}};
});
export default Composition({id:'character-native-oracle',width:16,height:16,fps:24,durationInFrames:24,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
