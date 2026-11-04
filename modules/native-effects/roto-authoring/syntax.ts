import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {nativePixelShader} from '../../gpu-effects/pixel-shader.ts';
import {nativeComputeShader} from '../../gpu-effects/compute-shader.ts';
import type {GpuPixelKernelSource} from '../../gpu-effects/pixel-types.ts';
import type {GpuComputeKernelSource} from '../../gpu-effects/compute-types.ts';
import * as pixels from './kernels.ts';import * as contours from './contour-kernels.ts';import * as neural from './neural-kernels.ts';
import * as cc from './contour-compute.ts';import * as pc from './paint-compute.ts';import * as nc from './neural-compute.ts';
const dir=resolve(process.env.FRAMEWEAVE_ROTO_AUTHORING_RUN!),errors:object[]=[];let count=0;
async function check(name:string,code:string){await writeFile(join(dir,name+'.wgsl'),code);const p=spawnSync(resolve('.frameweave/ocio-target/release/frameweave-ocio-wgsl.exe'),[],{input:JSON.stringify({validateWgsl:code}),encoding:'utf8',windowsHide:true});if(p.status!==0)errors.push({name,error:p.stderr});count++;}
for(const [name,k]of Object.entries({...pixels,...contours,...neural}))if(typeof k==='object')await check(name,nativePixelShader(k as GpuPixelKernelSource));
for(const [name,k]of Object.entries({...cc,...pc,...nc}))if(typeof k==='object')await check(name,nativeComputeShader(k as GpuComputeKernelSource));
if(errors.length)throw Error(JSON.stringify(errors));console.log(JSON.stringify({ok:true,count,method:'Naga complete shader syntax and IR; not GPU/model execution'}));
