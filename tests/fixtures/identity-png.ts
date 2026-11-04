import {deflateSync} from 'node:zlib';
import type {Surface,LayerSpec} from '../../src/core/types.ts';

// Independent bit-at-a-time IEEE CRC oracle, rather than production's table.
export function chunk(tag:string,data:Buffer){const t=Buffer.from(tag),input=Buffer.concat([t,data]),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);input.copy(out,4);let c=0xffffffff;for(const value of input){c^=value;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;}out.writeUInt32BE((c^0xffffffff)>>>0,out.length-4);return out;}
export function rgbPng(width=9,height=7,options:{rgba?:boolean;opaque?:boolean;filter?:0|1|2|3|4;extra?:Buffer[];badDeflate?:boolean;badAlphaAt?:number}={}){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=options.rgba?6:2;
 const c=options.rgba?4:3,stride=width*c+1,rows=Buffer.alloc(height*stride);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*stride+1+x*c;rows[i]=x%256;rows[i+1]=y%256;rows[i+2]=(x*37+y*11)%256;if(c===4)rows[i+3]=options.badAlphaAt===y*width+x?254:options.opaque?255:(x*19+y*23)%256;}
 if(options.filter!==undefined){const raw=Buffer.from(rows),filter=options.filter;for(let y=0;y<height;y++){rows[y*stride]=filter;for(let i=0;i<width*c;i++){const a=i>=c?raw[y*stride+1+i-c]:0,b=y>0?raw[(y-1)*stride+1+i]:0,d=y>0&&i>=c?raw[(y-1)*stride+1+i-c]:0,p=a+b-d,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-d),prediction=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):pa<=pb&&pa<=pc?a:pb<=pc?b:d;rows[y*stride+1+i]=(raw[y*stride+1+i]-prediction)&255;}}}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...options.extra??[],chunk('IDAT',options.badDeflate?Buffer.from('invalid deflate'):deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
export function pngSurface(bytes:Buffer,width=9,height=7):Surface{return {kind:'surface',format:'png',width,height,dataUrl:'data:image/png;base64,'+bytes.toString('base64')};}
export const imageLayer:LayerSpec={id:'image',source:{$ref:'stage',port:'surface'},start:0,end:30};
