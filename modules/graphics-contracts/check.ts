import {EngineError} from '../../src/core/errors.ts';
import {assertJson} from '../../src/core/graph.ts';

export const LIMITS={depth:24,nodes:500000,array:100000,string:65536,commands:8192,vertices:16384,glyphs:16384,samples:600,pixels:4194304,resourceBytes:67108864,jsonBytes:8388608} as const;
export function fail(path:string,message:string,code='E_GRAPHICS_DATA'):never {
  throw new EngineError(code,`${path}: ${message}`,{details:{path}});
}
/** Preflight before the existing JSON gate; bounds work, rejects getters/symbols/sparse arrays. */
export function bounded(value:unknown):void {
  let nodes=0;const active=new Set<object>();
  function visit(v:unknown,p:string,depth:number):void {
    if(depth>LIMITS.depth||++nodes>LIMITS.nodes)fail(p,'depth/node limit exceeded','E_GRAPHICS_LIMIT');
    if(typeof v==='string'&&v.length>LIMITS.string)fail(p,'string limit exceeded','E_GRAPHICS_LIMIT');
    if(v===null||typeof v!=='object')return;
    if(active.has(v))fail(p,'cycle','E_GRAPHICS_LIMIT');active.add(v);
    if(Array.isArray(v)){
      if(v.length>LIMITS.array)fail(p,'array limit exceeded','E_GRAPHICS_LIMIT');
      if(Reflect.ownKeys(v).length!==v.length+1)fail(p,'sparse or decorated array');
      for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!('value' in d))fail(`${p}[${i}]`,'expected own data element');visit(d.value,`${p}[${i}]`,depth+1);}
    }else{
      if(![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail(p,'expected plain JSON object');
      const keys=Reflect.ownKeys(v);if(keys.length>32)fail(p,'object field limit exceeded','E_GRAPHICS_LIMIT');
      for(const k of keys){if(typeof k!=='string')fail(p,'symbol field');if(k.length>128)fail(p,'field name length limit exceeded','E_GRAPHICS_LIMIT');const d=Object.getOwnPropertyDescriptor(v,k)!;if(!d.enumerable||!('value' in d))fail(`${p}.${k}`,'expected enumerable data field');visit(d.value,`${p}.${k}`,depth+1);}
    }
    active.delete(v);
  }
  visit(value,'$',0);assertJson(value);
}
export function object(v:unknown,p:string,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
  if(!v||typeof v!=='object'||Array.isArray(v))fail(p,'expected object');
  const o=v as Record<string,unknown>;
  for(const k of Object.keys(o))if(!required.includes(k)&&!optional.includes(k))fail(`${p}.${k}`,'unknown field');
  for(const k of required)if(!Object.hasOwn(o,k))fail(`${p}.${k}`,'required field');return o;
}
export function literal<T extends string|number>(v:unknown,choices:readonly T[],p:string):T {
  if(!choices.some(c=>v===c))fail(p,`expected ${choices.join(' | ')}`);return v as T;
}
export function number(v:unknown,p:string,min=-1e9,max=1e9):number {
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(p,`expected finite number in [${min}, ${max}]`);return v;
}
export function integer(v:unknown,p:string,min=0,max=Number.MAX_SAFE_INTEGER):number {
  const n=number(v,p,min,max);if(!Number.isSafeInteger(n))fail(p,'expected safe integer');return n;
}
export function string(v:unknown,p:string,empty=false):string {
  if(typeof v!=='string'||(!empty&&!v.length)||v.length>LIMITS.string)fail(p,'expected bounded string');return v;
}
export function id(v:unknown,p:string):string {const s=string(v,p);if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(s))fail(p,'invalid stable ID');return s;}
export function sha(v:unknown,p:string):string {const s=string(v,p);if(!/^[a-f0-9]{64}$/.test(s))fail(p,'expected lowercase SHA-256');return s;}
export function array<T>(v:unknown,p:string,max:number,parse:(item:unknown,path:string,index:number)=>T,min=0):T[]{
  if(!Array.isArray(v)||v.length<min||v.length>max)fail(p,`expected array length ${min}..${max}`);return v.map((x,i)=>parse(x,`${p}[${i}]`,i));
}
export function unique(values:readonly string[],p:string):void {const seen=new Set<string>();values.forEach((v,i)=>{if(seen.has(v))fail(`${p}[${i}]`,`duplicate ID ${v}`);seen.add(v);});}
export function header(o:Record<string,unknown>,schema:string,p='$'):void {
  if(o.schema!==schema)fail(`${p}.schema`,`expected ${schema}, received ${String(o.schema)}`,'E_GRAPHICS_SCHEMA');
  if(o.version!==1)fail(`${p}.version`,`unsupported ${schema} version ${String(o.version)}; reader supports 1`,'E_GRAPHICS_VERSION');id(o.id,`${p}.id`);
}
