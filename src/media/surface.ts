import {EngineError} from '../core/errors.ts';
import {privateSurfaceBytes,ownSurfaceBytes,stageSurfacesDeferred,rememberSurfaceBytes} from './surface-storage.ts';

export type PixelFormat='rgba8unorm'|'rgb10a2unorm'|'rgba16float'|'rgba32float';
export type AlphaMode='straight'|'premultiplied'|'opaque';
export interface ColorEncoding {
  primaries:'rec709'|'rec2020'|'display-p3'|'acescg';whitePoint:'D65'|'D60';
  transfer:'linear'|'srgb'|'rec709'|'pq'|'hlg';reference:'scene'|'display';
  range:'full';referenceWhiteNits:number;peakNits?:number;hlgSystemGamma?:number;
}
/** Value-owned, little-endian, interleaved RGBA. No realm-local handle crosses a Stage. */
export interface ProfessionalSurface {
  kind:'surface';schemaVersion:'frameweave.surface/2';format:PixelFormat;
  width:number;height:number;rowStride:number;bitDepth:8|10|16|32;
  numericRange:'unorm'|'extended';color:ColorEncoding;alpha:AlphaMode;
  storage:{location:'cpu-inline';encoding:'base64';byteOrder:'little-endian';ownership:'value';lifetime:'frame';data:string};
}
export const linear709:ColorEncoding={primaries:'rec709',whitePoint:'D65',transfer:'linear',reference:'scene',range:'full',referenceWhiteNits:100};
export const acescg:ColorEncoding={...linear709,primaries:'acescg',whitePoint:'D60'};
export const linear2020:ColorEncoding={...linear709,primaries:'rec2020'};
export const srgb:ColorEncoding={...linear709,transfer:'srgb',reference:'display'};
export const pq2020:ColorEncoding={...linear2020,transfer:'pq',reference:'display',peakNits:1000};
export const hlg2020:ColorEncoding={...pq2020,transfer:'hlg',hlgSystemGamma:1.2};
const specs={rgba8unorm:{bytes:4,bits:8,range:'unorm'},rgb10a2unorm:{bytes:4,bits:10,range:'unorm'},rgba16float:{bytes:8,bits:16,range:'extended'},rgba32float:{bytes:16,bits:32,range:'extended'}} as const;
const fail=(code:string,message:string):never=>{throw new EngineError(code,message);};
export function assertColor(c:ColorEncoding):void {
  if(!c||Object.keys(c).some(k=>!['primaries','whitePoint','transfer','reference','range','referenceWhiteNits','peakNits','hlgSystemGamma'].includes(k)))fail('E_MEDIA_COLOR','Unknown color metadata field');
  if(!c||!['rec709','rec2020','display-p3','acescg'].includes(c.primaries)||c.whitePoint!==(c.primaries==='acescg'?'D60':'D65')||!['linear','srgb','rec709','pq','hlg'].includes(c.transfer)||!['scene','display'].includes(c.reference)||c.range!=='full'||!Number.isFinite(c.referenceWhiteNits)||c.referenceWhiteNits<=0)fail('E_MEDIA_COLOR','Explicit supported primaries, white point, transfer, reference, full range and positive reference white are required');
  if(['pq','hlg'].includes(c.transfer)&&(c.reference!=='display'||c.peakNits!==undefined&&(!Number.isFinite(c.peakNits)||c.peakNits<100||c.peakNits>10000)))fail('E_MEDIA_COLOR','PQ/HLG require display reference and valid declared peak luminance');
  if(c.transfer==='hlg'&&!Number.isFinite(c.peakNits))fail('E_MEDIA_COLOR','HLG OOTF requires an explicit display peak; PQ is absolute without one');
  if(c.transfer==='hlg'&&c.primaries!=='rec2020')fail('E_MEDIA_COLOR','This HLG OOTF adapter requires Rec.2020 primaries');
  if(c.transfer==='hlg'&&(!Number.isFinite(c.hlgSystemGamma)||c.hlgSystemGamma!<1||c.hlgSystemGamma!>2))fail('E_MEDIA_COLOR','Display HLG requires explicit system gamma 1..2');
}
export function isProfessionalSurface(value:unknown):value is ProfessionalSurface {return !!value&&typeof value==='object'&&(value as ProfessionalSurface).kind==='surface'&&(value as ProfessionalSurface).schemaVersion==='frameweave.surface/2';}
export function assertProfessionalSurface(s:ProfessionalSurface):void {
  if(!isProfessionalSurface(s))fail('E_MEDIA_VERSION','Expected frameweave.surface/2');
  if(Object.keys(s).some(k=>!['kind','schemaVersion','format','width','height','rowStride','bitDepth','numericRange','color','alpha','storage'].includes(k)))fail('E_MEDIA_VERSION','Unknown Surface v2 fields');
  const spec=specs[s.format];if(!spec)fail('E_MEDIA_FORMAT',`Unsupported pixel format: ${s.format}`);
  if(!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<1||s.height<1||s.width>16384||s.height>16384||!Number.isInteger(s.rowStride)||s.rowStride<s.width*spec.bytes||s.rowStride%spec.bytes||s.rowStride*s.height>512*1024*1024)fail('E_MEDIA_LAYOUT','Invalid dimensions/stride or surface exceeds 512 MiB');
  if(s.bitDepth!==spec.bits||s.numericRange!==spec.range)fail('E_MEDIA_FORMAT','Pixel format and numeric description disagree');
  assertColor(s.color);if(!['straight','premultiplied','opaque'].includes(s.alpha))fail('E_MEDIA_ALPHA','Explicit alpha mode required');
  const p=s.storage;if(!p||p.location!=='cpu-inline'||p.encoding!=='base64'||p.byteOrder!=='little-endian'||p.ownership!=='value'||p.lifetime!=='frame')fail('E_MEDIA_TRANSPORT','Only value-owned CPU base64 transport is implemented; GPU/file handles require an explicit adapter');
  const n=s.rowStride*s.height,bytes=privateSurfaceBytes(s);if(bytes){if(bytes.length!==n)fail('E_MEDIA_BYTES','Surface byte length is invalid');return;}
  const padding=(3-n%3)%3;if(typeof p.data!=='string'||p.data.length!==Math.ceil(n/3)*4||/[^A-Za-z0-9+/]/.test(p.data.slice(0,p.data.length-padding))||p.data.slice(p.data.length-padding)!=='='.repeat(padding))fail('E_MEDIA_BYTES','Surface byte length or base64 encoding is invalid');
}
export function encodeBytes(bytes:Uint8Array):string {
  const buffer=(globalThis as any).Buffer;if(buffer)return buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).toString('base64');
  let str='';for(let i=0;i<bytes.length;i+=32768)str+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(str);
}
export function decodeBytes(text:string):Uint8Array {
  const buffer=(globalThis as any).Buffer;if(buffer)return new Uint8Array(buffer.from(text,'base64'));
  const str=atob(text),out=new Uint8Array(str.length);for(let i=0;i<str.length;i++)out[i]=str.charCodeAt(i);return out;
}
/** IEEE 754 binary16 round-to-nearest, ties-to-even, including subnormals. */
export function toHalf(value:number):number {
  if(!Number.isFinite(value)||Math.abs(value)>65504)fail('E_MEDIA_RANGE','RGBA16F requires finite values within +/-65504');
  const sign=value<0||Object.is(value,-0)?0x8000:0,x=Math.abs(value);
  if(x===0)return sign;
  const round=(v:number)=>{const f=Math.floor(v),r=v-f;return r>.5||r===.5&&f%2?f+1:f;};
  if(x<2**-14)return sign|round(x*2**24);
  const exp=Math.floor(Math.log2(x)),mant=round((x/2**exp-1)*1024);
  return sign|((exp+15)<<10)+mant;
}
export function fromHalf(h:number):number {const sign=h&0x8000?-1:1,e=h>>10&31,m=h&1023;return sign*(e===0?m*2**-24:e===31?m?NaN:Infinity:(1+m/1024)*2**(e-15));}
let halfTable:Float32Array|undefined;
function halfLookup(){if(!halfTable){halfTable=new Float32Array(65536);for(let i=0;i<65536;i++)halfTable[i]=fromHalf(i);}return halfTable;}
function float32Half(bits:number):number {
  const sign=bits>>>16&0x8000,e=(bits>>>23&255)-127,m=bits&0x7fffff;if(e < -25)return sign;
  if(e < -14){const shift=-e-1,v=m|0x800000,h=v>>>shift,remainder=v&((1<<shift)-1),tie=1<<(shift-1);return sign|(h+(remainder>tie||remainder===tie&&(h&1)?1:0));}
  const h=(e+15<<10)|(m>>>13),r=m&8191;return sign|(h+(r>4096||r===4096&&(h&1)?1:0));
}
const littleEndian=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
export function surfaceFromPixels(width:number,height:number,pixels:ArrayLike<number>,options:{format?:PixelFormat;color:ColorEncoding;alpha?:AlphaMode;rowStride?:number;deferBase64?:boolean}):ProfessionalSurface {
  const format=options.format??'rgba16float',spec=specs[format];if(!spec)fail('E_MEDIA_FORMAT',`Unsupported ${format}`);
  if(pixels.length!==width*height*4)fail('E_MEDIA_BYTES','Expected interleaved RGBA samples');
  const rowStride=options.rowStride??width*spec.bytes;
  const s:ProfessionalSurface={kind:'surface',schemaVersion:'frameweave.surface/2',format,width,height,rowStride,bitDepth:spec.bits,numericRange:spec.range,color:{...options.color},alpha:options.alpha??'straight',storage:{location:'cpu-inline',encoding:'base64',byteOrder:'little-endian',ownership:'value',lifetime:'frame',data:''}};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!Number.isSafeInteger(rowStride*height)||rowStride<width*spec.bytes||rowStride%spec.bytes||rowStride*height>512*1024*1024)fail('E_MEDIA_LAYOUT','Invalid surface allocation');
  const bytes=new Uint8Array(rowStride*height),view=new DataView(bytes.buffer);
  if(littleEndian&&pixels instanceof Float32Array&&rowStride===width*spec.bytes&&(format==='rgba16float'||format==='rgba32float')){
    const bits=new Uint32Array(pixels.buffer,pixels.byteOffset,pixels.length),out16=format==='rgba16float'?new Uint16Array(bytes.buffer):undefined;
    for(let i=0;i<pixels.length;i++){const v=pixels[i];if(!Number.isFinite(v)||i%4===3&&(v<0||v>1))fail('E_MEDIA_RANGE','Non-finite RGB or alpha outside [0,1]');if(s.alpha==='opaque'&&i%4===3&&v!==1)fail('E_MEDIA_ALPHA','Opaque surfaces require alpha 1');if(out16){if(Math.abs(v)>65504)fail('E_MEDIA_RANGE','RGBA16F requires finite values within +/-65504');out16[i]=float32Half(bits[i]);}}
    if(!out16)bytes.set(new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength));
    if(options.deferBase64??stageSurfacesDeferred())ownSurfaceBytes(s,bytes,encodeBytes);else s.storage.data=encodeBytes(bytes);assertProfessionalSurface(s);return s;
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,offset=y*rowStride+x*spec.bytes;
    if(format==='rgb10a2unorm'){let packed=0;for(let c=0;c<4;c++){const v=pixels[i+c];if(!Number.isFinite(v)||v<0||v>1)fail('E_MEDIA_RANGE','UNORM samples require [0,1]');if(s.alpha==='opaque'&&c===3&&v!==1)fail('E_MEDIA_ALPHA','Opaque surfaces require alpha 1');packed|=Math.round(v*(c===3?3:1023))<<(c*10);}view.setUint32(offset,packed,true);continue;}
    for(let c=0;c<4;c++){const v=pixels[i+c];if(!Number.isFinite(v)||c===3&&(v<0||v>1))fail('E_MEDIA_RANGE','Non-finite RGB or alpha outside [0,1]');if(s.alpha==='opaque'&&c===3&&v!==1)fail('E_MEDIA_ALPHA','Opaque surfaces require alpha 1');
      if(format==='rgba16float')view.setUint16(offset+c*2,toHalf(v),true);else if(format==='rgba32float'){view.setFloat32(offset+c*4,v,true);if(!Number.isFinite(view.getFloat32(offset+c*4,true)))fail('E_MEDIA_RANGE','Float32 overflow');}else{if(v<0||v>1)fail('E_MEDIA_RANGE','UNORM samples require [0,1]');bytes[offset+c]=Math.round(v*255);}}
  }
  if(options.deferBase64??stageSurfacesDeferred())ownSurfaceBytes(s,bytes,encodeBytes);else s.storage.data=encodeBytes(bytes);assertProfessionalSurface(s);return s;
}
export function pixelsFromSurface(s:ProfessionalSurface):Float32Array {
  assertProfessionalSurface(s);const known=privateSurfaceBytes(s),bytes=known??decodeBytes(s.storage.data);if(bytes.length!==s.rowStride*s.height)fail('E_MEDIA_BYTES','Decoded length mismatch');if(!known)rememberSurfaceBytes(s,bytes);
  if(littleEndian&&s.rowStride===s.width*specs[s.format].bytes&&bytes.byteOffset%(s.format==='rgba16float'?2:4)===0&&(s.format==='rgba16float'||s.format==='rgba32float')){
    const n=s.width*s.height*4,p=new Float32Array(n),table=s.format==='rgba16float'?halfLookup():undefined;
    if(table){const h=new Uint16Array(bytes.buffer,bytes.byteOffset,n);for(let i=0;i<n;i++)p[i]=table[h[i]];}else p.set(new Float32Array(bytes.buffer,bytes.byteOffset,n));
    for(let i=0;i<n;i++)if(!Number.isFinite(p[i])||i%4===3&&(p[i]<0||p[i]>1||s.alpha==='opaque'&&p[i]!==1))fail('E_MEDIA_RANGE','Invalid finite samples/alpha');return p;
  }
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out=new Float32Array(s.width*s.height*4),bpp=specs[s.format].bytes;
  for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const o=y*s.rowStride+x*bpp,i=(y*s.width+x)*4,packed=s.format==='rgb10a2unorm'?view.getUint32(o,true):0;
    for(let c=0;c<4;c++){const v=s.format==='rgba16float'?fromHalf(view.getUint16(o+c*2,true)):s.format==='rgba32float'?view.getFloat32(o+c*4,true):s.format==='rgba8unorm'?bytes[o+c]/255:c===3?(packed>>>30)/3:(packed>>>(c*10)&1023)/1023;
      if(!Number.isFinite(v)||c===3&&(v<0||v>1)||s.alpha==='opaque'&&c===3&&v!==1)fail('E_MEDIA_RANGE','Invalid finite samples/alpha');out[i+c]=v;}}
  return out;
}
