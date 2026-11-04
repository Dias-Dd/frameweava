/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../../../gpu-effects/pixel-effects.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {createNativeParagraphRenderer} from '../../src/text-layout/native.ts';
import {createParagraphIndex} from '../../src/text-layout/queries.ts';
import type {TextBox} from '../../src/text-layout/common.ts';
import {createNativeStrokeRenderer,solidStrokeInk,type PreparedStrokeMesh,type NativeStrokeHandle} from '../../src/stroke-animation/index.ts';
import {prepared} from './prepared.ts';
import {paragraphAnimation,inkAlpha} from './animation.ts';
import {querySnapshot} from './queries.ts';
function rectangles(boxes:readonly TextBox[]):PreparedStrokeMesh{
 const positions:number[]=[];for(const b of boxes)for(const [x,y]of [[b.left,b.top],[b.right,b.top],[b.right,b.bottom],[b.left,b.top],[b.right,b.bottom],[b.left,b.bottom]])positions.push(x,y,.5);
 return {coordinates:prepared.layout.coordinates,closed:false,positions,parameters:positions.filter((_,i)=>i%3===0).map(()=>0),diagnostics:[],preparation:{faces:boxes.length,triangles:boxes.length*2,maxAreaDeviation:0,roundTolerance:.02,gridSize:.0025,sampleCount:boxes.length*4}};
}
export const paragraphStage=defineNativeStage(async init=>{
 const g=init.gpu,observed=new Proxy(g,{get(target,key){if(key==='drawMesh')return async(o:Parameters<NativeGpuScope['drawMesh']>[0])=>{const image=await target.drawMesh(o);await g.publishBuffer('geometry',o.positions,{version:1});const palette=await g.imageToBuffer!(o.texture!.image,{version:1});await g.publishBuffer('palette',palette,{version:1});await g.releaseBuffer(palette);return image;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 // Node precompute owns fonts/segmentation. Native derives geometry queries from the
 // original canonical layout again; no browser APIs or untrusted code admission.
 const index=createParagraphIndex(prepared.index.source),text=createNativeParagraphRenderer({...init,gpu:observed}),handle=await text.prepare(prepared),animate=paragraphAnimation(index),rects=createNativeStrokeRenderer(init),over=createGpuPixelEffects(g),pa=createNativePaImageEffects(init);
 const snapshots=Array.from({length:8},(_,frame)=>querySnapshot(index,frame)),selections:NativeStrokeHandle[]=[],carets:NativeStrokeHandle[]=[];
 for(const snapshot of snapshots){selections.push(await rects.prepare(rectangles(snapshot.selection.rects.map(r=>r.box))));const c=snapshot.caret.caret!;carets.push(await rects.prepare(rectangles([{left:c.x,top:c.emBox.top,right:c.x+1.5,bottom:c.emBox.bottom,width:1.5,height:c.emBox.height}])));}
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float'}){
  if(!Number.isSafeInteger(context.frame)||context.frame<0||context.frame>=8)throw Error('Editable fixture contains eight explicit finite source-selection frames0..7');
  // Execute all19 query functions in the actual Stage, not only their precomputed output.
  const snapshot=querySnapshot(index,context.frame),json=JSON.stringify(snapshot),words=Uint32Array.from({length:json.length},(_,i)=>json.charCodeAt(i)),trace=await g.createBuffer({type:'u32',length:words.length},words);await g.publishBuffer('queries',trace,{version:1});await g.releaseBuffer(trace);
  return withGpuResources(g,async arena=>{
   const backdrop=arena.image(await rects.at(context).draw(selections[context.frame],{ink:solidStrokeInk([.02,.2,.4,.2]),format:props.format})),letters=arena.image(await text.at(context).draw(handle,{transform:animate,ink:[-.12,1.8,3.1,inkAlpha],format:props.format})),glow=arena.image(await pa.processImage(letters,(image,fx)=>fx.glow(image,{radius:1.1,intensity:.1,threshold:.5,format:props.format}),{context})),selection=arena.image(await over.over(glow,backdrop,{format:props.format})),cursor=arena.image(await rects.at(context).draw(carets[context.frame],{ink:solidStrokeInk([.2,2,3,.8]),format:props.format})),final=arena.image(await over.over(cursor,selection,{format:props.format})),pixels=await g.imageToBuffer!(final,{version:1});
   await g.publishBuffer('pixels',pixels,{version:1});await g.releaseBuffer(pixels);return arena.keep(final);
  });
 },async dispose(){await text.dispose();await rects.dispose();await pa.dispose();}};
});
export function paragraphScene(format:'rgba16float'|'rgba32float'){return <Composition width={720} height={360} fps={24} durationInFrames={8} background="transparent"><Stage id="paragraph" factory={paragraphStage} props={{format}}/><Layer source={ref('paragraph')}/></Composition>;}
