import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {nativePixelShader} from '../../gpu-effects/pixel-shader.ts';
import {nativeComputeShader} from '../../gpu-effects/compute-shader.ts';
import * as pixels from './kernels.ts';
import * as compute from './compute.ts';
import {fixtureKernels} from './stage.ts';
const output=resolve(process.env.FRAMEWEAVE_PRO_KEY_RUN!);let count=0;const errors:object[]=[];
for(const [name,kernel]of Object.entries({...pixels,fixtureSource:fixtureKernels.source})){const code=nativePixelShader(kernel);await writeFile(join(output,name+'.wgsl'),code);const p=spawnSync(resolve('.frameweave/ocio-target/release/frameweave-ocio-wgsl.exe'),[],{input:JSON.stringify({validateWgsl:code}),encoding:'utf8',windowsHide:true});if(p.status!==0)errors.push({name,diagnostic:p.stderr});count++;}
for(const [name,kernel]of Object.entries({...compute,fixtureFlow:fixtureKernels.flow})){const code=nativeComputeShader(kernel);await writeFile(join(output,name+'.wgsl'),code);const p=spawnSync(resolve('.frameweave/ocio-target/release/frameweave-ocio-wgsl.exe'),[],{input:JSON.stringify({validateWgsl:code}),encoding:'utf8',windowsHide:true});if(p.status!==0)errors.push({name,diagnostic:p.stderr});count++;}
if(errors.length)throw Error(JSON.stringify(errors));
console.log(JSON.stringify({ok:true,count,method:'existing Naga full shader parse + IR validation; execution tested separately'}));
