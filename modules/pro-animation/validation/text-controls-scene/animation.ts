import {expr,keyframes} from '../../../../src/core/animation.ts';
import type {PreparedGlyphDrawData} from '../../src/text-animation/geometry.ts';
import {composeGlyphTransforms,glyphOpacity,glyphRotate} from '../../src/text-animation/transforms.ts';
import * as s from '../../src/text-styling/index.ts';
export function controls(mesh:PreparedGlyphDrawData){
 const all=()=>1,range=s.glyphRangeShape({start:-25,end:100,offset:expr.mul(expr.time,12),shape:'round'}),selected=s.quantizeGlyphSelector(s.smoothGlyphSelector(s.combineGlyphSelectors([range,()=>.1],{mode:'add'})),16),index=(u:{logicalIndex:number;count:number})=>u.logicalIndex/Math.max(1,u.count-1);
 const gradient=s.glyphInkGradient(index,[{at:0,ink:[-.2,2.2,4,.75]},{at:1,ink:[3,-.1,.3,.9]}]);
 const color=s.composeGlyphInk(gradient,s.glyphInk(selected,[.3,1.3,2.4,.8]),s.glyphInkOpacity(()=>.1,.9),s.glyphInkExposure(all,expr.mul(expr.time,.5)),s.glyphInkMultiply(()=>.2,[1.1,.9,1]),s.glyphInkOffset(()=>.1,[.1,-.05,.2]),s.glyphInkMatrix(()=>.2,[1,0,0,0,0,1,0,0,0,0,1,0]));
 const ink=s.composeGlyphInk(s.mixGlyphInk(color,s.maskGlyphInk(selected,s.glyphInk(all,[-.4,3,1,.6])),.12),s.glyphInkOffset(all,[-.7,0,0]));
 const transform=composeGlyphTransforms(s.glyphSkew(selected,{degrees:keyframes([{frame:0,value:-10},{frame:7,value:12}]),axisDegrees:0}),s.glyphBaselineShift(selected,expr.mul(expr.sin(expr.time),6)),s.glyphLineSpacing([...new Set(mesh.units.map(u=>u.lineId))],2),s.glyphCumulativeTracking(mesh.units,selected,.25),s.glyphWordSpacing(mesh.units,.5),s.glyphGroupTransform(mesh.units,u=>u.lineId,glyphRotate(all,{rotationDegrees:expr.mul(expr.sin(expr.time),1.5)})),s.glyphOrbit(()=>.1,{radiusX:3,radiusY:5,cyclesPerSecond:1,phasePerIndexDegrees:12}),s.mixGlyphTransforms(s.glyphLookAt(()=>.002,{target:[600,0],offsetDegrees:90}),s.glyphTransformOrigin(glyphRotate(()=>.002,{rotationDegrees:2}),[300,180]),.5),glyphOpacity(all,{opacity:.85}));
 return {transform,inkForUnit:ink};
}
