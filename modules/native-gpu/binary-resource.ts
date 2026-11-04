import {EngineError} from '../../src/core/errors.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
/** All lengths are bytes; id names an existing declared Resource, never a path. */
export interface NativeRawBufferResource {version:1;id:string;profile:'raw-bytes-v1';bytes:number;byteOffset?:number;byteLength?:number}
export interface NativeDeepBufferResource {version:1;id:string;profile:'deep-exr-indexed-v1';bytes:number;part:number;dataWindow:readonly[number,number,number,number];displayWindow:readonly[number,number,number,number];samples:number;channels:readonly{name:string;type:'half'|'float'|'uint'}[];maxDecodedBytes:number;maxSamplesPerPixel:number;maxParts:number;byteOffset?:0;byteLength?:number;surface?:{r:string;g:string;b:string;a:string;z:string;zBack?:string;alpha:'straight'|'premultiplied';color:import('../../src/media/surface.ts').ColorEncoding}}
export type NativeBufferResource=NativeDeepBufferResource|NativeRawBufferResource|{version:1;id:string;bytes:number;profile:'nanovdb-float-indexed-v1';byteOffset?:0;byteLength?:number;gridClass:'level-set'|'fog-volume';maxRootTiles:number};
export interface NativeResourceBuffer {readonly version:1;readonly buffer:GpuDataBuffer;readonly sourceBytes:number;readonly byteOffset:number;readonly byteLength:number;readonly storageByteLength:number;readonly access:'read-only'}
/** Private verified lease descriptor: only the Node admission adapter may create it. */
export interface NativeBinaryImport {version:1;profile:'raw-bytes-v1';file:string;bytes:number;byteOffset:number;byteLength:number}
export function binaryResource(source:NativeBufferResource){
 const bad=()=>{throw new EngineError('E_NATIVE_BINARY_SCHEMA','Expected declared raw-bytes-v1 or fixed NanoVDB indexed Resource, exact source length and valid range/budget');};
 if(!source||typeof source!=='object'||Array.isArray(source)||source.version!==1||typeof source.id!=='string'||!source.id.length||source.id.length>4096||source.id.includes('\0')||!Number.isSafeInteger(source.bytes)||source.bytes<1)bad();
 if(source.profile==='deep-exr-indexed-v1'){deepBufferLayout(source);return Object.freeze({...source,byteOffset:0,byteLength:source.bytes});}
 if(source.profile==='nanovdb-float-indexed-v1'){if(Object.keys(source).some(k=>!['version','id','bytes','profile','gridClass','maxRootTiles','byteOffset','byteLength'].includes(k))||!['level-set','fog-volume'].includes(source.gridClass)||!Number.isSafeInteger(source.maxRootTiles)||source.maxRootTiles<1||source.byteOffset!==undefined&&source.byteOffset!==0||source.byteLength!==undefined&&source.byteLength!==source.bytes)bad();return Object.freeze({...source,byteOffset:0,byteLength:source.bytes});}
 if(source.profile!=='raw-bytes-v1'||Object.keys(source).some(k=>!['version','id','profile','bytes','byteOffset','byteLength'].includes(k)))bad();
 const byteOffset=source.byteOffset??0,byteLength=source.byteLength??source.bytes-byteOffset;
 if(!Number.isSafeInteger(byteOffset)||!Number.isSafeInteger(byteLength)||byteOffset<0||byteLength<1||byteOffset>source.bytes-byteLength||!Number.isSafeInteger(Math.ceil(byteLength/4)*4))bad();
 return Object.freeze({...source,byteOffset,byteLength});
}

/** Budget ceiling is a caller choice, not a permanent format/device maximum. */
export function nanoIndexLayout(bytes:number,maxRootTiles:number){
 if(!Number.isSafeInteger(bytes)||bytes<800||!Number.isSafeInteger(maxRootTiles)||maxRootTiles<1)throw new EngineError('E_NANOVDB_BUDGET','Positive exact grid bytes and explicit root-tile budget required');
 const prefix=(BigInt(bytes)+31n)/32n*32n;let capacity=1n;while(capacity<BigInt(maxRootTiles)*2n)capacity*=2n;const storage=prefix+32n+16n*capacity;
 if(storage>0xffffffffn)throw new EngineError('E_NANOVDB_ADDRESS','Indexed v1 uses u32 byte addresses; split the asset or choose a future larger-address profile explicitly');
 return {indexOffset:Number(prefix),capacity:Number(capacity),storageByteLength:Number(storage),indexReservedBytes:Number(32n+16n*capacity)};
}

/** Pure layout arithmetic inside the existing SDK closure. Optional codec runs only in Core. */
export function deepBufferLayout(s:NativeDeepBufferResource){
 const fail=():never=>{throw new EngineError('E_DEEP_SCHEMA','Exact declared deep part/windows/sample types and positive decode budgets required');};
 if(Object.keys(s).some(k=>!['version','id','profile','bytes','part','dataWindow','displayWindow','samples','channels','maxDecodedBytes','maxSamplesPerPixel','maxParts','byteOffset','byteLength','surface'].includes(k))||s.byteOffset!==undefined&&s.byteOffset!==0||s.byteLength!==undefined&&s.byteLength!==s.bytes||!Number.isSafeInteger(s.part)||s.part<0||!Number.isSafeInteger(s.samples)||s.samples<0||![s.maxDecodedBytes,s.maxSamplesPerPixel,s.maxParts].every(v=>Number.isSafeInteger(v)&&v>0))fail();
 const window=(v:readonly number[])=>{if(!Array.isArray(v)||v.length!==4||v.some(n=>!Number.isInteger(n)||n<-2147483648||n>2147483647)||v[2]<v[0]||v[3]<v[1])fail();return{width:v[2]-v[0]+1,height:v[3]-v[1]+1};};const data=window(s.dataWindow),display=window(s.displayWindow);
 if(!Array.isArray(s.channels)||!s.channels.length||s.channels.some(c=>!c||typeof c.name!=='string'||!c.name||c.name.includes('\0')||Object.keys(c).some(k=>!['name','type'].includes(k))||!['half','float','uint'].includes(c.type)))fail();if(new Set(s.channels.map(c=>c.name)).size!==s.channels.length)fail();
 if(s.surface){const v=s.surface;if(Object.keys(v).some(k=>!['r','g','b','a','z','zBack','alpha','color'].includes(k))||!['straight','premultiplied'].includes(v.alpha)||![v.r,v.g,v.b,v.a,v.z,...v.zBack?[v.zBack]:[]].every(name=>s.channels.some(c=>c.name===name&&c.type!=='uint')))fail();}
 let at=128n;const pixels=BigInt(data.width)*BigInt(data.height),counts=at;at+=pixels*4n;const offsets=at;at+=(pixels+1n)*4n;const order=at;at+=BigInt(s.samples)*4n;const channels=s.channels.map(c=>{const offset=at;at+=(BigInt(s.samples)*BigInt(c.type==='half'?2:4)+3n)/4n*4n;return{...c,offset:Number(offset),bytes:s.samples*(c.type==='half'?2:4)};});
 if(at>0xffffffffn||pixels>0xffffffffn||display.width>0xffffffff||display.height>0xffffffff)throw new EngineError('E_DEEP_ADDRESS','Deep GPU v1 uses u32 byte addresses; split the asset or choose an explicit future larger-address profile');
 return{...data,displayWidth:display.width,displayHeight:display.height,pixels:Number(pixels),counts:Number(counts),offsets:Number(offsets),order:Number(order),channels,storageByteLength:Number(at)};
}
