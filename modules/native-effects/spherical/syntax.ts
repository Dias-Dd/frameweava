import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {nativePixelShader} from '../../gpu-effects/pixel-shader.ts';
import {nativeComputeShader} from '../../gpu-effects/compute-shader.ts';
import {neighborhood,combine,effects,specialize,latitudeLookup,glitchNoise} from './kernels.ts';
const out=resolve(process.env.FRAMEWEAVE_SPHERICAL_RUN!);
for(const [name,kernel]of Object.entries({combine,...Object.fromEntries([0,1,2].map(i=>['neighborhood-'+i,specialize(neighborhood,i)])),...Object.fromEntries([0,1,2,3,4,5].map(i=>['effects-'+i,specialize(effects,i,0,0,true)])),...Object.fromEntries(Array.from({length:8},(_,i)=>['input-'+i,specialize(effects,0,i,0,true)])),...Object.fromEntries(Array.from({length:8},(_,i)=>['output-'+i,specialize(effects,0,0,i,true)]))})){
 const code=nativePixelShader(kernel);await writeFile(join(out,name+'.wgsl'),code);
 const result=spawnSync(resolve('.frameweave/ocio-target/release/frameweave-ocio-wgsl.exe'),[],{input:JSON.stringify({validateWgsl:code}),encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw Error(name+': '+result.stderr);
}
for(const [name,kernel]of Object.entries({latitudeLookup,glitchNoise})){const code=nativeComputeShader(kernel);await writeFile(join(out,name+'.wgsl'),code);const result=spawnSync(resolve('.frameweave/ocio-target/release/frameweave-ocio-wgsl.exe'),[],{input:JSON.stringify({validateWgsl:code}),encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(name+': '+result.stderr);}
console.log(JSON.stringify({ok:true,pixelVariants:26,computeKernels:2}));
