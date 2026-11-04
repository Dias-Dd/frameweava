import {Composition,Stage,Layer,ref,keyframes,evaluate,parseColor,transformPixels,srgb,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {linearColor,solidBackground,gradientBackground,torus3D,silkRibbon,neonRing,characterWave,particleBurst,confettiField,gridClones,ribbonScene} from 'spatial-creation-candidate';
const track=keyframes([{frame:0,value:'#ff8b4a'},{frame:23,value:'#48cef0'}]);
// Expected conversion uses original public Core APIs, not the new linearColor adapter.
function expected(v:any,c:any){if(Array.isArray(v))return evaluate(v,c);const p=parseColor(evaluate(v,c))!;return [...transformPixels(Float32Array.of(p[0]/255,p[1]/255,p[2]/255,1),srgb,linear709,'straight').pixels].slice(0,3) as [number,number,number];}
export const verify=defineNativeStage(async init=>{
 if(JSON.stringify(linearColor('#808080'))!==JSON.stringify(expected('#808080',{})))throw Error('Public linearColor binding differs from Core');
 const gpu=init.gpu,formats=['rgba32float','rgba16float'] as const,objects:any[]=[];
 const make=async(kind:number,format:'rgba32float'|'rgba16float',c?:any)=>{const cv=(v:any)=>c?expected(v,c):v,common={format,finish:false as const};
  switch(kind){
   case 0:return solidBackground({...common,color:cv(track),opacity:.6});
   case 1:return gradientBackground({...common,center:cv(track),edge:cv('#040a12')});
   case 2:return torus3D({...common,ink:cv(track),opacity:.6,emissive:[.2,0,0]});
   case 3:return silkRibbon({...common,ink:cv(track),opacity:.6,segments:12});
   case 4:return neonRing({...common,ink:cv(track),opacity:.6,segments:12,radialSegments:3});
   case 5:return characterWave({...common,palette:{shirt:cv(track)},ink:cv('#ffffff'),opacity:.6,detail:8});
   case 6:return particleBurst({...common,count:8,style:{ink:cv(track),opacity:.6,fadeWithAge:false},simulation:{rate:0,lifetime:5,radius:.1,velocity:[0,0,0],velocityJitter:[.7,.7,0],forces:[],trailPoints:0}});
   case 7:return confettiField({...common,initialCount:10,rate:0,lifetime:5,palette:[cv('#ff9155'),cv('#44cce0')],color:cv(track),radius:.12,style:{opacity:.6,fadeWithAge:false},spriteResolution:16,simulation:{forces:[]}});
   case 8:return gridClones({...common,grid:[3,2,1],ink:cv(track),palette:[cv('#ff9155'),cv('#44cce0')],size:.3,opacity:.6});
   case 9:return solidBackground({format,color:cv('#43788a'),opacity:.6,finish:{tint:{black:cv(track),white:cv('#ffeec4'),amount:.65}}});
   case 10:return gradientBackground({format,center:cv('#43788a'),edge:cv('#010208'),finish:{tritone:{shadows:cv('#031320'),midtones:cv(track),highlights:cv('#fff1c8'),amount:.8}}});
   default:return ribbonScene({...common,ribbon:{ink:cv(track),segments:12,strands:1},particles:false,background:{center:cv('#112536'),edge:cv('#01040a')}});
  }
 };
 for(const format of formats)for(let kind=0;kind<12;kind++)objects.push(await make(kind,format));
 objects.push(await solidBackground({color:[-.25,6,1],opacity:.5}),await solidBackground({format:'rgba16float',color:[keyframes([{frame:0,value:-.25},{frame:23,value:.5}]),4,-.1],opacity:.5}));
 const bad=await solidBackground({color:'#123',finish:{tint:{white:keyframes([{frame:0,value:'invalid'},{frame:1,value:'#fff'}])}}}),alpha=await solidBackground({color:'#ff000080'}),publish=async(name:string,image:any)=>{const b=await gpu.imageToBuffer!(image,{version:1});try{await gpu.publishBuffer(name,b,{version:1});}finally{await gpu.releaseBuffer(b);}};let refused=0;
 return {async renderAt(c){const mode=c.frame%26,kind=mode%12,format=formats[Math.floor(mode/12)]??'rgba32float',image=await objects[mode].renderAt(c,{},{});try{
  await publish('rgba',image);
  if(mode<24){const oracle=await make(kind,format,c);try{const reference=await oracle.renderAt(c,{},{});try{await publish('manual',reference);}finally{await gpu.release(reference);}}finally{await oracle.dispose?.();}}
  if(c.frame===0){for(const stage of [bad,alpha]){try{const invalid=await stage.renderAt(c,{},{});await gpu.release(invalid);throw Error('Expected explicit color refusal');}catch(e){if((e as any).code!=='E_CREATION_COLOR')throw e;refused++;}if(stage.inspect().frames!==0)throw Error('Failed color call committed a successful frame');}const retry=await bad.renderAt({...c,frame:1,time:1/24,globalFrame:1,globalTime:1/24,progress:1/(c.durationInFrames-1)},{},{});await gpu.release(retry);if(bad.inspect().frames!==1)throw Error('Color retry did not commit');}
  const state=await gpu.createBuffer({type:'f32',length:4},Float32Array.of(mode,c.time,refused,gpu.stats().activeImages));try{await gpu.publishBuffer('state',state,{version:1});}finally{await gpu.releaseBuffer(state);}return image;
 }catch(e){await gpu.release(image);throw e;}},async dispose(){await Promise.all(objects.map(o=>o.dispose?.()));await bad.dispose?.();await alpha.dispose?.();}};
});
export default Composition({id:'colors-verify',width:64,height:48,fps:24,durationInFrames:104,seed:37,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
