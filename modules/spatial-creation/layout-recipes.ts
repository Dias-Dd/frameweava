import type {FrameContext,Signal} from '../../src/core/types.ts';
import {seededRandom} from '../../src/core/time.ts';
import {scalar,fail} from './lifecycle.ts';
import {assetOptions} from './physics-assets.ts';
export type LayoutOrientation='upright'|'radial'|'tangent';
export interface RadialLayout {kind:'radial';radius?:Signal<number>;startAngle?:Signal<number>;orient?:LayoutOrientation}
export interface ArcLayout {kind:'arc';radius?:Signal<number>;startAngle?:Signal<number>;endAngle?:Signal<number>;orient?:LayoutOrientation}
export interface SpiralLayout {kind:'spiral';radius?:Signal<number>;innerRadius?:Signal<number>;turns?:Signal<number>;startAngle?:Signal<number>;orient?:LayoutOrientation}
export interface ScatterLayout {kind:'scatter';seed?:number;angleSpread?:Signal<number>}
export interface CascadeLayout {kind:'cascade';step?:readonly [Signal<number>,Signal<number>];angleStep?:Signal<number>}
export interface FanLayout {kind:'fan';radius?:Signal<number>;startAngle?:Signal<number>;endAngle?:Signal<number>}
export interface GridLayout {kind:'grid';columns?:number;align?:'start'|'center'|'end'}
export type CreationLayout={kind:'row'}|{kind:'column'}|GridLayout|RadialLayout|ArcLayout|SpiralLayout|ScatterLayout|CascadeLayout|FanLayout;
export interface LayoutControls {padding?:Signal<number>;gap?:Signal<number>;itemSize?:readonly [Signal<number>,Signal<number>];scale?:Signal<number>;rotation?:Signal<number>;opacity?:Signal<number>;center?:readonly [Signal<number>,Signal<number>]}
export interface LayoutBox {x:number;y:number;width:number;height:number;rotation:number;opacity:number}
const fields={row:[],column:[],grid:['columns','align'],radial:['radius','startAngle','orient'],arc:['radius','startAngle','endAngle','orient'],spiral:['radius','innerRadius','turns','startAngle','orient'],scatter:['seed','angleSpread'],cascade:['step','angleStep'],fan:['radius','startAngle','endAngle']} as const;
export const layoutFields=(kind:CreationLayout['kind'])=>fields[kind];
function pair(v:unknown,name:string){if(v!==undefined&&(!Array.isArray(v)||v.length!==2))fail(name+' requires two scalar Signals');}
export function prepareLayout(value:CreationLayout={kind:'grid'}):CreationLayout{
 if(!Object.hasOwn(fields,value?.kind))fail('Unknown creator layout');assetOptions(value,['kind',...fields[value.kind]],'creator layout');
 if(value.kind==='grid'){if(value.columns!==undefined&&(!Number.isSafeInteger(value.columns)||value.columns<1))fail('Grid columns require a positive safe integer');if(value.align!==undefined&&!['start','center','end'].includes(value.align))fail('Unknown final-row alignment');}
 if('orient'in value&&value.orient!==undefined&&!['upright','radial','tangent'].includes(value.orient))fail('Unknown image layout orientation');
 if(value.kind==='scatter'&&value.seed!==undefined&&(!Number.isInteger(value.seed)||value.seed<0||value.seed>0xffffffff))fail('Scatter seed requires uint32');
 if(value.kind==='cascade')pair(value.step,'cascade step');try{return structuredClone(value);}catch{fail('Layout values require serializable Core Signals');}
}
export function checkLayoutControls(o:LayoutControls){pair(o.itemSize,'itemSize');pair(o.center,'center');}
/** CPU control coordinates only, not image pixels or a second scene graph.
 * Randomness uses the original Core RNG with a stable item index/frame0. */
