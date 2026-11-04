import {validateTextLayoutData,validatePathData,sameCoordinates} from './validate.ts';
import {fail,integer,number} from './check.ts';
import type {TextLayoutData,TextWritingMode,TextBaselineAxis,PathData,PathPoint} from './types.ts';

/** Pure interpretation of already-shaped data. No shaping, font substitution,
 * line breaking, GPU work, IO or implicit defaults written into the wire value. */
export function createTextLayoutGeometry(value:unknown){
 const layout=validateTextLayoutData(value);
 const paragraphs=new Map(layout.paragraphs.map(p=>[p.id,p]));
 const lines=new Map(layout.lines.map(line=>[line.id,line]));
 function lineAxes(lineId:string){
  const line=lines.get(lineId);if(!line)fail('$.lineId','unknown text line');
  const mode:TextWritingMode=paragraphs.get(line.paragraphId)!.writingMode??'horizontal-tb';
  const baselineAxis:TextBaselineAxis=line.baselineAxis??(mode==='horizontal-tb'?'y':'x');
  return {writingMode:mode,baselineAxis,inlineAxis:baselineAxis==='x'?'y' as const:'x' as const,
   baseline:line.baseline,blockProgression:mode==='vertical-rl'?-1 as const:1 as const};
 }
 function glyph(index:number){return layout.glyphs[integer(index,'$.glyphIndex',0,layout.glyphs.length-1)];}
 function glyphAnchor(index:number):readonly [number,number]{
  const g=glyph(index),line=lineAxes(g.lineId);
  return line.baselineAxis==='x'?[line.baseline,g.y]:[g.x,line.baseline];
 }
 /** Paths are positioned in layout coordinates but not yet orientation-rotated.
  * Positive quarter-turn is clockwise in top-left/y-down coordinates, around
  * the final glyph origin (x,y). Metrics, advances and clusters are not rotated. */
 function orientGlyphPath(index:number,input:unknown):PathData{
  const g=glyph(index),path=validatePathData(input);sameCoordinates(layout.coordinates,path.coordinates,'$.path.coordinates');
  if(!g.orientation||g.orientation==='upright')return path;
  const sign=g.orientation==='sideways-right'?1:-1;
  const point=(p:PathPoint):PathPoint=>({...p,
   x:number(g.x-sign*(p.y-g.y),'$.oriented.x'),y:number(g.y+sign*(p.x-g.x),'$.oriented.y')});
  return {...path,commands:path.commands.map(c=>c.op==='Z'?c:c.op==='Q'?{...c,control:point(c.control),point:point(c.point)}:
   c.op==='C'?{...c,control1:point(c.control1),control2:point(c.control2),point:point(c.point)}:{...c,point:point(c.point)})};
 }
 return Object.freeze({lineAxes,glyphAnchor,orientGlyphPath});
}

/** Guard for consumers whose existing algorithms still assume an x inline axis.
 * They must reject vertical input, never erase its metadata or misplace ink. */
export function assertHorizontalTextLayout(layout:TextLayoutData,consumer:string):void{
 if(layout.paragraphs.some(p=>p.writingMode!==undefined&&p.writingMode!=='horizontal-tb')||layout.lines.some(l=>l.baselineAxis==='x')||layout.glyphs.some(g=>g.orientation&&g.orientation!=='upright'))
  fail('$.paragraphs',consumer+' currently supports horizontal-tb only; use a vertical-aware glyph consumer','E_GRAPHICS_WRITING_MODE');
}
