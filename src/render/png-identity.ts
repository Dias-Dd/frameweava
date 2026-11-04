import type {LayerSpec,Surface} from '../core/types.ts';
import * as zlib from 'node:zlib';

// Bounded binary admission, not a color renderer. Unknown inputs keep the
// original browser normalization path. Some browsers tolerate bad IDAT
// after decode(), so the bounded deflate/scanline check is also mandatory.
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let n=0;n<8;n++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc(bytes:Buffer,start:number,end:number){const native=(zlib as unknown as {crc32?:(v:Buffer)=>number}).crc32;if(native)return native(bytes.subarray(start,end));let c=0xffffffff;for(let i=start;i<end;i++)c=crcTable[(c^bytes[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function opaqueSrgbPng(bytes:Buffer,width:number,height:number){
 if(bytes.length<57||bytes.length>64*1024**2||!bytes.subarray(0,8).equals(signature))return false;
 let at=8,header=false,data=false,ended=false,chunks=0;const channels=4,idat:Buffer[]=[];
 while(at+12<=bytes.length){if(++chunks>4096)return false;const n=bytes.readUInt32BE(at),end=at+12+n;if(end>bytes.length)return false;const tag=bytes.toString('ascii',at+4,at+8);if(bytes.readUInt32BE(end-4)!==crc(bytes,at+4,end-4))return false;
  if(tag==='IHDR'){if(header||at!==8||n!==13||bytes.readUInt32BE(at+8)!==width||bytes.readUInt32BE(at+12)!==height||bytes[at+16]!==8||bytes[at+17]!==6||bytes[at+18]!==0||bytes[at+19]!==0||bytes[at+20]!==0)return false;header=true;}
  else if(tag==='IDAT'){if(!header||ended)return false;data=true;idat.push(bytes.subarray(at+8,end-4));}
  else if(tag==='IEND'){if(!data||n!==0||end!==bytes.length)return false;ended=true;}
  else return false; // Preserve legacy Canvas RGBA8 encoding and metadata policy:
  // no tRNS, ICC/gamma/sRGB tags, animation or unknown chunks are carried through.
  at=end;
 }
 if(!ended||at!==bytes.length)return false;
 try{const stride=width*channels+1,expected=stride*height;if(!Number.isSafeInteger(expected)||expected>64*1024**2)return false;const compressed=idat.length===1?idat[0]:Buffer.concat(idat);
  // Negative-only early exit for common transparent canvases: the first alpha
  // has no predictors in any PNG filter. A partial prefix can NEVER admit an
  // image; opacity/integrity still requires the complete validation below.
  if(channels===4)try{const n=Math.min(65536,expected+1),prefix=zlib.inflateSync(compressed.subarray(0,128),{finishFlush:zlib.constants.Z_SYNC_FLUSH,maxOutputLength:n,chunkSize:Math.max(64,n)});if(prefix.length>=5&&prefix[4]!==255)return false;}catch{/* Inconclusive prefix: perform the full proof. */}
  const decoded=zlib.inflateSync(compressed,{maxOutputLength:expected+1,chunkSize:Math.max(64,expected+1),info:true}) as unknown as {buffer:Buffer;engine:{bytesWritten:number}};if(decoded.engine.bytesWritten!==compressed.length||decoded.buffer.length!==expected)return false;
  for(let y=0;y<height;y++){const row=y*stride,filter=decoded.buffer[row];if(filter>4)return false;if(channels===4){
   // Induction: all previous alpha samples were255. PNG predictors reference
   // only alpha neighbors (bpp4), so RGB unfiltering is unnecessary. This
   // verifies every alpha byte; it is not a metadata/first-pixel opacity hint.
   const first=filter===0||filter===1?255:filter===2||filter===4?(y===0?255:0):y===0?255:128,rest=filter===0?255:filter===2?(y===0?255:0):filter===3&&y===0?128:0;
   if(decoded.buffer[row+4]!==first)return false;for(let at=row+8,end=row+stride;at<end;at+=4)if(decoded.buffer[at]!==rest)return false;
  }}
 }
 catch{return false;}
 return true;
}
export interface IdentityPng {readonly key:string;readonly bytes:Buffer;readonly width:number;readonly height:number}
const equal=(n:unknown,value:number)=>n===undefined||n===value;
/** Proof at the existing Canvas boundary: untagged RGBA8 with every alpha255.
 * RGB24 and metadata normalize through the old path to preserve codec semantics. */
export function identityPng(width:number,height:number,background:string,layers:LayerSpec[],surfaces:Record<string,Surface>,options?:{width:number;height:number;sizes:Record<string,{width:number;height:number}>;displayPreview?:boolean}):IdentityPng|undefined {
 if(layers.length!==1||options?.displayPreview&&background&&background!=='transparent')return;
 const l=layers[0];if(!l.source||l.parent!==undefined||l.mask||l.isolation==='isolated'||l.effects?.length||l.blend!==undefined&&l.blend!=='source-over')return;
 if(![l.x,l.y,l.rotation,l.originX,l.originY].every(v=>equal(v,0))||![l.opacity,l.scale,l.scaleX,l.scaleY].every(v=>equal(v,1)))return;
 const key=l.source.$ref+':'+l.source.port,s=surfaces[key],outW=options?.width??width,outH=options?.height??height,size=options?.sizes[key]??s;
 if(!s||s.format!=='png'||!size||size.width!==width||size.height!==height||s.width!==outW||s.height!==outH||![width,height,outW,outH].every(n=>Number.isSafeInteger(n)&&n>0))return;
 // Power-of-two CTMs map source pixel centers exactly, including normal 4K
 // 1080p/540p proxies. Arbitrary resampling remains in the Canvas compositor.
 const ratio=outW/width;if(ratio!==outH/height||!Number.isInteger(Math.log2(ratio))||ratio<1/64||ratio>64)return;
 const prefix='data:image/png;base64,';if(typeof s.dataUrl!=='string'||!s.dataUrl.startsWith(prefix)||s.dataUrl.length>90*1024**2)return;
 const encoded=s.dataUrl.slice(prefix.length);if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)||encoded.length%4)return;
 const bytes=Buffer.from(encoded,'base64');if(!opaqueSrgbPng(bytes,outW,outH))return;
 return {key,bytes,width:outW,height:outH};
}
