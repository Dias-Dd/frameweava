import {keyframes} from '../../../../src/core/animation.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import type {ParagraphIndex,ParagraphCluster} from '../../src/text-layout/queries.ts';
import * as glyph from '../../src/text-animation/index.ts';
export const inkAlpha=keyframes([{frame:0,value:.65},{frame:7,value:.9}]);
export function paragraphAnimation(index:ParagraphIndex){
 const selected=glyph.wordRangeSelector(index.source.layout.text,index.words),remaining=glyph.selectorInvert(selected),motion=glyph.noiseSelector({seed:71,frequency:.15,speed:.7}),transform=glyph.composeGlyphTransforms(glyph.glyphTranslate(motion,{y:keyframes([{frame:0,value:-3},{frame:7,value:5}])}),glyph.glyphRotate(remaining,{rotationDegrees:1.5}),glyph.glyphTracking(selected,{amount:.025,order:'logical'}));
 return (unit:ParagraphCluster,context:FrameContext)=>transform(unit,context);
}
