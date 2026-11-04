// Acceptance-only independent F64 straight-colour blend equations. Never used
// by the production effects; PM/F32 input preparation is an explicit boundary.
import {toHalf,fromHalf} from '../../../../src/media/surface.ts';
import type {BlendName} from './types.ts';
export type Pixel=[number,number,number,number];
export interface Field {width:number;height:number;read(x:number,y:number):Pixel}
const f=Math.fround;
export function sourceField(width:number,height:number,pixels:Float32Array,straight=false):Field{return {width,height,read(x,y){const p=Array.from(pixels.subarray((y*width+x)*4,(y*width+x)*4+4)) as Pixel;return straight?[f(p[0]*p[3]),f(p[1]*p[3]),f(p[2]*p[3]),p[3]]:p;}};}
export function equation(mode:BlendName,b:number,s:number){switch(mode){
 case 'darken':return Math.min(b,s);
 case 'lighten':return Math.max(b,s);
 case 'difference':return Math.abs(b-s);
 case 'exclusion':return b+s-2*b*s;
 case 'overlay':return b<=.5?2*b*s:1-2*(1-b)*(1-s);
 case 'hardLight':return s<=.5?2*b*s:1-2*(1-b)*(1-s);
 case 'linearBurn':return b+s-1;
 case 'subtractBlend':return b-s;
 case 'linearLight':return b+2*s-1;
 case 'pinLight':return s<=.5?Math.min(b,2*s):Math.max(b,2*s-1);
}}
export function blend(mode:BlendName,source:Field,backdrop:Field,opacity=1,half=false,unrounded=false):Field{return {width:source.width,height:source.height,read(x,y){const s=source.read(x,y).map(v=>f(v*f(opacity))) as Pixel,b=backdrop.read(x,y),as=s[3],ab=b[3],out=[0,0,0,as+ab*(1-as)] as Pixel;for(let c=0;c<3;c++)out[c]=as===0||ab===0?s[c]+b[c]*(1-as):s[c]*(1-ab)+b[c]*(1-as)+as*ab*equation(mode,b[c]/ab,s[c]/as);return out.map(v=>unrounded?v:half?fromHalf(toHalf(f(v))):f(v)) as Pixel;}};}
export function pixels(a:Field){const p=new Float32Array(a.width*a.height*4);for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++)p.set(a.read(x,y),(y*a.width+x)*4);return p;}
export function sceneSources(width:number,height:number,frame:number):{source:Field;backdrop:Field}{const s=new Float32Array(width*height*4),b=new Float32Array(s.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const u=x/(width-1),v=y/(height-1),disk=(x-width*(.4+.06*frame))**2+(y-height*.5)**2<(height*.38)**2,a=disk?((x+frame*3)%17<9?.7:.35):0;b.set([1.2+u,.15+.4*v+.08*Math.cos(x/9),-.3+.15*u,1],(y*width+x)*4);s.set([(.25+.5*u)*a,(.7-.3*v)*a,(1.6+.2*v)*a,a],(y*width+x)*4);}return {source:sourceField(width,height,s),backdrop:sourceField(width,height,b)};}
export function sceneReference(width:number,height:number,frame:number,inputs=sceneSources(width,height,frame)){const s=inputs.source;let b=inputs.backdrop;b=blend('darken',s,b,.15);b=blend('lighten',s,b,.16);b=blend('difference',s,b,.08);b=blend('exclusion',s,b,.06);b=blend('overlay',s,b,.12+.02*frame);b=blend('hardLight',s,b,.12);b=blend('linearBurn',s,b,.025);b=blend('subtractBlend',s,b,.025);b=blend('linearLight',s,b,.025);return blend('pinLight',s,b,.12);}
