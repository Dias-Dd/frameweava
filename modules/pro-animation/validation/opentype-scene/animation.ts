import {keyframes,evaluate} from '../../../../src/core/animation.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import type {ShapedRun} from '../../src/font-shaping.ts';
import {selectGlyphClass,selectMarkAttachmentClass,selectAttachmentPoints,selectFontGlyphIds,combineGlyphSelections,invertGlyphSelection,openTypeSelectionTransform,type GlyphDefinitions,type MappedLigatureCaret} from '../../src/opentype/index.ts';
import type {TextGlyphUnit} from '../../src/text-animation/common.ts';
export const inkAlpha=keyframes([{frame:0,value:.65},{frame:7,value:.9}]);
const amount=keyframes([{frame:0,value:0},{frame:7,value:1}]);
export const colors=[[-.18,1.8,3.2],[-.08,1.3,.6],[2,-.12,.8],[.5,-.1,2]] as const;
export function openTypeAt(run:ShapedRun,defs:GlyphDefinitions,carets:readonly MappedLigatureCaret[],context:FrameContext){
 const lig=selectGlyphClass(run,defs,[2]),marks=selectGlyphClass(run,defs,[3]),markAttach=selectMarkAttachmentClass(run,defs,[1,2]),attachments=selectAttachmentPoints(run,defs,[0,4]),first=selectFontGlyphIds(run,run.layout.glyphs.slice(0,1).map(g=>g.glyphId)),semantic=combineGlyphSelections(combineGlyphSelections(lig,marks,'union'),combineGlyphSelections(markAttach,attachments,'union'),'union'),selection=combineGlyphSelections(semantic,first,'union'),others=invertGlyphSelection(selection),phase=evaluate(amount,context),transform=openTypeSelectionTransform(selection,weight=>({matrix:[1,0,0,1,weight*12*Math.sin(phase*Math.PI),-weight*8*Math.sin(phase*Math.PI)],opacity:1-weight*.2*phase}));
 return {transform:(u:TextGlyphUnit)=>transform(u),trace:{selection,others,carets,phase}};
}
