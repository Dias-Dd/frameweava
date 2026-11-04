import type {GpuComputeCapabilities} from '../gpu-effects/compute-capabilities.ts';
export interface NativeScopeEvidence {version:1;backend:'native-wgpu';owner:string;hardwareVerified:true;capabilities:GpuComputeCapabilities}
const evidence=new WeakMap<object,Readonly<NativeScopeEvidence>>();
/** Internal adapter registration after the private native-device handshake.
 * Public module loaders only consume the branded, Stage-owned scope object. */
export function registerNativeScope(scope:object,value:NativeScopeEvidence){
 if(value.version!==1||value.backend!=='native-wgpu'||value.hardwareVerified!==true||!/^[a-f0-9]{64}$/.test(value.owner)||value.capabilities.backend!=='native-wgpu'||value.capabilities.hardwareVerified!==true)throw new Error('Invalid native device handshake');
 const freeze=(v:any):any=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};const sealed=freeze(structuredClone(value)) as Readonly<NativeScopeEvidence>;evidence.set(scope,sealed);return sealed;
}
export function nativeScopeEvidence(scope:unknown){return scope&&typeof scope==='object'?evidence.get(scope):undefined;}
export function revokeNativeScope(scope:object){evidence.delete(scope);retirements.delete(scope);}

/** Core-private lease retirement; never exported by the authoring SDK. */
const retirements=new WeakMap<object,(kind:'image'|'buffer',value:object)=>void>();
export function registerNativeLeaseRetirement(scope:object,retire:(kind:'image'|'buffer',value:object)=>void){retirements.set(scope,retire);}
export function retireNativeLeaseResource(scope:object,kind:'image'|'buffer',value:object){const fn=retirements.get(scope);if(!fn)return false;fn(kind,value);return true;}
