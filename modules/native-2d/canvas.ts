export type CanvasText2DOptions=Omit<import('./types.ts').TextNode,'id'|'kind'|'text'|'font'>&{font?:string};
// SPDX-License-Identifier: Apache-2.0
/** A recording adapter into Node2D. It owns no pixels, device, clock or Stage. */
import type {Node2D,GroupNode,Matrix2D,Paint,PathData,Services2D,FrameContext,TextNode,ImageNode,StrokeStyle} from './types.ts';
import {group,rect,ellipse,path,image,text,solid,linearGradient,radialGradient,identity2D,multiply2D,inverse2D,point2D,error2D} from './model.ts';
import {sink} from '../pro-animation/src/path-authoring/common.ts';
import {transformPathPoints} from '../pro-animation/src/path-controls/index.ts';
import {validatePathData} from '../graphics-contracts/validate.ts';
import type {PathCommand,PathPoint} from '../graphics-contracts/types.ts';
import {parseColor} from '../../src/core/animation.ts';
import {transformPixels} from '../../src/media/color.ts';import {srgb,linear709} from '../../src/media/surface.ts';

export type CanvasPaint2D=Paint|string|RecordedGradient2D;
type Clip=PathData|{rect:readonly[number,number,number,number]};
interface State {matrix:Matrix2D;fill:CanvasPaint2D;stroke:CanvasPaint2D;alpha:number;width:number;cap:StrokeStyle['cap'];join:StrokeStyle['join'];miter:number;smoothing:boolean;clips:readonly {id:number;value:Clip}[]}
export interface CanvasRecorderOptions {id:string;width:number;height:number;arcTolerance?:number;maxBytes?:number;services?:Services2D;context?:FrameContext}
function finite(v:number,name:string){if(!Number.isFinite(v))error2D('E_NATIVE_2D_CANVAS',name+' must be finite');return v;}
/** Converts one control color through the existing Core color pipeline, never an image. */
export function controlColor2D(value:string){const encoded=parseColor(value);if(!encoded||encoded.some(v=>!Number.isFinite(v))||encoded.slice(0,3).some(v=>v<0||v>255)||encoded[3]<0||encoded[3]>1)error2D('E_NATIVE_2D_COLOR','Unsupported Core sRGB color '+value);const p=transformPixels(Float32Array.of(...encoded.slice(0,3).map(v=>v/255),encoded[3]),srgb,linear709,'straight').pixels;return solid([p[0],p[1],p[2]],p[3]);}
export class RecordedGradient2D {
 private stops:{at:number;color:Paint}[]=[];
 constructor(private readonly factory:(stops:readonly import('./types.ts').GradientStop[])=>Paint){}
 addColorStop(at:number,value:string){if(!Number.isFinite(at)||at<0||at>1)error2D('E_NATIVE_2D_CANVAS','Gradient stop must be in [0,1]');this.stops.push({at,color:controlColor2D(value)});}
 /** Equal-offset hard stops are not silently blurred by the current strict-stop paint profile. */
 snapshot():Paint{const ordered=[...this.stops].sort((a,b)=>a.at-b.at);if(ordered.length<2||ordered.some((v,i)=>i&&v.at===ordered[i-1].at))error2D('E_NATIVE_2D_CANVAS','This gradient profile requires at least two distinct stop positions');return this.factory(ordered.map(s=>{const p=s.color;if(p.kind!=='solid')error2D('E_NATIVE_2D_CANVAS','Solid gradient stop required');return{at:s.at,color:p.color,opacity:p.opacity};}));}
}
const paint=(p:CanvasPaint2D):Paint=>typeof p==='string'?controlColor2D(p):p instanceof RecordedGradient2D?p.snapshot():structuredClone(p);
const rebasePaint=(p:Paint,m:Matrix2D):Paint=>p.kind==='solid'?p:{...p,matrix:multiply2D(m,p.matrix??identity2D)};
const commandPoints=(c:PathCommand):PathPoint[]=>c.op==='Z'?[]:c.op==='C'?[c.control1,c.control2,c.point]:c.op==='Q'?[c.control,c.point]:[c.point];

/** Explicitly scoped Canvas-shaped subset. Unsupported composition/pixel operations
 * diagnose; ordinary Canvas/DOM remains an explicit Servo choice. */
