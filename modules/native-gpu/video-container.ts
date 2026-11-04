import {open} from 'node:fs/promises';
import {EngineError} from '../../src/core/errors.ts';
const invalid=()=>new EngineError('E_NATIVE_VIDEO_CONTAINER','Hardware video v1 requires a self-contained MPEG-4 movie; external data references are forbidden');
/** Validate only container metadata. Never read mdat pixels or follow a URL.
 * Media Foundation receives a private verified local snapshot after this gate. */
export async function assertSelfContainedMp4(file:string,maxMetadataBytes=64*1024**2){
 const handle=await open(file,'r');
 try{
  const size=(await handle.stat()).size;let at=0,moov:Buffer|undefined,brand=false;
  while(at<size){const h=Buffer.alloc(16),n=await handle.read(h,0,Math.min(16,size-at),at);if(n.bytesRead<8)throw invalid();let length=h.readUInt32BE(),header=8;const type=h.toString('ascii',4,8);if(length===1){if(n.bytesRead<16)throw invalid();const big=h.readBigUInt64BE(8);if(big>BigInt(Number.MAX_SAFE_INTEGER))throw invalid();length=Number(big);header=16;}if(length===0)length=size-at;if(length<header||at+length>size)throw invalid();
   if(type==='ftyp')brand=true;
   if(type==='moov'){if(moov||!Number.isSafeInteger(maxMetadataBytes)||maxMetadataBytes<1||length>maxMetadataBytes)throw invalid();moov=Buffer.alloc(length-header);let done=0;while(done<moov.length){const r=await handle.read(moov,done,moov.length-done,at+header+done);if(!r.bytesRead)throw invalid();done+=r.bytesRead;}}
   at+=length;
  }
  if(!brand||!moov)throw invalid();let references=0;
  const pending=[moov];while(pending.length){const bytes=pending.pop()!;for(let n=0;n<bytes.length;){if(n+8>bytes.length)throw invalid();const size=bytes.readUInt32BE(n),type=bytes.toString('ascii',n+4,n+8);if(size<8||n+size>bytes.length)throw invalid();const b=bytes.subarray(n+8,n+size);
    if(['trak','mdia','minf','dinf'].includes(type))pending.push(b);
    if(type==='dref'){if(b.length<8||b.readUInt32BE(0)!==0)throw invalid();let offset=8;const count=b.readUInt32BE(4);if(count>(b.length-offset)/12)throw invalid();for(let i=0;i<count;i++){if(offset+12>b.length||b.readUInt32BE(offset)!==12||b.toString('ascii',offset+4,offset+8)!=='url '||b.readUInt32BE(offset+8)!==1)throw invalid();offset+=12;references++;}if(offset!==b.length)throw invalid();}
    n+=size;
   }}
  if(!references)throw invalid();
 }finally{await handle.close();}
}
