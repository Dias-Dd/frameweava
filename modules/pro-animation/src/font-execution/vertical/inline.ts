// SPDX-License-Identifier: Apache-2.0
// Reuse the original tight Bézier bounds and canonical orientation; never scale ink.
import * as graphics from '../../../../graphics-contracts/index.ts';
import {outlineBounds} from '../../text-layout/queries.ts';
import {union} from '../../text-layout/common.ts';
import type {VerticalRun} from './run.ts';
export function verticalTsume(run:VerticalRun,amount:number,paths=run.glyphPaths,combined=false):VerticalRun{
 if(amount===0||!run.layout.glyphs.length)return run;
 const result=structuredClone(run),geometry=graphics.createTextLayoutGeometry(run.layout),groups:number[][]=[],inkByGlyph=new Map(paths.map(p=>[p.glyphIndex,outlineBounds(geometry.orientGlyphPath(p.glyphIndex,p.path))])),pathsByGlyph=new Map(result.glyphPaths.map(p=>[p.glyphIndex,p]));
 for(const [i,g]of run.layout.glyphs.entries()){
  const last=groups.at(-1),previous=last&&run.layout.glyphs[last[0]];
  if(last&&(combined||previous!.cluster.start===g.cluster.start&&previous!.cluster.end===g.cluster.end))last.push(i);else groups.push([i]);
 }
 const sign=run.advance[1]<0?-1:1;let removed=0;
 for(const indices of groups){
  const advance=indices.reduce((n,i)=>n+run.layout.glyphs[i].advanceY,0),ink=union(indices.map(i=>inkByGlyph.get(i)??null));
  // Zero-ink spaces and unsupported intrinsic-art bounds retain their declared
  // advance. No guessed bitmap, COLR or invisible-character rectangle is invented.
  const gap=ink?Math.max(0,Math.abs(advance)-ink.height)*amount:0,delta=-sign*(removed+gap/2);
  for(const i of indices){result.layout.glyphs[i].y+=delta;const item=pathsByGlyph.get(i);if(item){const point=(p:{id:string;x:number;y:number})=>({...p,y:p.y+delta});item.path={...item.path,commands:item.path.commands.map(c=>c.op==='Z'?c:c.op==='C'?{...c,control1:point(c.control1),control2:point(c.control2),point:point(c.point)}:c.op==='Q'?{...c,control:point(c.control),point:point(c.point)}:{...c,point:point(c.point)})};}}
  result.layout.glyphs[indices.at(-1)!].advanceY-=sign*gap;removed+=gap;
 }
 return {...result,advance:[run.advance[0],run.advance[1]-sign*removed]};
}
