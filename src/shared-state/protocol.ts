import {EngineError} from '../core/errors.ts';
import type {FrameContext,Json,PortValue} from '../core/types.ts';
import type {GpuPixelImage} from '../../modules/gpu-effects/pixel-types.ts';

export const CONFIG='vSharedDefinition',RUNTIME='vSharedRuntime',OUTPUT='sharedState';
export const LIMITS={cells:32,bytes:16384,depth:8,nodes:1024,totalBytes:131072} as const;
export type Value=number|boolean|string|Json[]|{[key:string]:Json};
export type Kind='number'|'boolean'|'string'|'json';
export interface Variable<T extends Value=Value>{readonly id:string;readonly writer:string;readonly kind:Kind;readonly initial:T}
export interface Binding {variable:Variable;input:string}
export interface Definition {stage:string;writes:Variable[];reads:Binding[]}
export interface Cell {value:Value;version:number}
export interface Runtime {session:string;transaction:number;revision:number;frame:number;cells:Record<string,Cell>;callStage?:string}
export interface Publication {schemaVersion:1;session:string;transaction:number;revision:number;frame:number;writer:string;writes:Record<string,Cell>}
export function fail(code:string,message:string):never{throw new EngineError(code,message);}
export const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype;
export const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function copy<T>(v:T):T{return JSON.parse(JSON.stringify(v));}
export function checkTotal(cells:Record<string,Cell>){if(new TextEncoder().encode(JSON.stringify(cells)).length>LIMITS.totalBytes)fail('E_SHARED_BUDGET','Session values exceed 128 KiB UTF-8');}
export function bounded(value:unknown,kind:Kind):Value{
  if(!['number','boolean','string','json'].includes(kind))fail('E_SHARED_VALUE','Unknown value kind');
  if(kind==='json'?(!Array.isArray(value)&&!plain(value)):typeof value!==kind)fail('E_SHARED_VALUE',`Expected ${kind}`);
  let nodes=0;const seen=new Set<object>();
  function visit(v:unknown,depth:number):void{
    if(++nodes>LIMITS.nodes||depth>LIMITS.depth)fail('E_SHARED_BUDGET','Value exceeds JSON depth/node budget');
    if(v===null||typeof v==='string'||typeof v==='boolean')return;
    if(typeof v==='number'){if(!Number.isFinite(v))fail('E_SHARED_VALUE','Numbers must be finite');return;}
    if(!v||typeof v!=='object'||(!plain(v)&&!Array.isArray(v))||seen.has(v))fail('E_SHARED_VALUE','Only acyclic plain JSON data is supported');
    if(Object.getOwnPropertySymbols(v).length)fail('E_SHARED_VALUE','Symbol keys are unsupported');
    seen.add(v);
    const keys=Object.keys(v),descriptors=Object.getOwnPropertyDescriptors(v);
    if(Array.isArray(v)&&(keys.length!==v.length||keys.some((key,index)=>key!==String(index))))fail('E_SHARED_VALUE','Sparse/extended arrays are unsupported');
    for(const key of keys){const d=descriptors[key];if(!d||!('value' in d))fail('E_SHARED_VALUE','Accessors are unsupported');visit(d.value,depth+1);}
    for(const [key,d]of Object.entries(descriptors))if(!(Array.isArray(v)&&key==='length')&&!d.enumerable)fail('E_SHARED_VALUE','Non-enumerable data is unsupported');
    seen.delete(v);
  }
  visit(value,0);if(new TextEncoder().encode(JSON.stringify(value)).length>LIMITS.bytes)fail('E_SHARED_BUDGET','Value exceeds 16 KiB UTF-8');
  return copy(value) as Value;
}
export function sharedVariable<T extends Value>(options:Variable<T>):Variable<T>{
  if(!options||Object.keys(options).some(k=>!['id','writer','kind','initial'].includes(k))||!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(options.id)||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(options.writer))fail('E_SHARED_DECLARATION','Invalid variable ID/writer/fields');
  const initial=bounded(options.initial,options.kind) as T;
  const result={id:options.id,writer:options.writer,kind:options.kind,initial};
  const freeze=(v:unknown)=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}};freeze(result);return result;
}
export function definition(encoded:unknown):Definition{
  if(typeof encoded!=='string'||encoded.length>LIMITS.totalBytes*2)fail('E_SHARED_DECLARATION','Missing or oversized Stage declaration');
  let d:Definition;try{d=JSON.parse(encoded as string);}catch{return fail('E_SHARED_DECLARATION','Invalid Stage declaration JSON');}
  if(!plain(d)||Object.keys(d).some(k=>!['stage','writes','reads'].includes(k))||typeof d.stage!=='string'||!Array.isArray(d.writes)||!Array.isArray(d.reads)||d.writes.length+d.reads.length>LIMITS.cells*2)fail('E_SHARED_DECLARATION','Invalid Stage declaration');
  const ids=new Set<string>();
  for(const v of d.writes){sharedVariable(v);if(v.writer!==d.stage||ids.has(v.id))fail('E_SHARED_CONFLICT','Duplicate cell or wrong writer');ids.add(v.id);}
  for(const b of d.reads){if(!plain(b)||Object.keys(b).some(k=>!['variable','input'].includes(k))||typeof b.input!=='string')fail('E_SHARED_DECLARATION','Invalid read binding');sharedVariable(b.variable);if(b.variable.writer===d.stage||ids.has(b.variable.id))fail('E_SHARED_CONFLICT','Read bindings must name another single writer without duplicates');ids.add(b.variable.id);}
  return d;
}
export function runtime(encoded:unknown,context:FrameContext):Runtime{
  if(typeof encoded!=='string'||encoded.length>LIMITS.totalBytes*2)fail('E_SHARED_HOST_REQUIRED','Use the explicit SharedRenderSession; ordinary CLI/RenderSession does not host these variables');
  let r:Runtime;try{r=JSON.parse(encoded as string);}catch{return fail('E_SHARED_PROTOCOL','Invalid runtime snapshot');}
  if(!plain(r)||typeof r.session!=='string'||!Number.isSafeInteger(r.transaction)||r.transaction<1||!Number.isSafeInteger(r.revision)||r.revision<0||r.frame!==context.globalFrame||!plain(r.cells)||r.callStage!==undefined&&typeof r.callStage!=='string')fail('E_SHARED_PROTOCOL','Runtime identity/frame mismatch');return r;
}
export function publication(value:unknown,r:Runtime,writer:string):Publication{
  const p=value as Publication;
  if(!plain(p)||Object.keys(p).some(k=>!['schemaVersion','session','transaction','revision','frame','writer','writes'].includes(k))||p.schemaVersion!==1||p.session!==r.session||p.transaction!==r.transaction||p.revision!==r.revision||p.frame!==r.frame||p.writer!==writer||!plain(p.writes))fail('E_SHARED_STALE','Publication is foreign, stale or belongs to another writer/frame');return p;
}
function checkedCell(cell:Cell|undefined,v:Variable):Cell{
  if(!cell||!plain(cell)||Object.keys(cell).some(k=>!['value','version'].includes(k))||!Number.isSafeInteger(cell.version)||cell.version<0)fail('E_SHARED_PROTOCOL',`Invalid ${v.id} version`);
  return {value:bounded(cell.value,v.kind),version:cell.version};
}
/** A synchronous view of already delivered inputs. No remote read masquerades as sync. */
export function sharedFrame(context:FrameContext,inputs:Record<string,unknown>,props:Record<string,unknown>){
  const d=definition(props[CONFIG]),r=runtime(props[RUNTIME],context),writes:Record<string,Cell>={},visible:Record<string,Cell>={};let finalized=false;
  if(r.callStage!==undefined&&r.callStage!==d.stage)fail('E_SHARED_CALL_SCOPE','Call snapshot belongs to another Stage');
  for(const v of d.writes)visible[v.id]=checkedCell(r.cells[v.id],v);
  // Explicit calls read their declared cells from the committed host snapshot.
  // No upstream Stage or synthetic writer publication is involved.
  if(r.callStage!==undefined){for(const b of d.reads)visible[b.variable.id]=checkedCell(r.cells[b.variable.id],b.variable);}
  else
  for(const b of d.reads){const p=publication(inputs[b.input],r,b.variable.writer),base=checkedCell(r.cells[b.variable.id],b.variable),updated=Object.hasOwn(p.writes,b.variable.id)?p.writes[b.variable.id]:undefined;
    if(updated){const c=checkedCell(updated,b.variable);if(c.version!==base.version+1)fail('E_SHARED_STALE','Reader received an invalid version transition');visible[b.variable.id]=c;}
    else visible[b.variable.id]=base;
  }
  function cell<T extends Value>(v:Variable<T>){if(finalized)fail('E_SHARED_FINALIZED','Draft was finalized');const declared=[...d.writes,...d.reads.map(b=>b.variable)].find(x=>x.id===v.id);if(!declared||!same(declared,v))fail('E_SHARED_ACCESS',`Cell ${v.id} was not declared by this Stage`);return checkedCell(visible[v.id],v);}
  return {
    get<T extends Value>(v:Variable<T>):T{return copy(cell(v).value) as T;},
    version(v:Variable){return cell(v).version;},
    set<T extends Value>(v:Variable<T>,value:T){cell(v);if(!d.writes.some(x=>x.id===v.id))fail('E_SHARED_WRITER',`Stage ${d.stage} is not the writer of ${v.id}`);const next={value:bounded(value,v.kind),version:r.cells[v.id].version+1};writes[v.id]=next;visible[v.id]=copy(next);},
    /** Candidate only. Stage publication is accepted after return; session commits after whole-frame success. */
    outputs<T extends Record<string,PortValue|GpuPixelImage>>(outputs:T):T&Record<typeof OUTPUT,Json>{
      if(finalized||Object.hasOwn(outputs,OUTPUT))fail('E_SHARED_FINALIZED','Duplicate finalize/reserved output');finalized=true;
      return (d.writes.length?{...outputs,[OUTPUT]:copy({schemaVersion:1,session:r.session,transaction:r.transaction,revision:r.revision,frame:r.frame,writer:d.stage,writes}) as unknown as Json}:outputs) as T&Record<typeof OUTPUT,Json>;
    },
  };
}
