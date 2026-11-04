import type {NativePluginInit} from '@frameweave/engine/plugins';
import {EngineError} from '../../src/core/errors.ts';import {createSparseVolume,type SparseVolume,type SparseVolumeSource} from './index.ts';
export function initialize(init:NativePluginInit){
 if(init.backend!=='native-gpu'||!init.gpu||typeof init.gpu.importBufferResource!=='function')throw new EngineError('E_NANOVDB_RUNTIME','Native GPU Resource profile support required; update the engine rather than using CPU fallback');const gpu=init.gpu,volumes=new Set<SparseVolume>();let disposed=false;
 return {exports:{async createVolume(source:SparseVolumeSource){if(disposed)throw new EngineError('E_NANOVDB_CLOSED','Module disposed');const v=await createSparseVolume(gpu,source);volumes.add(v);return v;}},async dispose(){if(disposed)return;disposed=true;const all=await Promise.allSettled([...volumes].map(v=>v.dispose()));volumes.clear();const bad=all.find(r=>r.status==='rejected');if(bad?.status==='rejected')throw bad.reason;}};
}