export function sampleLayout(layout:CreationLayout,o:LayoutControls,count:number,c:FrameContext,width:number,height:number,seed:number):LayoutBox[]{
 const pad=scalar(o.padding??Math.min(16,Math.min(width,height)*.05),c,'layout padding',0),gap=scalar(o.gap??Math.min(12,Math.min(width,height)/30),c,'layout gap',0),w=width-2*pad,h=height-2*pad,scale=scalar(o.scale??1,c,'layout scale',0),angle=scalar(o.rotation??0,c,'item rotation'),opacity=scalar(o.opacity??1,c,'layout opacity',0,1),cx=scalar(o.center?.[0]??width/2,c,'layout center.x')-width/2,cy=scalar(o.center?.[1]??height/2,c,'layout center.y')-height/2;
 if(w<=0||h<=0)fail('Layout padding consumes the Stage dimensions');const custom=o.itemSize?[scalar(o.itemSize[0],c,'item width',Number.MIN_VALUE),scalar(o.itemSize[1],c,'item height',Number.MIN_VALUE)]:undefined;
 const boxes:LayoutBox[]=[],n=Math.max(count,1),columns=layout.kind==='row'?n:layout.kind==='column'?1:layout.kind==='grid'?layout.columns??Math.ceil(Math.sqrt(n)):1,rows=Math.ceil(n/columns),cellW=(w-(columns-1)*gap)/columns,cellH=(h-(rows-1)*gap)/rows,grid=['row','column','grid'].includes(layout.kind);
 if(grid&&(cellW<=0||cellH<=0))fail('Layout gap consumes the available cells; reduce gap or choose another arrangement');
 const polar=layout.kind==='radial'||layout.kind==='arc'||layout.kind==='spiral'||layout.kind==='fan',radius=polar?scalar(layout.radius??Math.min(w,h)*(layout.kind==='fan'?.5:.32),c,'layout radius',0):Math.min(w,h)*.32,inner=layout.kind==='spiral'?scalar(layout.innerRadius??0,c,'inner radius',0):0;
 if(layout.kind==='spiral'&&inner>radius)fail('innerRadius must not exceed radius');
 const start=polar?scalar(layout.startAngle??(layout.kind==='arc'?-150:layout.kind==='fan'?-25:-90),c,'start angle'):0,end=layout.kind==='arc'||layout.kind==='fan'?scalar(layout.endAngle??(layout.kind==='arc'?-30:25),c,'end angle'):0,turns=layout.kind==='spiral'?scalar(layout.turns??1.25,c,'spiral turns'):0,step=layout.kind==='cascade'?[scalar(layout.step?.[0]??w/(n+2)*.6,c,'cascade step.x'),scalar(layout.step?.[1]??h/(n+2)*.6,c,'cascade step.y')]:[0,0],angleStep=layout.kind==='cascade'?scalar(layout.angleStep??-4,c,'cascade angle step'):0,spread=layout.kind==='scatter'?scalar(layout.angleSpread??12,c,'scatter angle spread',0):0;
 for(let i=0;i<count;i++){
  let x=0,y=0,rotation=angle,size=grid?[cellW,cellH]:layout.kind==='fan'?[w*.6,h*.7]:layout.kind==='cascade'?[w*.65,h*.65]:[Math.min(w,h)*.26,Math.min(w,h)*.26];
  if(grid){const row=Math.floor(i/columns),col=i%columns,used=Math.min(columns,count-row*columns),align=layout.kind==='grid'?layout.align??'center':'center',shift=(columns-used)*(cellW+gap)*(align==='start'?0:align==='end'?1:.5);x=-w/2+cellW/2+col*(cellW+gap)+shift;y=-h/2+cellH/2+row*(cellH+gap);}
  else if(layout.kind==='cascade'){x=(i-(count-1)/2)*step[0];y=(i-(count-1)/2)*step[1];rotation+=(i-(count-1)/2)*angleStep;}
  else if(layout.kind==='scatter'){size=custom??size;const random=(salt:string)=>seededRandom(layout.seed??seed,i,'creation-layout/1/'+salt);x=(random('x')-.5)*Math.max(0,w-size[0]*scale);y=(random('y')-.5)*Math.max(0,h-size[1]*scale);rotation+=(2*random('angle')-1)*spread;}
  else{const u=count>1?i/(count-1):.5,degrees=layout.kind==='radial'?start+360*i/n:layout.kind==='spiral'?start+360*turns*u:start+(end-start)*u,radians=degrees*Math.PI/180,r=layout.kind==='spiral'?inner+(radius-inner)*(i+.5)/n:radius;
   x=r*Math.cos(radians);y=r*Math.sin(radians);if(layout.kind==='fan'){x=radius*Math.sin(radians);y=radius*(1-Math.cos(radians));rotation+=degrees;}
   else if('orient'in layout&&layout.orient==='radial')rotation+=degrees;else if('orient'in layout&&layout.orient==='tangent')rotation+=degrees+90;
  }
  size=custom??size;const box={x:x+cx,y:y+cy,width:size[0]*scale,height:size[1]*scale,rotation,opacity};if(Object.values(box).some(v=>!Number.isFinite(v)))fail('Layout produced nonfinite coordinates');boxes.push(box);
 }
 return boxes;
}
/** Full source canvas, never inferred Alpha bounds. Contain preserves aspect;
 * stretch fills a cell. Uniform item scale and authored overlaps stay explicit. */
export function fitLayoutBox(box:LayoutBox,sourceWidth:number,sourceHeight:number,width:number,height:number,fit:'contain'|'stretch'){
 if(![sourceWidth,sourceHeight].every(n=>Number.isSafeInteger(n)&&n>0))fail('Source image requires positive safe dimensions');
 const ratio=Math.min(box.width/sourceWidth,box.height/sourceHeight),w=fit==='stretch'?box.width:sourceWidth*ratio,h=fit==='stretch'?box.height:sourceHeight*ratio;
 return {x:box.x,y:box.y,scaleX:w/width,scaleY:h/height,rotation:box.rotation,opacity:box.opacity};
}
