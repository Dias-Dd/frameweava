import {encodeHostValue} from './codec.ts';

const descriptor=Object.getOwnPropertyDescriptor,prototype=Object.getPrototypeOf,keys=Object.keys,define=Object.defineProperty;
const apply=Reflect.apply,Bytes=Uint8Array,ArrayBufferPrototype=ArrayBuffer.prototype;
const typed=prototype(Bytes.prototype),byteLength=descriptor(typed,'length')!.get!,byteOffset=descriptor(typed,'byteOffset')!.get!,byteBuffer=descriptor(typed,'buffer')!.get!,setBytes=Bytes.prototype.set;
const errorStack=descriptor(Error.prototype,'stack')?.get??descriptor(new Error(),'stack')?.get;

function data(object:unknown,key:string):{readable:boolean;value?:unknown}{
 if(object===null||!['object','function'].includes(typeof object))return {readable:true};
 const seen=new Set<object>();let at=object as object;
 try{while(at&&!seen.has(at)){seen.add(at);const d=descriptor(at,key);if(d)return 'value'in d?{readable:true,value:d.value}:{readable:false};at=prototype(at);}return {readable:true};}
 catch{return {readable:false};}
}
function stackOf(error:unknown,ordinaryFieldsReadable:boolean){
 const value=data(error,'stack');if(typeof value.value==='string')return value.value;
 // Firefox's stack is a native Error.prototype accessor. Never invoke an
 // authored accessor or ask an opaque value to format itself.
 if(errorStack&&ordinaryFieldsReadable)try{const s=apply(errorStack,error,[]);if(typeof s==='string')return s;}catch{}
 return '';
}

/** Descriptor-only admission copy; the existing codec still defines wire tags
 * and the configured byte limit. No authored accessor is called. */
function detailCopy(value:unknown,limit:number){
 let charged=0;const known=new Map<object,any>(),pending:{source:any;target:any;keys?:string[];length:number;index:number}[]=[];
 const charge=(n:number)=>{charged+=n;if(!Number.isSafeInteger(charged)||charged>limit)throw Error('byte budget');};
 const copy=(v:any):any=>{
  charge(1);
  if(v===null||v===undefined||typeof v==='boolean')return v;
  if(typeof v==='number'){if(!Number.isFinite(v))throw Error('nonfinite');charge(8);return v;}
  if(typeof v==='string'){charge(v.length+4);return v;}
  if(typeof v!=='object')throw Error('opaque');if(known.has(v))return known.get(v);
  const p=prototype(v);
  if(p===Bytes.prototype){
   const n=apply(byteLength,v,[]) as number,b=apply(byteBuffer,v,[]),offset=apply(byteOffset,v,[]) as number;
   if(prototype(b)!==ArrayBufferPrototype)throw Error('shared bytes');charge(n+4);
   const out=new Bytes(n);apply(setBytes,out,[new Bytes(b,offset,n)]);known.set(v,out);return out;
  }
  if(Array.isArray(v)){
   const length=descriptor(v,'length')?.value;if(!Number.isSafeInteger(length)||length<0)throw Error('array');charge(length+4);
   const out=new Array(length);known.set(v,out);pending.push({source:v,target:out,length,index:0});return out;
  }
  if(p!==Object.prototype&&p!==null)throw Error('opaque');const names=keys(v);charge(names.length*5);
  const out=Object.create(null);known.set(v,out);pending.push({source:v,target:out,keys:names,length:names.length,index:0});return out;
 };
 const result=copy(value);
 while(pending.length){const f=pending[pending.length-1];if(f.index===f.length){pending.pop();continue;}
  const key=f.keys?f.keys[f.index++]:String(f.index++),d=descriptor(f.source,key);
  if(d&&!('value'in d))throw Error('accessor');if(f.keys)charge(key.length);
  // Holes become explicit undefined, matching an ordinary nonnumeric array's
  // existing wire representation without reading polluted Array prototypes.
  define(f.target,key,{value:copy(d?.value),enumerable:true,writable:true,configurable:true});
 }
 return result;
}

/** Error path only. Existing successful result encoding is unchanged. */
export function encodeHostException(id:number,error:unknown,maxBytes:number):Uint8Array{
 let code='E_NATIVE_LOGIC',message='Unprintable JavaScript exception',details:unknown='';
 let frame:number|undefined,hint:string|undefined;
 try{
  const c=data(error,'code'),m=data(error,'message'),name=data(error,'name'),d=data(error,'details');
  if(typeof c.value==='string')code=c.value;
  if(typeof m.value==='string')message=m.value;
  else if(error===null||!['object','function'].includes(typeof error))message=String(error);
  if(c.value===undefined&&name.value==='ReferenceError'&&/^(process|require) is not defined/.test(message))code='E_SPIDERMONKEY_NODE_GLOBAL';
  const f=data(error,'frame'),h=data(error,'hint');if(typeof f.value==='number'&&Number.isFinite(f.value))frame=f.value;if(typeof h.value==='string')hint=h.value;
  const fallback=stackOf(error,c.readable&&m.readable&&name.readable);
  if(d.readable&&d.value!==undefined){
   try{details=detailCopy(d.value,maxBytes);encodeHostValue(details,maxBytes);}
   catch{details=fallback+'\n[Frameweave: error.details was not transferable within the configured host byte budget]';}
  }else details=d.readable?fallback:fallback+'\n[Frameweave: error.details accessor was not read]';
 }catch{details='[Frameweave: exception fields could not be inspected]';}
 const issue={code,message,details,...frame===undefined?{}:{frame},...hint===undefined?{}:{hint}};
 try{return encodeHostValue({id,error:issue},maxBytes);}
 catch{
  const fallback={code,message:'Exception diagnostic unavailable within the configured host byte budget',details:''};
  try{return encodeHostValue({id,error:fallback},maxBytes);}
  catch{return encodeHostValue({id,error:{...fallback,code:'E_NATIVE_LOGIC'}},maxBytes);}
 }
}
