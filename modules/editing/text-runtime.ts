import type {NativeStageInit} from '../native-gpu/authoring.ts';
import type {FrameContext} from '../../src/core/types.ts';
import type {EditPlan} from './types.ts';
import {createNativeParagraphRenderer,type NativeParagraphHandle} from '../pro-animation/src/text-layout/native.ts';
import {createGpuPixelEffects} from '../gpu-effects/pixel-effects.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {scene2D,rect,solid} from '../native-2d/index.ts';
import {validateTextAsset,textError,type TextAsset} from './text.ts';
import {EngineError} from '../../src/core/errors.ts';
/** Existing paragraph renderer + existing native-2d plate, initialized before the owner seals seeds.
 * Prepared authoring viewports stay intact; the ordinary edit quad handles output resampling. */
export async function createEditTextPainter(init:NativeStageInit,plan:EditPlan){
 type Group={text:ReturnType<typeof createNativeParagraphRenderer>;plate?:Awaited<ReturnType<typeof scene2D>>};
 const groups=new Map<string,Group>(),handles=new Map<string,{handle:NativeParagraphHandle;group:Group}>(),fx=createGpuPixelEffects(init.gpu);
 const dispose=async()=>{const settled=await Promise.allSettled([...groups.values()].flatMap(g=>[g.text.dispose(),g.plate?.dispose?.()])),errors=settled.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new EngineError('E_EDIT_TEXT_CLEANUP',errors.map(r=>String(r.reason)).join('; '));};
 try{
  for(const track of plan.tracks)for(const p of track){const a=p.clip.asset;if(a.kind!=='text'||handles.has(a.id))continue;validateTextAsset(a);const key=a.width+'x'+a.height,view={...init,width:a.width,height:a.height};let group=groups.get(key);
   if(!group){group={text:createNativeParagraphRenderer(view)};groups.set(key,group);}
   handles.set(a.id,{handle:await group.text.prepare(a.paragraph),group});
   if(a.plate&&!group.plate)group.plate=await scene2D(view,rect({id:'caption-plate',width:1,height:1,fill:solid([0,0,0],.68)}),{format:plan.format});
  }
 }catch(error){await dispose().catch(()=>{});throw error;}
 return {async draw(asset:TextAsset,c:FrameContext){const entry=handles.get(asset.id);if(!entry)textError('Caption geometry was not prepared for this Stage');
  return withGpuResources(init.gpu,async arena=>{
   const letters=arena.image(await entry.group.text.at(c).draw(entry.handle,{format:plan.format,ink:asset.ink,transform:()=>({matrix:[1,0,0,1,0,asset.offsetY],opacity:1})}));
   if(!asset.plate)return arena.keep(letters);
   const [x,y,width,height]=asset.plate.box,[r,g,b,a]=asset.plate.color,plate=entry.group.plate!;plate.update('caption-plate',{x,y,scaleX:width,scaleY:height,fill:solid([r,g,b],a)});
   const backdrop=arena.image(await plate.renderAt(c,{},{}));return arena.keep(arena.image(await fx.over(letters,backdrop,{format:plan.format})));
  });
 },dispose};
}
