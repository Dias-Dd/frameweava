import {Composition,Stage,Layer,ref,keyframes,linear709,surfaceFromPixels,seededRandom,evaluate} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {particleField,snowField,sparkField,bubbleField,fireflyField,dustField,confettiField,energyField,starField,petalField} from 'spatial-creation-candidate';
import {resolveParticleField} from '../../particle-field.ts';
import {fieldSprite} from '../../particle-sprites.ts';
import {createFeedbackParticles,createNativeParticleRenderer} from '../../../spatial-effects/native.ts';
const basic={initialCount:40,rate:10,color:[4,.5,.2] as const,radius:keyframes([{frame:0,value:.04},{frame:153,value:.065}]),trails:3};
const atlas={initialCount:25,rate:4,sprite:{image:'atlas',columns:2,rows:1,count:2,frameBlending:true},style:{spriteFrame:keyframes([{frame:0,value:0},{frame:153,value:1}])}};
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,creators=[snowField,sparkField,bubbleField,fireflyField,dustField,confettiField,energyField,starField,petalField],camera={projection:'orthographic' as const,position:[0,0,5] as [number,number,number],target:[0,0,0] as [number,number,number],viewHeight:3.5,near:.01,far:40};
 const objects=[] as any[],manual=[] as any[];
 for(const format of ['rgba32float','rgba16float'] as const){objects.push(await particleField({...basic,format}),...await Promise.all(creators.map(fn=>fn({format}))));for(const options of [basic,atlas]){const p=resolveParticleField('field',options,init.width/init.height,init.seed),sim=createFeedbackParticles({...p.simulation,fps:24,seed:init.seed},{emitter:p.emitter}),renderer=createNativeParticleRenderer(g,{width:init.width,height:init.height,camera,format});manual.push({p,sim,renderer,options});}}
 objects.push(await particleField({...atlas,format:'rgba32float'}),await particleField({...atlas,format:'rgba16float'}));
 const empty=await particleField({initialCount:0,rate:0}),sprites=await Promise.all((['ring','star','petal','confetti'] as const).map(kind=>fieldSprite(init,kind)));
 let failures=0;
 async function expect(code:string,fn:()=>Promise<unknown>){try{await fn();throw Error('Expected '+code);}catch(e){if((e as {code?:string}).code!==code)throw e;failures++;}}
 const publish=async(name:string,image:any)=>{const view=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(name,view,{version:1});}finally{await g.releaseBuffer(view);}};
 return {async renderAt(c){const mode=c.frame%22,owned=[] as any[];try{
  const source=await g.upload(surfaceFromPixels(4,2,[2,0,0,1, 0,0,0,0, 0,.5,1,.5, 0,0,0,0, 1,.5,0,.5, 0,0,0,0, 0,0,3,1, 0,0,0,0],{format:mode>=10&&mode<20||mode===21?'rgba16float':'rgba32float',alpha:'premultiplied',color:linear709}));owned.push(source);
  if(mode===20)await expect('E_CREATION_INPUT',()=>objects[20].renderAt(c,{},{}));
  const result=await objects[mode].renderAt(c,{atlas:source},{});owned.push(result);await publish('rgba',result);await publish('source',source);
  if(mode===0||mode===10||mode>=20){const m=manual[mode===0?0:mode===10?2:mode===20?1:3],frame=m.sim.sample(c),radius=m.options.radius===undefined?undefined:evaluate(m.options.radius,c),appearance={...frame,particles:frame.particles.map((p:any)=>({...p,radius:(radius??p.radius)*(1+(seededRandom(frame.seed,p.id,'creation-radius')*2-1)*m.p.sizeVariation)}))},image=await m.renderer.render(appearance,c,{...m.p.style,ink:evaluate(m.options.color??m.p.style.ink??[1,1,1],c)},mode>=20?{spriteAtlas:{source,columns:2,rows:1,count:2,frameBlending:true}}:{});try{await publish('manual',image);}finally{await g.release(image);}}
  if(c.frame===0){const image=await empty.renderAt(c,{},{});try{await publish('empty',image);}finally{await g.release(image);}}
  if(c.frame===132){for(let i=0;i<sprites.length;i++){const image=await sprites[i]!.render();try{await publish('sprite'+i,image);}finally{await g.release(image);}}}
  const inspected=await objects[mode].inspect(),state=await g.createBuffer({type:'f32',length:5},Float32Array.of(mode,c.time,failures,inspected.renderer.last.primitives,g.stats().activeImages));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}
  owned.splice(owned.indexOf(result),1);return result;
 }finally{for(const image of owned)await g.release(image);}},async dispose(){for(const o of objects)await o.dispose?.();await empty.dispose?.();for(const m of manual)m.renderer.dispose();for(const s of sprites)await s?.dispose();}};
});
export default Composition({id:'particle-fields-verify',width:64,height:48,fps:24,durationInFrames:154,seed:37,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
