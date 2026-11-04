import {open} from 'node:fs/promises';
import type {Hdr10Metadata} from './encoding.ts';
import {EngineError} from '../core/errors.ts';
// Independently encoded metadata syntax; no codec implementation copied.
// AV1 HDR units: FFmpeg n6.1.1 libavcodec/av1dec.c export_metadata(), lines 911–939.
// https://raw.githubusercontent.com/FFmpeg/FFmpeg/n6.1.1/libavcodec/av1dec.c
// HEVC prefix-SEI: mastering_display_colour_volume (137), content_light_level_info (144).
const invalid=()=>new EngineError('E_MEDIA_HDR_BITSTREAM','Malformed bounded encoder output');
function master(m:Hdr10Metadata,av1:boolean){const b=Buffer.alloc(24),d=m.masteringDisplay,points=av1?[d.red,d.green,d.blue,d.white]:[d.green,d.blue,d.red,d.white];let at=0;for(const p of points)for(const n of p){b.writeUInt16BE(Math.round(n*(av1?65536:50000)),at);at+=2;}b.writeUInt32BE(Math.round(d.maxNits*(av1?256:10000)),16);b.writeUInt32BE(Math.round(d.minNits*(av1?16384:10000)),20);return b;}
function light(m:Hdr10Metadata){const b=Buffer.alloc(4);b.writeUInt16BE(m.maxCLL,0);b.writeUInt16BE(m.maxFALL,2);return b;}
export function hdrMetadataBytes(m:Hdr10Metadata,codec:'av1'|'hevc'){
 if(codec==='av1'){const obu=(type:number,payload:Buffer)=>{const p=Buffer.concat([Buffer.of(type),payload,Buffer.of(0x80)]);return Buffer.concat([Buffer.of(0x2a,p.length),p]);};return Buffer.concat([obu(1,light(m)),obu(2,master(m,true))]);}
 const rbsp=Buffer.concat([Buffer.of(137,24),master(m,false),Buffer.of(144,4),light(m),Buffer.of(0x80)]),escaped:number[]=[];let zeros=0;for(const v of rbsp){if(zeros>=2&&v<=3){escaped.push(3);zeros=0;}escaped.push(v);zeros=v===0?zeros+1:0;}return Buffer.concat([Buffer.of(0,0,0,1,0x4e,1),Buffer.from(escaped)]);
}
/** Streaming post-encode metadata adapter; timestamps/picture bytes are retained.
 * Hardware encoders in the pinned FFmpeg cannot receive raw-frame HDR side data.
 * This adapter writes actual bitstream metadata, followed by ordinary -c:v copy mux. */
export async function injectHdrMetadata(input:string,output:string,codec:'av1'|'hevc',metadata:Hdr10Metadata){
 const source=await open(input,'r'),target=await open(output,'wx');const size=(await source.stat()).size,extra=hdrMetadataBytes(metadata,codec);
 const read=async(at:number,n:number)=>{if(at<0||n<0||at+n>size)throw invalid();const b=Buffer.alloc(n);let done=0;while(done<n){const r=await source.read(b,done,n-done,at+done);if(!r.bytesRead)throw invalid();done+=r.bytesRead;}return b;};
 const write=async(b:Buffer)=>{let at=0;while(at<b.length){const r=await target.write(b,at,b.length-at);if(!r.bytesWritten)throw invalid();at+=r.bytesWritten;}};
 const copy=async(at:number,n:number)=>{while(n){const length=Math.min(n,1024*1024);await write(await read(at,length));at+=length;n-=length;}};
 try{if(codec==='hevc'){let insertion=-1,at=0,carry=Buffer.alloc(0);while(at<size&&insertion<0){const b=await read(at,Math.min(65536,size-at)),joined=Buffer.concat([carry,b]),base=at-carry.length;for(let n=0;n+5<joined.length;n++){const prefix=joined[n]===0&&joined[n+1]===0?(joined[n+2]===1?3:joined[n+2]===0&&joined[n+3]===1?4:0):0;if(prefix&&((joined[n+prefix]>>1)&63)<=31){insertion=base+n;break;}}carry=joined.subarray(Math.max(0,joined.length-7));at+=b.length;}if(insertion<0)throw invalid();await copy(0,insertion);await write(extra);await copy(insertion,size-insertion);return;}
 const header=await read(0,32);if(header.toString('ascii',0,4)!=='DKIF'||header.readUInt16LE(6)!==32||header.toString('ascii',8,12)!=='AV01')throw invalid();await write(header);let at=32;
 while(at<size){const frame=await read(at,12),length=frame.readUInt32LE(0),start=at+12;if(!length||start+length>size)throw invalid();let offset=0;
  while(offset<length){const h=await read(start+offset,Math.min(14,length-offset)),type=(h[0]>>3)&15;if(h[0]&0x81||!(h[0]&2))throw invalid();if(type!==1&&type!==2)break;let cursor=1+Number(!!(h[0]&4)),bytes=0,shift=0,terminated=false;for(let i=0;i<8&&cursor<h.length;i++){const v=h[cursor++];bytes+=(v&127)*2**shift;shift+=7;if(!(v&128)){terminated=true;break;}}if(!terminated||!Number.isSafeInteger(bytes)||offset+cursor+bytes>length)throw invalid();offset+=cursor+bytes;
  }
  frame.writeUInt32LE(length+extra.length,0);await write(frame);await copy(start,offset);await write(extra);await copy(start+offset,length-offset);at=start+length;
 }
 }finally{await source.close();await target.close();}
}
