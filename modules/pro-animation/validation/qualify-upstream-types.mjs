// Compile directly against the frozen Core types; no locally invented cancellation brand.
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'../../..'),out=join(root,'.frameweave/pa3-upstream');await mkdir(out,{recursive:true});
await writeFile(join(out,'type-qualification.ts'),`import {createNativeManagedTimeEffects} from '../../modules/pro-animation/src/native-time/managed.ts';
import type {NativeTimeEnvironment} from '../../modules/pro-animation/src/native-time/types.ts';
import type {FrameContext} from '../../src/core/types.ts';
import type {NativeTemporalBinding,NativeTemporalCancellationSignal} from './core-c7685/modules/native-gpu/temporal-types.ts';
declare const environment:NativeTimeEnvironment,binding:NativeTemporalBinding,context:FrameContext,token:NativeTemporalCancellationSignal;
const time=createNativeManagedTimeEffects(environment,binding);
time.retime({},context,{signal:token,parameters:[[1],[{$expr:'frame',args:[]}]]});
time.timeCrossfade({progress:.5},context,{signal:token});
// @ts-expect-error Core cancellation brand cannot be forged by matching the visible version.
time.retime({},context,{signal:{version:1}});
// @ts-expect-error Core parameter rows remain numeric Signals, not arbitrary functions.
time.echo({},context,{parameters:[[()=>1]]});
// @ts-expect-error Core rejects options outside its declared window contract.
time.shutterBlur({},context,{cache:true});
// @ts-expect-error Original image operation parameters remain type-checked.
time.timeDifference({opacity:'bright'},context);
`);
await writeFile(join(out,'type-qualification.json'),JSON.stringify({extends:join(root,'tsconfig.json'),include:[join(out,'type-qualification.ts')],exclude:[join(root,'node_modules')]}));
const result=spawnSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--pretty','false','-p',join(out,'type-qualification.json')],{cwd:root,windowsHide:true,encoding:'utf8'});process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');process.exitCode=result.status??1;
