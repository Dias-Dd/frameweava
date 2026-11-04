/** Explicit raw reference only. Creator projects need no renderer/buffers. */
import {Composition,Stage,Layer,ref,surfaceFromPixels,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {imageCharacter,imageCharacterIdle,imageCharacterWave,imageCharacterWalk,imageCharacterRun,imageCharacterJump,imageCharacterDance,imageCharacterPoint,imageCharacterReach,imageCharacterScene} from 'spatial-creation-candidate';
import {createCharacterRig,createNativeCharacterRenderer} from '../../../puppet-effects/native.ts';
import {imageCharacterLayout} from '../../image-character-layout.ts';
import {imageFigureControls} from '../../image-character-controls.ts';
import {figureRig} from '../../character-poses.ts';
import {prepareKernel} from '../../../native-effects/raster/kernels.ts';
import {joints} from '../../examples/image-character-joints.ts';
import {Matrix4,WebGPUCoordinateSystem} from 'three';
import {camera as referenceCamera} from '../../../skeletal-effects/src/renderer.ts';
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,objects:any[]=[],manual:any[]=[],formats=['rgba32float','rgba16float'] as const,layout=imageCharacterLayout(8,12,{joints}),camera={projection:'orthographic' as const,position:[0,.2,6] as [number,number,number],target:[0,.2,0] as [number,number,number],near:.01,far:30,viewHeight:2.5/(1-.24)},prepare=await g.compile(prepareKernel);
 const view=referenceCamera(camera,init.width,init.height);view.coordinateSystem=WebGPUCoordinateSystem;(view as any).updateProjectionMatrix();const clip=new Matrix4().multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse).elements,indices=await g.createBuffer({type:'u32',length:layout.asset.mesh.indices.length},Uint32Array.from(layout.asset.mesh.indices)),uvs=await g.createField({type:'f32',dimensions:[layout.asset.mesh.vertexIds.length,1,1],components:2,semantic:'generic',space:'uv-top-left',units:'dimensionless'},Float32Array.from(layout.asset.mesh.uv!.flat()));
 const makers=[imageCharacter,imageCharacterIdle,imageCharacterWave,imageCharacterWalk,imageCharacterRun,imageCharacterJump,imageCharacterDance,imageCharacterPoint,imageCharacterReach];
 for(const format of formats){const base={joints,imageSize:[8,12] as const,format};for(const make of makers)objects.push(await make(base));objects.push(await imageCharacterScene({actor:{joints,imageSize:[8,12]},format}));
  for(const action of ['bind','wave','point','reach'] as const)manual.push({action,rig:createCharacterRig(layout.asset,figureRig(layout.asset,{},action)),draw:await createNativeCharacterRenderer(g,layout.asset,{width:init.width,height:init.height,camera,color:[1,1,1,1],format})});
 }
 objects.push(await imageCharacter({joints,imageSize:[8,12]}),await imageCharacter({joints,imageSize:[8,12]}));
 const publish=async(name:string,image:any)=>{const view=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(name,view,{version:1});}finally{await g.releaseBuffer(view);}};
 let refused=0;
 return {async renderAt(c){const mode=c.frame%22,kind=mode<20?mode%10:0,format=mode>=10&&mode<20?'rgba16float':'rgba32float',alpha=mode===20?'straight':'premultiplied',color=mode===21?{...linear709,primaries:'rec2020' as const}:linear709,pixels:number[]=[],owned:any[]=[];for(let y=0;y<12;y++)for(let x=0;x<8;x++){const a=x===0||x===7||y===0||y===11?0:.45+.4*y/11;pixels.push(...[3,-.4,1.5].map(v=>alpha==='straight'?v:v*a),a);}
  const source=await g.upload(surfaceFromPixels(8,12,pixels,{format,alpha,color}));owned.push(source);try{
   if(c.frame===0){try{await objects[0].renderAt(c,{},{});throw Error('missing accepted');}catch(e){if((e as any).code!=='E_CREATION_INPUT')throw e;refused++;}const wrong=await g.upload(surfaceFromPixels(4,4,new Float32Array(64),{format:'rgba32float',alpha:'premultiplied',color:linear709}));try{try{await objects[0].renderAt(c,{image:wrong},{});throw Error('resize accepted');}catch(e){if((e as any).code!=='E_CREATION_INPUT_SIZE')throw e;refused++;}}finally{await g.release(wrong);}const empty=await g.upload(surfaceFromPixels(8,12,new Float32Array(8*12*4),{format:'rgba32float',alpha:'premultiplied',color:linear709}));try{const zero=await objects[0].renderAt(c,{image:empty},{});try{await publish('zero',zero);}finally{await g.release(zero);}}finally{await g.release(empty);}}
   const result=await objects[mode].renderAt(c,{image:source},{});owned.push(result);await publish('rgba',result);await publish('source',source);
   if([0,2,7,8].includes(kind)){const m=manual[(mode>=10&&mode<20?4:0)+[0,2,7,8].indexOf(kind)];let input=source;if(mode===21){input=await g.convertColor(source,{version:1,color:linear709});owned.push(input);}if(mode===20){input=await g.run(prepare,[source],{parameters:Uint32Array.of(1,0),output:{alpha:'premultiplied'}});owned.push(input);}const positions=await m.draw.deform(m.rig.sample(c,imageFigureControls(layout,{},m.action,c)));try{const image=await g.drawMesh({positions,indices,matrix:clip,color:[1,1,1,1],texture:{version:1,image:input,uvs,filter:'linear',addressU:'transparent',addressV:'transparent'},raster:{version:1,mode:'depth-peel'},output:{width:init.width,height:init.height,format,alpha:'premultiplied',color:linear709}});try{await publish('manual',image);}finally{await g.release(image);}}finally{await g.releaseBuffer(positions);}}
   const info=await objects[mode].inspect(),state=await g.createBuffer({type:'f32',length:5},Float32Array.of(mode,c.time,refused,info.solver?.targets?.[0]?.distance??0,g.stats().activeImages));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}owned.splice(owned.indexOf(result),1);return result;
  }finally{for(const i of owned)await g.release(i);}
 },async dispose(){for(const o of objects)await o.dispose?.();for(const m of manual){await m.draw.dispose();m.rig.dispose();}await g.releaseBuffer(indices);await g.releaseBuffer(uvs);}};
});
export default Composition({id:'image-character-verify',width:64,height:48,fps:24,durationInFrames:66,seed:37,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
