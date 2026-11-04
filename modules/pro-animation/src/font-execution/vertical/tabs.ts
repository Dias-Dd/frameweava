// SPDX-License-Identifier: Apache-2.0
// Inline-axis adapter to the existing tab solver; original shaping/source glyphs remain authoritative.
import * as graphics from '../../../../graphics-contracts/index.ts';
import type {ShapedBidiLine} from '../../bidi-line.ts';
import {placeLineTabs,type TextTabOptions,type PlacedTextTab} from '../../text-layout/tabs.ts';
import type {VerticalRun} from './run.ts';
export interface VerticalPiece {run:VerticalRun;sourceUnits:number[]}
export function placeVerticalTabs(pieces:VerticalPiece[],text:string,sourceStart:number,advance:number,options:TextTabOptions,size:number){
 const sign=advance<0?-1:1,glyphs:VerticalRun['layout']['glyphs']=[],locations:{piece:number;glyph:number;old:number}[]=[];let pen=0;
 for(const [piece,{run,sourceUnits}]of pieces.entries()){
  for(const [index,g]of run.layout.glyphs.entries()){const x=sign*(pen+g.y);locations.push({piece,glyph:index,old:x});glyphs.push({...g,id:'glyph.'+glyphs.length,lineId:'line',orientation:'upright',cluster:{start:sourceUnits[g.cluster.start]-sourceStart,end:sourceUnits[g.cluster.end-1]+1-sourceStart},x,y:0,advanceX:sign*g.advanceY,advanceY:0});}pen+=run.advance[1];
 }
 if(!glyphs.length)return {pieces,advance,tabs:[] as PlacedTextTab[]};
 // Transient solver coordinates: visual inline progression is +x even in an RTL
 // paragraph. Canonical vertical directions/orientations are restored unchanged.
 const base=pieces[0].run.layout,layout=graphics.validateTextLayoutData({...base,text,id:'vertical.tab.measurement',paragraphs:[{id:'paragraph',start:0,end:text.length,direction:'ltr'}],lines:[{id:'line',paragraphId:'paragraph',start:0,end:text.length,baseline:0}],glyphs}),projected={layout,glyphPaths:[],origin:[0,0],advance:Math.abs(advance),diagnostics:[]} as unknown as ShapedBidiLine;
 const placed=placeLineTabs(graphics,projected,options,{x:0,align:'start',size}),out=pieces.map(p=>({...p,run:structuredClone(p.run)}));
 for(const [i,location]of locations.entries()){
  const delta=sign*(placed.layout.glyphs[i].x-location.old),run=out[location.piece].run,g=run.layout.glyphs[location.glyph];g.y+=delta;g.advanceY=sign*placed.layout.glyphs[i].advanceX;
  for(const item of run.glyphPaths)if(item.glyphIndex===location.glyph){const point=(p:{id:string;x:number;y:number})=>({...p,y:p.y+delta});item.path=graphics.validatePathData({...item.path,commands:item.path.commands.map(c=>c.op==='Z'?c:c.op==='C'?{...c,control1:point(c.control1),control2:point(c.control2),point:point(c.point)}:c.op==='Q'?{...c,control:point(c.control),point:point(c.point)}:{...c,point:point(c.point)})});}
 }
 return {pieces:out,advance:sign*placed.advance,tabs:placed.tabs!.map(t=>({...t,sourceIndex:t.sourceIndex+sourceStart})),diagnostics:placed.diagnostics};
}
