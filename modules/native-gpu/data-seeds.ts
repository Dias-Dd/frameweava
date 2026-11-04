import {restoreResidentSeed} from './resident-buffers.ts';
import {EngineError} from '../../src/core/errors.ts';
import type {NativeProgram} from './client.ts';
type Data=NonNullable<NativeProgram['data']>[number];
/** Initialization seeds outlive a frame. Authored frame-local immutable seeds
 * may be omitted only within that frame's existing continuation transaction. */
export function restoreNativeDataSeeds(values:readonly(Data&{seedOmitted?:boolean})[],initialCount:number|undefined,initial:Map<number,Data>,frame:Map<number,Data>,resident:Map<string,Data>=new Map()):Data[]{
 const fail=(message:string):never=>{throw new EngineError('E_NATIVE_PROTOCOL',message);};
 if(!Array.isArray(values))fail('Invalid native data seed array');
 if(initialCount!==undefined&&(!Number.isSafeInteger(initialCount)||initialCount<0||initialCount>values.length))fail('Invalid initialized data prefix');
 return values.map((d,i)=>{
  if(!d||!Array.isArray(d.initial))fail('Invalid native data seed descriptor');
  if(d.sourceResource!==undefined)throw new EngineError('E_NATIVE_BINARY_PERMISSION','Authored packets cannot supply private binary file leases');
  if(d.resident)return restoreResidentSeed(d,resident);
  const stable=initialCount===undefined||i<initialCount,cache=stable?initial:frame;
  if(initialCount!==undefined&&(stable&&!d.immutable&&!d.persistent||!stable&&d.persistent))fail('Data lifetime differs from its initialization prefix');
  if(d.seedOmitted){const old=cache.get(i);if(!old||!(d.immutable||d.persistent)||d.initial.length||old.length!==d.length||old.type!==d.type||!!old.immutable!==!!d.immutable||JSON.stringify(old.persistent)!==JSON.stringify(d.persistent))fail('Unknown immutable data seed');return old!;}
  const {seedOmitted:_omit,...value}=d;
  if(d.immutable||d.persistent){if(cache.has(i))fail('Immutable data cannot change within its declared lifetime');cache.set(i,value);}
  return value;
 });
}
