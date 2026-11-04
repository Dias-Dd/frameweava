import {Composition,Stage,Layer,Resource,ref,linear709} from '@frameweave/engine';
import {defineNativeStage,fontGlyphResource} from '@frameweave/engine/native';

// Original tiny test fonts: a PNG strike and a shared, gzipped SVG document.
// Real fonts must supply their actual face/glyph/strike; a Unicode codepoint is
// not a glyph ID. Shape text with a text library before requesting these images.
export const bitmap=defineNativeStage(({gpu})=>({
  renderAt(){return gpu.importResource(fontGlyphResource({
    version:1,id:'bitmap-font',decode:'font-glyph-v1',faceIndex:0,
    glyphId:2,format:'sbix',strikeIndex:0,
    output:{width:8,height:6,format:'rgba16float',alpha:'premultiplied',color:linear709}
  }));}
}));
export const vector=defineNativeStage(({gpu})=>({
  renderAt(context){return gpu.importResource(fontGlyphResource({
    version:1,id:'vector-font',decode:'font-glyph-v1',faceIndex:0,
    glyphId:context.frame<12?2:6,format:'svg',
    svg:{viewBox:[0,0,1000,1000]},
    output:{width:160,height:160,format:'rgba32float',alpha:'premultiplied',color:linear709}
  }));}
}));
export default <Composition width={400} height={200} fps={24} durationInFrames={24} background="#12202D">
  <Resource id="bitmap-font" kind="font" src="./bitmap.ttf"/>
  <Resource id="vector-font" kind="font" src="./vector.ttf"/>
  <Stage id="bitmap" factory={bitmap} width={8} height={6}/>
  <Stage id="vector" factory={vector} width={160} height={160}/>
  <Layer source={ref('bitmap')} x={20} y={40} scale={20}/>
  <Layer source={ref('vector')} x={220} y={20}/>
</Composition>;
