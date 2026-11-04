import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {nativePixelShader} from '../../gpu-effects/pixel-shader.ts';
import raw from '../closure-filters/fixtures/processors.json';
import type {OcioDefinition} from '../closure-filters/types.ts';
const output=resolve(process.env.FRAMEWEAVE_CLOSURE_IMAGE_RUN!);
for(const d of raw as OcioDefinition[]){const source=nativePixelShader(d.kernel);await writeFile(join(output,d.operation+'.wgsl'),source);const p=spawnSync(resolve('.frameweave/ocio-target/release/frameweave-ocio-wgsl.exe'),[],{input:JSON.stringify({validateWgsl:source}),encoding:'utf8',windowsHide:true});if(p.status!==0)throw Error(d.operation+': '+p.stderr);}
console.log(JSON.stringify({ok:true,method:'Naga actual parser and IR validation, full existing native Pixel shader',processors:4}));
