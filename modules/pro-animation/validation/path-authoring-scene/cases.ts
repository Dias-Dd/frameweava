import type {FrameContext} from '../../../../src/core/types.ts';
import {keyframes,evaluate} from '../../../../src/core/animation.ts';
import {createPathAuthoring,type Point} from '../../src/path-authoring/index.ts';
const animation=keyframes([{frame:0,value:0},{frame:7,value:6}]);
export function authoringCases(context:FrameContext){
 const paths=createPathAuthoring({width:640,height:480}).at(context),a=evaluate(animation,context),center=(i:number):[number,number]=>[64+(i%5)*128,48+Math.floor(i/5)*96],points=(i:number)=>{const [x,y]=center(i);return [[x-42,y+20],[x-22,y-16],[x,y+10+a],[x+22,y-24],[x+42,y+8]] as readonly Point[];};
 return [
  {name:'linePath',path:paths.linePath({points:points(0)})},
  {name:'stepPath',path:paths.stepPath({points:points(1),step:'middle'})},
  {name:'basisPath',path:paths.basisPath({points:points(2)})},
  {name:'cardinalPath',path:paths.cardinalPath({points:points(3),tension:a/10})},
  {name:'catmullRomPath',path:paths.catmullRomPath({points:points(4),alpha:.5})},
  {name:'monotonePath',path:paths.monotonePath({points:points(5)})},
  {name:'naturalPath',path:paths.naturalPath({points:points(6)})},
  {name:'bumpPath',path:paths.bumpPath({points:points(7),axis:'x'})},
  {name:'bundlePath',path:paths.bundlePath({points:points(8),beta:.4+a/12})},
  {name:'areaPath',path:paths.areaPath({points:[[-40,20,-10],[-20,20,-24],[0,20,-8-a],[20,20,-18],[40,20,-10]].map(([x,y0,y1])=>[x+center(9)[0],y0+center(9)[1],y1+center(9)[1]] as const),curve:'basis'})},
  {name:'radialLinePath',path:paths.radialLinePath({center:center(10),points:[[0,20],[Math.PI/2,30],[Math.PI,20+a],[Math.PI*1.5,30]],boundary:'closed',curve:'catmull-rom'})},
  {name:'radialAreaPath',path:paths.radialAreaPath({center:center(11),points:[[0,12,26],[1,12,32],[2,12,26+a],[3.5,12,32],[5,12,26]],curve:'linear'})},
  {name:'arcPath',path:paths.arcPath({center:center(12),innerRadius:12,outerRadius:30,startAngle:0,endAngle:Math.PI*1.6+a*.04,cornerRadius:3,padAngle:.1})},
  {name:'symbolPath',path:paths.symbolPath({center:center(13),type:'star',size:1000,rotation:a*.025})},
  {name:'rectanglePath',path:paths.rectanglePath({center:center(14),size:[76,40+a]})},
  {name:'roundedRectanglePath',path:paths.roundedRectanglePath({center:center(15),size:[76,40],radius:3+a})},
  {name:'ellipsePath',path:paths.ellipsePath({center:center(16),radius:[38,18+a]})},
  {name:'regularPolygonPath',path:paths.regularPolygonPath({center:center(17),radius:30,sides:6,rotation:-Math.PI/2+a*.025})},
  {name:'polystarPath',path:paths.polystarPath({center:center(18),outerRadius:32,innerRadius:12+a,points:5})},
  {name:'spiralPath',path:paths.spiralPath({center:center(19),endRadius:28+a,turns:2,samples:128})},
  {name:'sineWavePath',path:paths.sineWavePath({center:center(20),length:90,amplitude:18,cycles:2,phase:a*.04,samples:128})},
  {name:'lissajousPath',path:paths.lissajousPath({center:center(21),radius:[40,24],frequency:[3,2],phase:[Math.PI/2+a*.05,0],samples:160})},
  {name:'superellipsePath',path:paths.superellipsePath({center:center(22),radius:[40,24],power:2+a/3,samples:128})},
 ].map((item,index)=>({...item,origin:center(index)}));
}
