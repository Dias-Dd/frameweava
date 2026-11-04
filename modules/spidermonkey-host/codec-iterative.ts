/** Existing wire tags, bounded by caller bytes and u32 framing. Containers use
 * an explicit stack, without fixed nesting/node counts or JS argument spreading. */
const WIRE_BYTES=0xffffffff;
function budget(n:number){if(!Number.isSafeInteger(n)||n<1||n>WIRE_BYTES)throw Error('Host byte budget exceeds u32 framing');return n;}
export function encodeHostValue(value:unknown,maxBytes=WIRE_BYTES):Uint8Array{
 const limit=budget(maxBytes);let bytes=new Uint8Array(Math.min(4096,limit)),view=new DataView(bytes.buffer),at=0;
 const ancestors=new Set<object>(),stack:{value:object;keys?:string[];index:number;length:number}[]=[];
 const room=(n:number)=>{if(!Number.isSafeInteger(n)||n<0||at+n>limit)throw Error('Host packet exceeds configured byte budget');if(at+n>bytes.length){const next=new Uint8Array(Math.min(limit,Math.max(at+n,bytes.length*2)));next.set(bytes);bytes=next;view=new DataView(bytes.buffer);}};
 const byte=(n:number)=>{room(1);bytes[at++]=n;},u32=(n:number)=>{if(!Number.isInteger(n)||n<0||n>WIRE_BYTES)throw Error('Host length exceeds u32 wire field');room(4);view.setUint32(at,n,true);at+=4;};
 const text=(s:string)=>{const v=new TextEncoder().encode(s);u32(v.length);room(v.length);bytes.set(v,at);at+=v.length;};
 const write=(v:unknown):void=>{
  if(v===null){byte(0);return;}if(v===undefined){byte(1);return;}if(typeof v==='boolean'){byte(v?3:2);return;}
  if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Host number must be finite');byte(4);room(8);view.setFloat64(at,v,true);at+=8;return;}
  if(typeof v==='string'){byte(5);text(v);return;}
  if(typeof v!=='object'||ancestors.has(v))throw Error('Only acyclic host packet data is transferable');
  if(Object.getPrototypeOf(v)===Uint8Array.prototype){const data=v as Uint8Array;if(!(data.buffer instanceof ArrayBuffer))throw Error('Only ordinary owned byte arrays are transferable');byte(10);u32(data.length);room(data.length);bytes.set(data,at);at+=data.length;return;}
  if(Array.isArray(v)){
   if(v.length&&v.every(x=>typeof x==='number'&&Number.isFinite(x))){const ints=v.every(x=>Number.isInteger(x)&&x>=0&&x<=WIRE_BYTES&&!Object.is(x,-0));byte(ints?8:9);u32(v.length);room(v.length*(ints?4:8));for(const n of v){if(ints)view.setUint32(at,n,true);else view.setFloat64(at,n,true);at+=ints?4:8;}return;}
   byte(6);u32(v.length);if(v.length>limit-at)throw Error('Host array exceeds configured byte budget');ancestors.add(v);stack.push({value:v,index:0,length:v.length});return;
  }
  if(Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw Error('Opaque objects cannot cross host transport');
  const keys=Object.keys(v);byte(7);u32(keys.length);if(keys.length>(limit-at)/5)throw Error('Host object exceeds configured byte budget');ancestors.add(v);stack.push({value:v,keys,index:0,length:keys.length});
 };
 write(value);while(stack.length){const f=stack[stack.length-1];if(f.index===f.length){ancestors.delete(f.value);stack.pop();continue;}
  if(f.keys){const key=f.keys[f.index++],d=Object.getOwnPropertyDescriptor(f.value,key)!;if(!('value'in d))throw Error('Host accessors are not transferable');text(key);write(d.value);}else write((f.value as unknown[])[f.index++]);
 }return bytes.slice(0,at);
}
export function decodeHostValue(bytes:Uint8Array,maxBytes=WIRE_BYTES):unknown{
 if(bytes.byteLength>budget(maxBytes))throw Error('Host packet exceeds configured byte budget');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0;
 const room=(n:number)=>{if(!Number.isSafeInteger(n)||n<0||at+n>bytes.length)throw Error('Truncated host packet');},byte=()=>{room(1);return bytes[at++];},u32=()=>{room(4);const v=view.getUint32(at,true);at+=4;return v;},text=()=>{const n=u32();room(n);const s=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes.subarray(at,at+n));at+=n;return s;};
 const stack:{value:any;object:boolean;index:number;length:number}[]=[];
 const read=():any=>{const tag=byte();if(tag===0)return null;if(tag===1)return undefined;if(tag===2)return false;if(tag===3)return true;
  if(tag===4){room(8);const v=view.getFloat64(at,true);at+=8;if(!Number.isFinite(v))throw Error('Nonfinite host value');return v;}if(tag===5)return text();
  if(tag===8||tag===9){const n=u32(),stride=tag===8?4:8;room(n*stride);const out=Array<number>(n);for(let i=0;i<n;i++){const v=tag===8?view.getUint32(at,true):view.getFloat64(at,true);at+=stride;if(!Number.isFinite(v))throw Error('Nonfinite numeric array');out[i]=v;}return out;}
  if(tag===10){const n=u32();room(n);const out=Uint8Array.from(bytes.subarray(at,at+n));at+=n;return out;}
  if(tag===6||tag===7){const n=u32(),object=tag===7;if(n>(bytes.length-at)/(object?5:1))throw Error('Host container exceeds remaining bytes');const value=object?{}:Array(n);if(n)stack.push({value,object,index:0,length:n});return value;}
  throw Error('Unknown host wire tag');
 };
 const result=read();while(stack.length){const f=stack[stack.length-1];if(f.index===f.length){stack.pop();continue;}
  const key=f.object?text():f.index;if(f.object&&Object.hasOwn(f.value,key))throw Error('Duplicate host key');f.index++;const value=read();Object.defineProperty(f.value,key,{value,enumerable:true,writable:true,configurable:true});
 }if(at!==bytes.length)throw Error('Trailing host packet bytes');return result;
}
