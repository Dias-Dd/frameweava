import {EngineError} from '../../src/core/errors.ts';
import type {NativeRecordingScope} from './scope.ts';
import {nativeMetadataBytes} from './capacity.ts';

type Packet=ReturnType<NativeRecordingScope['packet']>;
type Graph=Pick<Packet,'images'|'passes'|'external'>;
type Entry={graph:Graph;bytes:number};
type Ref={version:1;id:number};
export type NativeGraphPacket=Omit<Packet,keyof Graph>&Partial<Graph>&{graphTemplate?:Ref};

const fail=(message:string):never=>{throw new EngineError('E_NATIVE_GRAPH_TEMPLATE',message);};

function equal(a:unknown,b:unknown):boolean{
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 if(Array.isArray(a)&&a.length!==(b as unknown[]).length)return false;
 const x=a as Record<string,unknown>,y=b as Record<string,unknown>;
 const keys=Object.keys(x);
 return keys.length===Object.keys(y).length&&keys.every(k=>Object.hasOwn(y,k)&&equal(x[k],y[k]));
}

class TemplateCache {
 protected entries=new Map<number,Entry>();
 protected bytes=0;
 constructor(protected budget:number){}
 protected size(graph:Graph){return new TextEncoder().encode(JSON.stringify(graph)).byteLength;}
 protected put(id:number,entry:Entry){
  if(entry.bytes>this.budget)return false;
  this.entries.set(id,entry);
  this.bytes+=entry.bytes;
  // A hot topology uses one template; a few alternating branches can share
  // this cache. Eviction only restores the ordinary full graph packet.
  while(this.bytes>this.budget||this.entries.size>8){
   const oldest=this.entries.keys().next().value!;
   this.bytes-=this.entries.get(oldest)!.bytes;
   this.entries.delete(oldest);
  }
  return true;
 }
 protected touch(id:number,entry:Entry){
  this.entries.delete(id);
  this.entries.set(id,entry);
 }
}

/** Pack the just-recorded graph. Author JS, kernel deltas, parameters and all
 * mutable or externally published values still run through the usual path. */
export class NativeGraphEncoder extends TemplateCache{
 private serial=0;
 pack(packet:Packet):NativeGraphPacket{
  const {images,passes,external,...frame}=packet,graph={images,passes,external};
  const recent=[...this.entries.entries()].reverse();
  for(const [id,entry]of recent){
   if(!equal(graph,entry.graph))continue;
   this.touch(id,entry);
   return {...frame,graphTemplate:{version:1,id}};
  }
  const bytes=this.size(graph),id=this.serial+1;
  if(!Number.isSafeInteger(id)||!this.put(id,{graph,bytes}))return packet;
  this.serial=id;
  return {...packet,graphTemplate:{version:1,id}};
 }
}

export class NativeGraphDecoder extends TemplateCache{
 private serial=0;
 private hits=0;
 private builds=0;
 expand(message:NativeGraphPacket):{packet:Packet;metadataBytes?:number}{
  const {graphTemplate,images,passes,external,...frame}=message;
  if(!graphTemplate)return {packet:message as Packet};
  const {version,id}=graphTemplate;
  if(version!==1||!Number.isSafeInteger(id)||id<1)fail('Invalid graph template identity');
  if(images===undefined&&passes===undefined&&external===undefined){
   const entry=this.entries.get(id)??fail('Unknown or evicted graph template');
   this.touch(id,entry);
   this.hits++;
   // Both are object members. Merge their serialized lengths without
   // serializing immutable graph metadata again (one pair of braces and comma).
   return {packet:{...frame,...entry.graph},metadataBytes:nativeMetadataBytes(frame)+entry.bytes-1};
  }
  if(id!==this.serial+1||!Array.isArray(images)||!Array.isArray(passes)||!external||typeof external!=='object'||Array.isArray(external))
   return fail('Invalid graph template definition');
  const graph={images,passes,external};
  if(!this.put(id,{graph,bytes:this.size(graph)}))return fail('Graph template exceeds the owner cache budget');
  this.serial=id;
  this.builds++;
  return {packet:{...frame,...graph}};
 }
 stats(){return {hits:this.hits,builds:this.builds,live:this.entries.size,bytes:this.bytes};}
}
