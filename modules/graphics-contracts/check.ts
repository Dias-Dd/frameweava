import {EngineError} from '../../src/core/errors.ts';
/** @deprecated Addressable JS array/u32 lengths and safe integer accounting, not content budgets. */
export const LIMITS={depth:Number.MAX_SAFE_INTEGER,nodes:Number.MAX_SAFE_INTEGER,array:0xffffffff,string:Number.MAX_SAFE_INTEGER,commands:0xffffffff,vertices:0xffffffff,glyphs:0xffffffff,samples:0xffffffff,pixels:Number.MAX_SAFE_INTEGER,resourceBytes:Number.MAX_SAFE_INTEGER,jsonBytes:Number.MAX_SAFE_INTEGER} as const;
export function fail(path:string,message:string,code='E_GRAPHICS_DATA'):never {
  throw new EngineError(code,`${path}: ${message}`,{details:{path}});
}
/** Iterative JSON validation without content quotas. Never invokes getters. */
export function bounded(value:unknown):void {
  type Frame={value:object;path:string;keys:readonly PropertyKey[];at:number;array:boolean};
  const active=new Set<object>(),stack:Frame[]=[];
  function enter(v:unknown,p:string):void {
    if(v===null||typeof v==='string'||typeof v==='boolean')return;
    if(typeof v==='number'){if(!Number.isFinite(v))fail(p,'expected finite JSON number');return;}
    if(typeof v!=='object')fail(p,'expected JSON data');
    if(active.has(v))fail(p,'cycle','E_GRAPHICS_LIMIT');
    const array=Array.isArray(v);
    if(!array&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail(p,'expected plain JSON object');
    const keys=Reflect.ownKeys(v);
    if(array&&keys.length!==(v as unknown[]).length+1)fail(p,'sparse or decorated array');
    active.add(v);stack.push({value:v,path:p,keys,at:0,array});
  }
  enter(value,'$');
  while(stack.length){
    const f=stack[stack.length-1];
    if(f.at===f.keys.length){active.delete(f.value);stack.pop();continue;}
    const key=f.keys[f.at++];if(f.array&&key==='length')continue;
    if(typeof key!=='string')fail(f.path,'symbol field');
    const d=Object.getOwnPropertyDescriptor(f.value,key)!;
    const path=f.array?`${f.path}[${key}]`:`${f.path}.${key}`;
    if(!d.enumerable||!('value' in d))fail(path,'expected enumerable own data field');
    // An extra key cannot substitute a missing array index.
    if(f.array&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=(f.value as unknown[]).length))fail(path,'decorated array');
    enter(d.value,path);
  }
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
export function number(v:unknown,p:string,min=-Infinity,max=Infinity):number {
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(p,`expected finite number in [${min}, ${max}]`);return v;
}
export function integer(v:unknown,p:string,min=0,max=Number.MAX_SAFE_INTEGER):number {
  const n=number(v,p,min,max);if(!Number.isSafeInteger(n))fail(p,'expected safe integer');return n;
}
export function string(v:unknown,p:string,empty=false):string {
  if(typeof v!=='string'||(!empty&&!v.length))fail(p,'expected string');return v;
}
export function id(v:unknown,p:string):string {const s=string(v,p);if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(s))fail(p,'invalid stable ID');return s;}
export function sha(v:unknown,p:string):string {const s=string(v,p);if(!/^[a-f0-9]{64}$/.test(s))fail(p,'expected lowercase SHA-256');return s;}
export function array<T>(v:unknown,p:string,max:number,parse:(item:unknown,path:string,index:number)=>T,min=0):T[]{
  if(!Array.isArray(v)||v.length<min||v.length>max)fail(p,`expected array length ${min}..${max}`);return v.map((x,i)=>parse(x,`${p}[${i}]`,i));
}
export function unique(values:readonly string[],p:string):void {const seen=new Set<string>();values.forEach((v,i)=>{if(seen.has(v))fail(`${p}[${i}]`,`duplicate ID ${v}`);seen.add(v);});}
export function header(o:Record<string,unknown>,schema:string,p='$'):void {
  if(o.schema!==schema)fail(`${p}.schema`,`expected ${schema}, received ${String(o.schema)}`,'E_GRAPHICS_SCHEMA');
  if(o.version!==1)fail(`${p}.version`,`unsupported ${schema} version ${String(o.version)}; reader supports 1`,'E_GRAPHICS_VERSION');id(o.id,`${p}.id`);
}
