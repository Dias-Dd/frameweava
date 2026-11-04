import {Composition,Stage,Layer,ref,keyframes,linear709,surfaceFromPixels} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {puppetImage,puppetSway,puppetBend,puppetStretch,puppetBreathe,puppetWave,puppetJelly,puppetFlutter,puppetReach,puppetSquash,puppetCard} from 'spatial-creation-candidate';
import {imagePuppetLayout} from '../../puppet-layout.ts'; // Differential reference only; carried author examples use public imports.
const pins={base:{at:[.5,.95] as const},tip:{at:[.5,.1] as const,offset:[keyframes([{frame:0,value:0},{frame:240,value:.14}]),0] as const}};
export const verify=defineNativeStage(async init=>{
 try{
 const g=init.gpu,layout=imagePuppetLayout(init.width,init.height,8,8,{pins}),creators=[puppetSway,puppetBend,puppetStretch,puppetBreathe,puppetWave,puppetJelly,puppetFlutter,puppetReach,puppetSquash];
 const sets=await Promise.all((['rgba32float','rgba16float'] as const).map(async format=>({
  // An explicit common frequency avoids aliasing the frame%20 test selector
  // with Flutter's default 20-frame period. Default cycles are tested separately.
  objects:await Promise.all([puppetImage({pins,format}),...creators.map(fn=>fn({format,frequency:.73}))]),
  manual:await puppetCard({mesh:layout.mesh,textureInput:'image',format,bounds:layout.bounds,pins:Object.fromEntries(Object.entries(pins).map(([name,p])=>{const xy=layout.world(p.at);return [layout.byName[name],name==='tip'?[keyframes([{frame:0,value:xy[0]},{frame:240,value:xy[0]+.14*layout.imageSize[0]}]),xy[1]]:xy];}))}),
 })));
 const badPins=Object.fromEntries([[0,0],[1,0],[0,1],[1,1]].map(([x,y],i)=>['p'+i,{at:[x,y] as const,to:[keyframes([{frame:0,value:x},{frame:1,value:.5}]),keyframes([{frame:0,value:y},{frame:1,value:.5}])] as const}]));
 const bad=await puppetImage({pins:badPins,segments:[1,1]});let failures=0,retries=0;
 async function expect(code:string,fn:()=>Promise<unknown>){try{await fn();throw Error('Expected '+code);}catch(e){if((e as {code?:string}).code!==code)throw e;failures++;}}
 return {async renderAt(c){const group=Math.floor(c.frame/10)%2,mode=c.frame%10,set=sets[group],owned=[] as any[];try{
  if(c.frame===200)await expect('E_CREATION_INPUT',()=>set.objects[mode].renderAt(c,{},{}));
  const pixels=Array.from({length:64},(_,i)=>{const x=i%8,y=Math.floor(i/8),a=(x===0||x===7||y===0||y===7)?0:(x===1||x===6?.25:.8);return [a*(2+x/8),a*(y/8-.2),a*.4,a];}).flat();
  const image=await g.upload(surfaceFromPixels(8,8,pixels,{format:group?'rgba16float':'rgba32float',alpha:'premultiplied',color:linear709}));owned.push(image);
  if(c.frame===1)await expect('E_PUPPET_FOLDOVER',()=>bad.renderAt(c,{image},{}));
  if(c.frame===0){const retry=await bad.renderAt(c,{image},{});await g.release(retry);retries++;}
  const result=await set.objects[mode].renderAt(c,{image},{});owned.push(result);
  if(c.frame===200){const wrong=await g.upload(surfaceFromPixels(2,2,Array(16).fill(.5),{format:'rgba32float',alpha:'premultiplied',color:linear709}));try{await expect('E_CREATION_INPUT_SIZE',()=>set.objects[mode].renderAt(c,{image:wrong},{}));}finally{await g.release(wrong);}}
  const publish=async(name:string,i:typeof result)=>{const buffer=await g.imageToBuffer!(i,{version:1});try{await g.publishBuffer(name,buffer,{version:1});}finally{await g.releaseBuffer(buffer);}};
  await publish('rgba',result);await publish('source',image);
  if(mode===0){const manual=await set.manual.renderAt(c,{image},{});try{await publish('manual',manual);}finally{await g.release(manual);}}
  const state=await g.createBuffer({type:'f32',length:6},Float32Array.of(group,mode,c.time,failures,retries,g.stats().activeImages));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}
  owned.splice(owned.indexOf(result),1);return result;
 }finally{for(const image of owned)await g.release(image);}},async dispose(){for(const set of sets){for(const o of set.objects)await o.dispose?.();await set.manual.dispose?.();}await bad.dispose?.();}};
 }catch(error){return {renderAt(){throw Object.assign(new Error('Fixture initialization: '+String(error)),{code:(error as {code?:string}).code??'E_FIXTURE_INIT'});}};}
});
export default Composition({id:'image-puppet-verify',width:64,height:48,fps:24,durationInFrames:240,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
