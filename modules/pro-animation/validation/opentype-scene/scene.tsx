/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../../../gpu-effects/pixel-effects.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {type NativeGlyphHandle,createNativeGlyphRenderer} from '../../src/text-animation/native.ts';
import type {PreparedGlyphGeometry} from '../../src/text-animation/geometry.ts';
import {drawPathMesh} from '../../src/path-authoring/native.ts';
import {solidStrokeInk,type PreparedStrokeMesh} from '../../src/stroke-animation/index.ts';
import type {ShapedRun} from '../../src/font-shaping.ts';
import type {GlyphDefinitions,MappedLigatureCaret} from '../../src/opentype/index.ts';
import {prepared as raw} from './prepared.ts';
import {openTypeAt,inkAlpha,colors} from './animation.ts';
export const rows=raw.rows as unknown as {run:ShapedRun;definitions:GlyphDefinitions;carets:MappedLigatureCaret[];mesh:PreparedGlyphGeometry}[];
export const openTypeStage=defineNativeStage(async init=>{
 const g=init.gpu;let drawIndex=0;const observed=new Proxy(g,{get(target,key){if(key==='drawMesh')return async(o:Parameters<NativeGpuScope['drawMesh']>[0])=>{const image=await target.drawMesh(o),id=drawIndex++;await g.publishBuffer('geometry'+id,o.positions,{version:1});const palette=await g.imageToBuffer!(o.texture!.image,{version:1});await g.publishBuffer('palette'+id,palette,{version:1});await g.releaseBuffer(palette);return image;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}),text=createNativeGlyphRenderer({...init,gpu:observed}),handles:NativeGlyphHandle[]=[];for(const row of rows)handles.push(await text.prepare(row.mesh));const over=createGpuPixelEffects(g),pa=createNativePaImageEffects(init);
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float'}){
  drawIndex=0;const states=rows.map(r=>openTypeAt(r.run,r.definitions,r.carets,context)),json=JSON.stringify(states.map(s=>s.trace)),words=Uint32Array.from({length:json.length},(_,i)=>json.charCodeAt(i)),trace=await g.createBuffer({type:'u32',length:words.length},words);await g.publishBuffer('trace',trace,{version:1});await g.releaseBuffer(trace);
  return withGpuResources(g,async arena=>{let combined;const positions:number[]=[];
   for(const [i,row]of rows.entries()){
    const image=arena.image(await text.at(context).draw(handles[i],{transform:states[i].transform,ink:[...colors[i],inkAlpha],format:props.format}));combined=combined?arena.image(await over.over(image,combined,{format:props.format})):image;
    for(const c of row.carets){if(!c.position)continue;const unit=row.mesh.units.find(u=>u.glyphIndices.includes(c.glyphIndex))!,control=states[i].transform(unit),m=control.matrix,[px,py]=c.position,x=m[0]*px+m[2]*py+m[4],y=m[1]*px+m[3]*py+m[5];for(const [a,b]of [[x-.6,y-18],[x+.6,y-18],[x+.6,y+4],[x-.6,y-18],[x+.6,y+4],[x-.6,y+4]])positions.push(a,b,.5);}
   }
   const mesh:PreparedStrokeMesh={coordinates:rows[0].run.layout.coordinates,closed:false,positions,parameters:Array.from({length:positions.length/3},()=>0),diagnostics:[],preparation:{faces:positions.length/18,triangles:positions.length/9,maxAreaDeviation:0,roundTolerance:.02,gridSize:.0025,sampleCount:0}},markers=arena.image(await drawPathMesh(init,mesh,context,{ink:solidStrokeInk([2,.9,-.1,.7]),format:props.format})),marked=arena.image(await over.over(markers,combined!,{format:props.format})),final=arena.image(await pa.processImage(marked,(image,fx)=>fx.glow(image,{radius:1.1,intensity:.1,threshold:.5,format:props.format}),{context})),pixels=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('pixels',pixels,{version:1});await g.releaseBuffer(pixels);return arena.keep(final);
  });
 },async dispose(){await text.dispose();await pa.dispose();}};
});
export function openTypeScene(format:'rgba16float'|'rgba32float'){return <Composition width={720} height={400} fps={24} durationInFrames={8} background="transparent"><Stage id="opentype" factory={openTypeStage} props={{format}}/><Layer source={ref('opentype')}/></Composition>;}
