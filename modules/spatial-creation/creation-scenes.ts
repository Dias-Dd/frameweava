import type {CreationInit,CreationOptions,CreationStage} from './types.ts';
import type {SilkRibbonOptions} from './objects.ts';
import {silkRibbon} from './objects.ts';
import {starField,dustField,confettiField,sparkField,energyField,type ParticleFieldOptions} from './particle-field.ts';
import {gradientBackground,stackCreations,type GradientBackgroundOptions} from './composition.ts';
import {validateCreation,defaultCamera} from './lifecycle.ts';
type Field=Omit<ParticleFieldOptions,'post'|'signal'|'format'|'backgroundInput'>;
type Backdrop=Omit<GradientBackgroundOptions,'post'|'signal'|'format'>;
interface ShotOptions extends CreationOptions {background?:Backdrop}
export interface StarlitRibbonOptions extends ShotOptions {ribbon?:Omit<SilkRibbonOptions,'post'|'signal'|'format'>;stars?:false|Field;dust?:false|Field}
export interface CelebrationOptions extends ShotOptions {confetti?:Field;sparks?:false|Field}
export interface EnergySceneOptions extends ShotOptions {energy?:Field;stars?:false|Field}
/** Normal async TypeScript assembly. No Stage specs, scheduler or graph IR. */
async function shot(init:CreationInit,o:ShotOptions,build:(add:(create:()=>CreationStage|Promise<CreationStage>)=>Promise<CreationStage>,format:'rgba16float'|'rgba32float')=>Promise<CreationStage[]>,defaultFinish:CreationOptions['finish']){
 const made:CreationStage[]=[],add=async(fn:()=>CreationStage|Promise<CreationStage>)=>{const stage=await fn();made.push(stage);return stage;};
 try{return await stackCreations(init,await build(add,o.format??'rgba32float'),{format:o.format,finish:o.finish??defaultFinish,post:o.post,signal:o.signal,ownership:'owned'});}catch(error){await Promise.allSettled(made.map(s=>s.dispose?.()));throw error;}
}
/** A complete opaque shot: existing gradient, stars, dust, lit ribbons and finish. */
export function starlitRibbonScene(init:CreationInit,o:StarlitRibbonOptions={}){
 validateCreation(init,o,['background','ribbon','stars','dust']);return shot(init,o,async(add,format)=>{
  const list=[await add(()=>gradientBackground(init,{center:[.018,.032,.075],edge:[.001,.002,.006],...o.background,format,signal:o.signal}))];
  if(o.stars!==false)list.push(await add(()=>starField(init,{initialCount:55,rate:0,radius:.023,opacity:.3,...o.stars,format,signal:o.signal})));
  if(o.dust!==false)list.push(await add(()=>dustField(init,{initialCount:70,rate:0,opacity:.13,...o.dust,format,signal:o.signal})));
  list.push(await add(()=>silkRibbon(init,{strands:2,segments:56,width:.38,length:5.2,amplitude:.48,twist:3.8,roughness:.28,metalness:.45,camera:{...defaultCamera,position:[.3,.4,6],viewHeight:Math.max(3.4,6/(init.width/init.height))},...o.ribbon,format,signal:o.signal})));return list;
 },'cinema');
}
export function celebrationScene(init:CreationInit,o:CelebrationOptions={}){
 validateCreation(init,o,['background','confetti','sparks']);return shot(init,o,async(add,format)=>{
  const list=[await add(()=>gradientBackground(init,{center:[.025,.018,.038],edge:[.002,.003,.01],...o.background,format,signal:o.signal}))];
  if(o.sparks!==false)list.push(await add(()=>sparkField(init,{initialCount:35,rate:50,opacity:.7,...o.sparks,format,signal:o.signal})));
  list.push(await add(()=>confettiField(init,{initialCount:115,rate:30,radius:.055,...o.confetti,format,signal:o.signal})));return list;
 },{glow:{radius:2,intensity:.12,threshold:1.3}});
}
export function energyScene(init:CreationInit,o:EnergySceneOptions={}){
 validateCreation(init,o,['background','energy','stars']);return shot(init,o,async(add,format)=>{
  const list=[await add(()=>gradientBackground(init,{center:[.018,.012,.04],edge:[.0008,.0015,.005],...o.background,format,signal:o.signal}))];
  if(o.stars!==false)list.push(await add(()=>starField(init,{initialCount:65,rate:0,radius:.026,opacity:.45,...o.stars,format,signal:o.signal})));
  list.push(await add(()=>energyField(init,{radius:.022,...o.energy,format,signal:o.signal})));return list;
 },{glow:{radius:2.5,intensity:.35,threshold:1},vignette:.18});
}
