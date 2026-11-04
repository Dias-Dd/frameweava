import type {PathData,MaskData,Coordinates2D} from './types.ts';
import {validatePathData,validateMaskData,coordinates2D} from './validate.ts';
import {verifyResource} from './resources.ts';
import {fail,LIMITS} from './check.ts';

/** SVG-compatible absolute commands; numeric values were validated, no string parser/injection path. */
export function pathCommands(input:PathData):string {
  const data=validatePathData(input);
  return data.commands.map(c=>{
    if(c.op==='Z')return 'Z';const p=`${c.point.x} ${c.point.y}`;
    if(c.op==='Q')return `Q ${c.control.x} ${c.control.y} ${p}`;
    if(c.op==='C')return `C ${c.control1.x} ${c.control1.y} ${c.control2.x} ${c.control2.y} ${p}`;
    return `${c.op} ${p}`;
  }).join(' ');
}
/** Converter owns no canvas/global scene. The receiving module chooses its own rendering backend. */
export function pathToMask(input:PathData,id:string):MaskData {
  const path=validatePathData(input);return validateMaskData({schema:'frameweave.mask',version:1,id,kind:'vector',coordinates:path.coordinates,path,sampling:'linear',boundary:'zero',feather:{radius:0,unit:'px'}});
}
/** Linear coverage: alpha directly, or linear-light Rec.709 luminance × straight alpha. */
export async function decodeRasterMask(input:MaskData,bytes:Uint8Array):Promise<Float32Array> {
  const mask=validateMaskData(input);if(mask.kind!=='raster')fail('$.kind','raster mask required');
  if(bytes.byteLength!==mask.source.bytes)fail('$.source.bytes','RGBA byte length mismatch','E_GRAPHICS_INTEGRITY');
  bytes=new Uint8Array(bytes);await verifyResource(mask.source,bytes);
  const result=new Float32Array(mask.coordinates.width*mask.coordinates.height),linear=(n:number)=>n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;
  for(let i=0;i<result.length;i++){const p=i*4,a=bytes[p+3]/255;result[i]=mask.channel==='alpha'?a:(.2126*linear(bytes[p]/255)+.7152*linear(bytes[p+1]/255)+.0722*linear(bytes[p+2]/255))*a;}
  return result;
}
/** Pixel-coordinate sampling; centers are (i+.5,j+.5). Explicit zero or clamp at every tap. */
export function sampleCoverage(values:Float32Array,width:number,height:number,x:number,y:number,sampling:MaskData['sampling'],boundary:MaskData['boundary']):number {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>LIMITS.pixels||values.length!==width*height||!Number.isFinite(x)||!Number.isFinite(y)||!['nearest','linear'].includes(sampling)||!['zero','clamp'].includes(boundary))fail('sample','invalid coverage buffer/query');
  const at=(ix:number,iy:number)=>{if(boundary==='zero'&&(ix<0||iy<0||ix>=width||iy>=height))return 0;const v=values[Math.min(height-1,Math.max(0,iy))*width+Math.min(width-1,Math.max(0,ix))];if(!Number.isFinite(v)||v<0||v>1)fail('sample','coverage must be finite in [0,1]');return v;};
  if(sampling==='nearest')return at(Math.floor(x),Math.floor(y));
  const ix=Math.floor(x-.5),iy=Math.floor(y-.5),u=x-.5-ix,v=y-.5-iy;
  return at(ix,iy)*(1-u)*(1-v)+at(ix+1,iy)*u*(1-v)+at(ix,iy+1)*(1-u)*v+at(ix+1,iy+1)*u*v;
}
/** Coordinate conversion is explicit; display extent and space identity must be preserved. */
export function convertPathUnits(input:PathData,unit:Coordinates2D['unit']):PathData {
  const path=validatePathData(input),target=coordinates2D({...path.coordinates,unit}),from=path.coordinates;
  if(from.unit===unit)return path;
  const sx=unit==='px'?from.width:1/from.width,sy=unit==='px'?from.height:1/from.height;
  return validatePathData({...path,coordinates:target,commands:path.commands.map(c=>{
    const move=(p:{id:string;x:number;y:number})=>({...p,x:p.x*sx,y:p.y*sy});
    if(c.op==='Z')return c;if(c.op==='Q')return {...c,point:move(c.point),control:move(c.control)};
    if(c.op==='C')return {...c,point:move(c.point),control1:move(c.control1),control2:move(c.control2)};
    return {...c,point:move(c.point)};
  })});
}
