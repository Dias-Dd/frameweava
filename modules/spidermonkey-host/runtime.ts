import {encodeHostValue,decodeHostValue} from './codec.ts';
import type {FrameContext} from '../../src/core/types.ts';
import {hashString} from '../../src/core/time.ts';
import {hostAtob,hostBtoa} from './base64.ts';
import {installWasmPromiseAdapter} from './wasm-promises.ts';
import {hostTextDecoder} from './text-decoder.ts';
import {encodeHostException} from './error-wire.ts';
declare const __FRAMEWEAVE_ERROR_BYTES__:number;
const errorBytes=typeof __FRAMEWEAVE_ERROR_BYTES__==='number'?__FRAMEWEAVE_ERROR_BYTES__:64*1024**2;
declare const __fw_emit:(bytes:Uint8Array)=>void;
declare const __fw_hash:(bytes:Uint8Array)=>Uint8Array;
declare const __fw_utf8:(value:string)=>Uint8Array;
declare const __fw_decode:(value:Uint8Array,fatal:boolean)=>string;
declare const __fw_input:()=>Uint8Array;
declare const __fw_log:(text:string)=>void;

/** Loaded once BEFORE any Stage bundle. No DOM, Node, filesystem or network. */
const emit=__fw_emit,hash=__fw_hash,utf8=__fw_utf8,decode=__fw_decode,input=__fw_input,log=__fw_log;
const osIsolation=(globalThis as any).__fw_osIsolation??'appcontainer';
delete (globalThis as any).__fw_osIsolation;
if(!(globalThis as any).__fw_allowWasm)Object.defineProperty(globalThis,'WebAssembly',{value:undefined,writable:false,configurable:false});else installWasmPromiseAdapter(WebAssembly);delete (globalThis as any).__fw_allowWasm;
for(const key of ['__fw_emit','__fw_hash','__fw_utf8','__fw_decode','__fw_input','__fw_log'])delete (globalThis as any)[key];
(globalThis as any).TextEncoder=class{encode(value=''){return utf8(String(value));}};
(globalThis as any).TextDecoder=hostTextDecoder(decode);
(globalThis as any).btoa=hostBtoa;(globalThis as any).atob=hostAtob;
(globalThis as any).crypto=Object.freeze({subtle:Object.freeze({async digest(name:string,data:Uint8Array|ArrayBuffer){if(name!=='SHA-256')throw Error('Only SHA-256 is admitted');const bytes=data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(data.buffer,data.byteOffset,data.byteLength);return hash(bytes).buffer;}})});
let logical=0,rendering=false,nextTimer=1,rng=((globalThis as any).__fw_seed??0)>>>0||1;delete (globalThis as any).__fw_seed;
const timers=new Map<number,{time:number;run:()=>void}>();
// Exact CLOCK_SCRIPT FNV/xorshift sequence, using the existing Core hash.
Math.random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)/4294967296;};
const OriginalDate=Date;
(globalThis as any).Date=new Proxy(OriginalDate,{construct:(target,args)=>new (target as any)(...(args.length?args:[logical*1000])),apply:()=>new OriginalDate(logical*1000).toString()});Date.now=()=>logical*1000;
(globalThis as any).performance=Object.freeze({now:()=>logical*1000,timeOrigin:0});
(globalThis as any).queueMicrotask=(f:()=>void)=>{Promise.resolve().then(f);};
(globalThis as any).setTimeout=(run:()=>void,ms=0)=>{if(rendering)throw Object.assign(new Error('Use renderAt(context), not independent animation timers'),{code:'E_CLOCK'});if(typeof run!=='function'||!Number.isFinite(ms)||ms<0)throw Error('Expected function and finite logical delay');const id=nextTimer++;timers.set(id,{run,time:logical+ms/1000});return id;};
(globalThis as any).clearTimeout=(id:number)=>timers.delete(id);
const print=(...values:unknown[])=>log(values.map(value=>{try{return typeof value==='string'?value:JSON.stringify(value)??String(value);}catch{return '[unprintable]';}}).join(' ').slice(0,4096));
(globalThis as any).console=Object.freeze({log:print,warn:print,error:print,info:print,debug:print});
// Scheduler notification only. This is local microtask delivery, not DOM or IPC.
(globalThis as any).MessageChannel=class{port1:any;port2:any;constructor(){const a:any={onmessage:null,close(){a.onmessage=null;}},b:any={onmessage:null,close(){b.onmessage=null;}};a.postMessage=(data:unknown)=>queueMicrotask(()=>b.onmessage?.({data}));b.postMessage=(data:unknown)=>queueMicrotask(()=>a.onmessage?.({data}));this.port1=a;this.port2=b;}};
// Used only by installNativeLogic's host-neutral branch. Captured by that module;
// this transport never turns arbitrary JSON into GPU capability tokens.
let dispatch:((method:string,payload:any)=>Promise<unknown>)|undefined;
Object.defineProperty(globalThis,'__frameweaveNativeHost',{value:Object.freeze({register(fn:typeof dispatch){if(dispatch)throw Error('Stage already installed');dispatch=fn;},setFrame(ctx:FrameContext){logical=ctx.time;rng=hashString(`${ctx.seed|0}:${ctx.frame}`)||1;rendering=true;},stopFrame(){rendering=false;}}),configurable:false});
Object.defineProperty(globalThis,'__fw_request',{value:async(id:number,method:string,payload:any)=>{
 try{
  if(!dispatch)throw Error('Native Stage not installed');
  if(method==='native.render'){
   if(!payload?.context||!Number.isFinite(payload.context.time))throw Error('Explicit frame context required');logical=payload.context.time;
   for(const [key,t]of timers){if(t.time<=logical){timers.delete(key);t.run();}}
  }
  const checkpoint=method==='native.preview.capture'||method==='native.preview.restore';
  if(checkpoint&&timers.size)throw Object.assign(new Error('Pending timer callbacks cannot be captured'),{code:'E_NATIVE_PREVIEW_CHECKPOINT_UNSUPPORTED'});
  if(checkpoint)rendering=true;
  try{const result=await dispatch(method,payload);emit(encodeHostValue({id,result}));}
  finally{if(checkpoint)rendering=false;}
 }catch(e){emit(encodeHostException(id,e,errorBytes));}
},writable:false,configurable:false});
Object.defineProperty(globalThis,'__fw_receive',{value:()=>{const request=decodeHostValue(input()) as any;return (globalThis as any).__fw_request(request.id,request.method,request.payload);},writable:false,configurable:false});
// Broker bootstrap acknowledgment has the same bounded binary transport.
emit(encodeHostValue({id:0,result:{engine:'spidermonkey',persistent:true,osIsolation,binaryTransport:1}}));
