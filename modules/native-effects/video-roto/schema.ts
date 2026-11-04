import {EngineError} from '../../../src/core/errors.ts';
import {inferenceSource} from '../../inference/schema.ts';
import type {InferenceSource} from '../../inference/types.ts';
import type {VideoRotoBundle,VideoRotoOptions} from './types.ts';

export function fail(path:string,expected:string):never{throw new EngineError('E_VIDEO_ROTO_SCHEMA','videoRoto.'+path+': expected '+expected);}
function object(value:unknown,path:string):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))fail(path,'an object');return value as Record<string,unknown>;}
function fields(o:Record<string,unknown>,allowed:readonly string[],path:string){for(const k of Object.keys(o))if(!allowed.includes(k))fail(path+'.'+k,'a known field');}
function array(value:unknown,n:number,path:string){if(!Array.isArray(value)||value.length!==n||Array.from(value).some(v=>typeof v!=='number'||!Number.isFinite(v)||!Number.isFinite(Math.fround(v))))fail(path,n+' finite F32 numbers');return Object.freeze([...value]) as readonly number[];}
const shapes={vision:{inputs:{pixels:[1,3,1024,1024]},outputs:{high0:[1,32,256,256],high1:[1,64,128,128],features:[1,256,64,64]}},seed:{inputs:{features:[1,256,64,64],authored:[1,1,1024,1024]},outputs:{logits:[1,1,256,256],memory:[4096,1,64],pointer:[4,1,64],object_score:[1]}},track:{inputs:{high0:[1,32,256,256],high1:[1,64,128,128],features:[1,256,64,64],spatial_memory:[28672,1,64],spatial_memory_pos:[28672,1,64],object_pointers:[64,1,64],object_pointer_pos:[64,1,64],valid:[28736]},outputs:{logits:[1,1,256,256],memory:[4096,1,64],pointer:[4,1,64],object_score:[1]}}} as const;
function model(value:unknown,role:keyof typeof shapes):InferenceSource{
 const s=inferenceSource(value as InferenceSource),expected=shapes[role];
 if(s.execution.allowCpuFallback||s.execution.precision!=='float32'||s.execution.temporal!=='stateless'||!['auto','directml','cuda','tensorrt'].includes(s.execution.provider))fail(role+'.execution','resident GPU-only F32 inference');
 for(const side of ['inputs','outputs'] as const){const names=Object.keys(expected[side]);if(s[side].map(v=>v.name).join(',')!==names.join(','))fail(role+'.'+side,'exact ordered tensor names');for(const t of s[side]){const shape=(expected[side] as Record<string,readonly number[]>)[t.name];if(t.dtype!=='float32'||t.layout!==(shape.length===4?'NCHW':'linear')||t.shape.join(',')!==shape.join(','))fail(role+'.'+t.name,'pinned profile F32 tensor shape/layout');}}
 return s;
}
export function parseVideoRotoBundle(value:unknown):VideoRotoBundle{
 const o=object(value,'bundle');fields(o,['version','profile','vision','seed','track','temporal','pointerProjectionWeight','pointerProjectionBias'],'bundle');
 if(o.version!==1||o.profile!=='sam2.1-base-plus-video-memory-f32-v1')fail('bundle.profile','known version 1 / sam2.1-base-plus-video-memory-f32-v1');
 return Object.freeze({version:1,profile:o.profile,vision:model(o.vision,'vision'),seed:model(o.seed,'seed'),track:model(o.track,'track'),temporal:array(o.temporal,448,'temporal'),pointerProjectionWeight:array(o.pointerProjectionWeight,16384,'pointerProjectionWeight'),pointerProjectionBias:array(o.pointerProjectionBias,64,'pointerProjectionBias')});
}
export function validateOptions(value:VideoRotoOptions){
 const o=object(value,'options');fields(o,['id','seedFrame','frame','totalFrames','seedMask','maxReplayFrames','segmentFrames','threshold','softness','analysisBackground','format','signal'],'options');
 if(typeof o.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,47}$/.test(o.id))fail('id','a stable 1..48 ASCII identity');
 for(const k of ['seedFrame','frame','totalFrames','maxReplayFrames'] as const){const v=o[k]??(k==='maxReplayFrames'?300:undefined);if(!Number.isSafeInteger(v)||(v as number)<(k==='totalFrames'||k==='maxReplayFrames'?1:0)||(v as number)>0xffffffff)fail(k,'an exact unsigned frame index/work budget');}
 if(value.seedFrame>value.frame||value.frame>=value.totalFrames)fail('frame','seedFrame <= frame < totalFrames');
 if(value.frame-value.seedFrame+1>(value.maxReplayFrames??300))throw new EngineError('E_VIDEO_ROTO_BUDGET','Requested replay exceeds caller maxReplayFrames; increase the explicit work budget or query a nearer authored conditioning frame');
 if(value.segmentFrames!==undefined&&(!Number.isSafeInteger(value.segmentFrames)||value.segmentFrames<0||value.segmentFrames>0xffffffff))fail('segmentFrames','zero or a positive unsigned observed-frame submission interval');
 for(const [k,d,min] of [['threshold',0,-80],['softness',0,0]] as const){const v=value[k]??d;if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>80||v<min)fail(k,'finite supported logit control');}
 if(value.analysisBackground)array(value.analysisBackground,3,'analysisBackground');
 if(value.format!==undefined&&!['rgba16float','rgba32float'].includes(value.format))fail('format','rgba16float | rgba32float');
 if(value.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Video segmentation cancelled before recording');
 return value;
}
/** Metadata only. No GPU tensors, hidden snapshots or invented observations. */
export function memoryPlan(frame:number,seedFrame:number,memories:readonly(number|undefined)[],pointers:readonly(number|undefined)[],totalFrames:number){
 if(memories.length!==7||pointers.length!==16||memories[0]!==seedFrame||pointers[0]!==seedFrame)fail('memory','seven spatial and sixteen pointer slots with retained conditioning anchor');
 const words=new Uint32Array(64),f=new Float32Array(words.buffer),denominator=Math.max(1,Math.min(totalFrames,16)-1);
 memories.forEach((v,i)=>{if(v===undefined)return;const age=frame-v;if(i===0)words[i]=7;else if(age>=1&&age<=6)words[i]=age;});
 pointers.forEach((v,i)=>{if(v===undefined||v>=frame)return;words[7+i]=1;f[24+i]=(frame-v)/denominator;});
 return words;
}
