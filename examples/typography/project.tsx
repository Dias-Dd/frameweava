import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createNativeParagraphRenderer,type PreparedParagraphMeshes} from '@frameweave/engine/typography';
import prepared from './paragraph.json';
export const caption=defineNativeStage(async init=>{
 const renderer=createNativeParagraphRenderer(init),handle=await renderer.prepare(prepared as unknown as PreparedParagraphMeshes);
 return {renderAt(context){return renderer.at(context).draw(handle,{format:'rgba32float',ink:[2,.35,.08,keyframes([{frame:0,value:.2},{frame:3,value:1}])]});},dispose:()=>renderer.dispose()};
});
export default <Composition width={640} height={180} fps={24} durationInFrames={4} background="transparent"><Stage id="caption" factory={caption}/><Layer source={ref('caption')}/></Composition>;