export class CanvasRecorder2D {
 private state:State={matrix:identity2D,fill:'#000000',stroke:'#000000',alpha:1,width:1,cap:'butt',join:'miter',miter:10,smoothing:true,clips:[]};
 private stack:State[]=[];private nodes:Node2D[]=[];private commands:PathCommand[]=[];private current?:readonly[number,number];private origin?:readonly[number,number];
 private serial=0;private points=0;private clipSerial=0;private activeClip='';private destination:Node2D[]=this.nodes;private rectangle?:readonly[number,number,number,number];private circle?:{radius:readonly[number,number];matrix:Matrix2D};
 constructor(readonly options:CanvasRecorderOptions){if(!options.id||!Number.isSafeInteger(options.width)||!Number.isSafeInteger(options.height)||options.width<1||options.height<1)error2D('E_NATIVE_2D_CANVAS','Stable ID and positive integer drawing dimensions required');}
 get fillStyle(){return this.state.fill;}set fillStyle(v:CanvasPaint2D){if(!(v instanceof RecordedGradient2D))paint(v);this.state.fill=v;}
 get strokeStyle(){return this.state.stroke;}set strokeStyle(v:CanvasPaint2D){if(!(v instanceof RecordedGradient2D))paint(v);this.state.stroke=v;}
 get globalAlpha(){return this.state.alpha;}set globalAlpha(v:number){if(!Number.isFinite(v)||v<0||v>1)error2D('E_NATIVE_2D_CANVAS','globalAlpha must be in [0,1]');this.state.alpha=v;}
 get lineWidth(){return this.state.width;}set lineWidth(v:number){if(!Number.isFinite(v)||v<=0)error2D('E_NATIVE_2D_CANVAS','lineWidth must be positive');this.state.width=v;}
 get lineCap(){return this.state.cap!;}set lineCap(v:NonNullable<StrokeStyle['cap']>){if(!['butt','round','square'].includes(v))error2D('E_NATIVE_2D_CANVAS','Known line cap required');this.state.cap=v;}
 get lineJoin(){return this.state.join!;}set lineJoin(v:NonNullable<StrokeStyle['join']>){if(!['miter','round','bevel','square'].includes(v))error2D('E_NATIVE_2D_CANVAS','Known line join required');this.state.join=v;}
 get miterLimit(){return this.state.miter;}set miterLimit(v:number){if(!Number.isFinite(v)||v<=0)error2D('E_NATIVE_2D_CANVAS','miterLimit must be positive');this.state.miter=v;}
 get imageSmoothingEnabled(){return this.state.smoothing;}set imageSmoothingEnabled(v:boolean){if(typeof v!=='boolean')error2D('E_NATIVE_2D_CANVAS','imageSmoothingEnabled must be boolean');this.state.smoothing=v;}
 get globalCompositeOperation(){return 'source-over' as const;}set globalCompositeOperation(v:string){if(v!=='source-over')error2D('E_NATIVE_2D_UNSUPPORTED','Canvas recorder currently supports source-over; use existing explicit compositor APIs for '+v);}
 save(){this.stack.push({...this.state,matrix:[...this.state.matrix],clips:[...this.state.clips]});}
 restore(){if(this.stack.length)this.state=this.stack.pop()!;}
 getTransform():Matrix2D{return[...this.state.matrix];}
 setTransform(a:number,b:number,c:number,d:number,e:number,f:number){const m=[a,b,c,d,e,f] as const;m.forEach(v=>finite(v,'matrix'));this.state.matrix=m;}
 resetTransform(){this.state.matrix=identity2D;}
 transform(a:number,b:number,c:number,d:number,e:number,f:number){const m=[a,b,c,d,e,f] as const;m.forEach(v=>finite(v,'matrix'));this.state.matrix=multiply2D(this.state.matrix,m);}
 translate(x:number,y:number){this.transform(1,0,0,1,x,y);}
 scale(x:number,y:number){this.transform(x,0,0,y,0,0);}
 rotate(radians:number){const a=finite(radians,'angle'),c=Math.cos(a),s=Math.sin(a);this.transform(c,s,-s,c,0,0);}
 beginPath(){this.commands=[];this.current=undefined;this.origin=undefined;this.rectangle=undefined;this.circle=undefined;}
 private append(command:PathCommand){const value=structuredClone(command);for(const p of commandPoints(value))p.id=this.options.id+':p'+this.points++;this.commands.push(value);if(this.commands.length*96>(this.options.maxBytes??64*1024**2))error2D('E_NATIVE_2D_BUDGET','Recorded path exceeds configured byte plan');if(value.op==='M'){this.current=[value.point.x,value.point.y];this.origin=this.current;}else if(value.op==='Z')this.current=this.origin;else this.current=[value.point.x,value.point.y];}
 private segment(run:(c:ReturnType<typeof sink>['context'])=>void,m:Matrix2D=this.state.matrix,connect=true){const out=sink({id:this.options.id,arcTolerance:this.options.arcTolerance},this.options,m);let skip=false;if(connect&&this.current){if(this.commands.at(-1)?.op==='Z')this.append({op:'M',point:{id:'',x:this.current[0],y:this.current[1]}});const local=point2D(inverse2D(m),this.current[0],this.current[1]);out.context.moveTo(...local);skip=true;}run(out.context);const result=out.finish();for(const c of result?.commands.slice(skip?1:0)??[])this.append(c);this.rectangle=undefined;this.circle=undefined;}
 moveTo(x:number,y:number){this.segment(c=>c.moveTo(x,y),this.state.matrix,false);}
 lineTo(x:number,y:number){this.segment(c=>c.lineTo(x,y));}
 quadraticCurveTo(cx:number,cy:number,x:number,y:number){this.segment(c=>{if(!this.current)c.moveTo(cx,cy);c.quadraticCurveTo(cx,cy,x,y);});}
 bezierCurveTo(c1x:number,c1y:number,c2x:number,c2y:number,x:number,y:number){this.segment(c=>{if(!this.current)c.moveTo(c1x,c1y);c.bezierCurveTo(c1x,c1y,c2x,c2y,x,y);});}
 closePath(){if(this.current)this.append({op:'Z'});}
 rect(x:number,y:number,width:number,height:number){const empty=this.commands.length===0;this.segment(c=>c.rect(x,y,width,height),this.state.matrix,false);const m=this.state.matrix;if(empty&&m[1]===0&&m[2]===0){const a=point2D(m,x,y),b=point2D(m,x+width,y+height);this.rectangle=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1])];}}
 arc(x:number,y:number,radius:number,start:number,end:number,counterclockwise=false){const empty=this.commands.length===0;this.segment(c=>c.arc(x,y,radius,start,end,counterclockwise));if(empty&&radius>0&&Math.abs(end-start)>=2*Math.PI)this.circle={radius:[radius,radius],matrix:multiply2D(this.state.matrix,[1,0,0,1,x,y])};}
 ellipse(x:number,y:number,rx:number,ry:number,rotation:number,start:number,end:number,counterclockwise=false){if(rx<=0||ry<=0)error2D('E_NATIVE_2D_CANVAS','Positive ellipse radii required');const empty=this.commands.length===0,c=Math.cos(rotation),s=Math.sin(rotation),m=multiply2D(this.state.matrix,[c*rx,s*rx,-s*ry,c*ry,x,y]);this.segment(ctx=>ctx.arc(0,0,1,start,end,counterclockwise),m);if(empty&&Math.abs(end-start)>=2*Math.PI)this.circle={radius:[rx,ry],matrix:multiply2D(this.state.matrix,[c,s,-s,c,x,y])};}
 private data(fillRule:'nonzero'|'evenodd'='nonzero'):PathData|undefined{if(!this.commands.length)return;return validatePathData({schema:'frameweave.path',version:1,id:this.options.id+':path'+this.serial,coordinates:{spaceId:'native-2d.canvas',width:this.options.width,height:this.options.height,unit:'px',origin:'top-left',x:'right',y:'down'},fillRule,commands:structuredClone(this.commands)});}
 private id(){return this.options.id+':draw'+this.serial++;}
 private emit(node:Node2D){const key=this.state.clips.map(v=>v.id).join('/');if(key!==this.activeClip){this.destination=this.nodes;for(const clip of this.state.clips){const children:Node2D[]=[],wrapper:GroupNode={kind:'group',id:this.options.id+':clip'+clip.id+':'+this.serial++,clip:structuredClone(clip.value),children};this.destination.push(wrapper);this.destination=children;}this.activeClip=key;}this.destination.push(node);}
 fill(fillRule:'nonzero'|'evenodd'='nonzero'){const data=this.data(fillRule);if(!data)return;if(this.circle){const p=this.circle;this.emit(ellipse({id:this.id(),radius:p.radius,matrix:p.matrix,fill:rebasePaint(paint(this.state.fill),inverse2D(p.matrix)),opacity:this.state.alpha}));}else if(this.rectangle){const [x,y,w,h]=this.rectangle,m:Matrix2D=[1,0,0,1,x,y];this.emit(rect({id:this.id(),width:w,height:h,matrix:m,fill:rebasePaint(paint(this.state.fill),inverse2D(m)),opacity:this.state.alpha}));}else this.emit(path({id:this.id(),data,fill:paint(this.state.fill),opacity:this.state.alpha}));}
 stroke(){const data=this.data();if(!data)return;const inv=inverse2D(this.state.matrix),local=transformPathPoints(data,inv);this.emit(path({id:this.id(),data:local,matrix:this.state.matrix,opacity:this.state.alpha,fill:false,stroke:{paint:rebasePaint(paint(this.state.stroke),inv),width:this.state.width,cap:this.state.cap,join:this.state.join,miterLimit:this.state.miter}}));}
 clip(fillRule:'nonzero'|'evenodd'='nonzero'){const data=this.data(fillRule);if(!data)return;this.state.clips=[...this.state.clips,{id:++this.clipSerial,value:this.rectangle?{rect:this.rectangle}:data}];}
 fillRect(x:number,y:number,width:number,height:number){this.emit(rect({id:this.id(),x:0,y:0,width:Math.abs(finite(width,'width')),height:Math.abs(finite(height,'height')),matrix:multiply2D(this.state.matrix,[1,0,0,1,width<0?x+width:x,height<0?y+height:y]),fill:rebasePaint(paint(this.state.fill),inverse2D(multiply2D(this.state.matrix,[1,0,0,1,width<0?x+width:x,height<0?y+height:y]))),opacity:this.state.alpha}));}
 strokeRect(x:number,y:number,width:number,height:number){const old={commands:this.commands,current:this.current,origin:this.origin,rectangle:this.rectangle,circle:this.circle};this.beginPath();this.rect(x,y,width,height);this.stroke();Object.assign(this,old);}
 drawImage(source:ImageNode['source'],x:number,y:number,width?:number,height?:number){this.emit(image({id:this.id(),source,x:0,y:0,width,height,matrix:multiply2D(this.state.matrix,[1,0,0,1,x,y]),opacity:this.state.alpha,fit:'stretch',sampling:this.state.smoothing?'linear':'nearest'}));}
 createLinearGradient(x0:number,y0:number,x1:number,y1:number){const matrix=this.getTransform();return new RecordedGradient2D(stops=>({...linearGradient([x0,y0],[x1,y1],stops),matrix} as Paint));}
 createRadialGradient(x0:number,y0:number,r0:number,x1:number,y1:number,r1:number){if(x0!==x1||y0!==y1||r0!==0||r1<=0)error2D('E_NATIVE_2D_UNSUPPORTED','Current radial profile supports a concentric zero-radius inner circle; two moving circles require a dedicated paint profile');const matrix=this.getTransform();return new RecordedGradient2D(stops=>({...radialGradient([x1,y1],[r1,r1],stops),matrix} as Paint));}
 /** Explicit asynchronous real measurement; never a Canvas-style synchronous stale width. */
 async measureText(value:string,font:CanvasText2DOptions={}){const service=this.options.services?.text,c=this.options.context;if(!service||!c)error2D('E_NATIVE_2D_SERVICE','Real text measurement requires an admitted existing text service and actual FrameContext');const result=await service.prepare(text({id:this.options.id+':measure',text:value,...font}),c,[this.options.width,this.options.height]);return{width:result.bounds.right-result.bounds.left,height:result.bounds.bottom-result.bounds.top,baseline:result.baseline,layout:result.layout,fontIdentities:result.fontIdentities};}
 async fillText(value:string,x:number,y:number,font:CanvasText2DOptions={}){const measured=await this.measureText(value,font),m=this.getTransform();this.emit(text({...font,id:this.id(),text:value,x:0,y:0,matrix:multiply2D(m,[1,0,0,1,x,y-measured.baseline]),fill:rebasePaint(paint(this.state.fill),inverse2D(multiply2D(m,[1,0,0,1,x,y-measured.baseline]))),opacity:this.state.alpha}));}
 clearRect(){error2D('E_NATIVE_2D_UNSUPPORTED','clearRect modifies destination pixels; this recording profile provides reset() for a new drawing and explicit existing compositor/mask APIs for pixel erasure');}
 reset(){this.nodes=[];this.destination=this.nodes;this.stack=[];this.serial=0;this.points=0;this.clipSerial=0;this.activeClip='';this.state={matrix:identity2D,fill:'#000000',stroke:'#000000',alpha:1,width:1,cap:'butt',join:'miter',miter:10,smoothing:true,clips:[]};this.beginPath();}
 snapshot():GroupNode{return group({id:this.options.id,children:this.nodes});}
}
export function canvas2D(options:CanvasRecorderOptions){return new CanvasRecorder2D(options);}
