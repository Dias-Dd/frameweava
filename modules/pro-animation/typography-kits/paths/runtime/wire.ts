// SPDX-License-Identifier: Apache-2.0
import {BindgenError} from './session.mjs';
/** Copy typed views before transferring; never detach the caller's arrays. */
export function cloneData(value:unknown,transfer:ArrayBuffer[]=[],depth=0):any{
  if(depth>8)throw new BindgenError('E_BINDGEN_ARGUMENT','Data nesting exceeds 8');
  if(typeof value==='string'){if(value.length>1024*1024)throw new BindgenError('E_BINDGEN_ARGUMENT','String exceeds 1 MiB');return value;}
  if(value===undefined||value===null||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))throw new BindgenError('E_BINDGEN_ARGUMENT','Expected finite numbers');return value;}
  if(Array.isArray(value)){if(value.length>4096)throw new BindgenError('E_BINDGEN_ARGUMENT','Array exceeds 4096 items');return value.map(item=>cloneData(item,transfer,depth+1));}
  if(ArrayBuffer.isView(value)&&!(value instanceof DataView)){
    if(value.byteLength>16*1024*1024)throw new BindgenError('E_BINDGEN_ARGUMENT','Typed array exceeds 16 MiB');
    const copy=value instanceof Float32Array?new Float32Array(value):value instanceof Float64Array?new Float64Array(value):value instanceof Uint8Array?new Uint8Array(value):value instanceof Uint32Array?new Uint32Array(value):value instanceof Int32Array?new Int32Array(value):undefined;
    if(!copy)throw new BindgenError('E_BINDGEN_ARGUMENT','Unsupported typed array kind');transfer.push(copy.buffer);return copy;
  }
  throw new BindgenError('E_BINDGEN_ARGUMENT','Profile accepts primitive data, arrays and typed arrays, not host objects/callbacks');
}
