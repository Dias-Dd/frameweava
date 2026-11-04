import {writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'../../..'),out=join(root,'.frameweave/pa3-upstream');await mkdir(out,{recursive:true});
await writeFile(join(out,'type-general.ts'),`import {createNativeManagedTimeEffects,type NativeManagedTimeBinding} from '../../modules/pro-animation/src/native-time/managed.ts';
import type {NativeTimeEnvironment} from '../../modules/pro-animation/src/native-time/types.ts';import type {FrameContext} from '../../src/core/types.ts';
import type {NativeTemporalStage,NativeTemporalSourceBinding,NativeTemporalBinding,NativeTemporalCancellationSignal} from './core-general-f36/modules/native-gpu/temporal-types.ts';
declare const e:NativeTimeEnvironment,c:FrameContext,source:NativeTemporalSourceBinding,prefix:NativeTemporalBinding,token:NativeTemporalCancellationSignal,temporal:NativeTemporalStage;
declare const legacy:NativeManagedTimeBinding;const requiredLegacyPackageRef:string=legacy.info.packageRef;
const a=createNativeManagedTimeEffects(e,source),old=createNativeManagedTimeEffects(e,prefix);a.shutterBlur({count:3,format:'rgba16float'},c,{signal:token});old.retime({},c,{parameters:[[1]]});
const profile:'declared-input-v1'|'declared-resource-v1'=a.sourceInfo.profile;const exact:'native-pixel-prefix-v1'=old.sourceInfo.profile;
temporal.bindSource({version:1,profile:'declared-input-v1',input:'image',clock:'consumer-local'});
// @ts-expect-error Opaque Core token cannot be forged.
a.echo({},c,{signal:{version:1}});
// @ts-expect-error Actual Core window shape is retained, no private cache option.
a.retime({},c,{cache:true});
// @ts-expect-error Existing time effect parameters stay checked.
a.shutterBlur({count:'three'},c);
// @ts-expect-error Declared source mode is not an arbitrary callback/Stage ID.
temporal.bindSource({version:1,profile:'callback',source:()=>null});
`);
await writeFile(join(out,'type-general.json'),JSON.stringify({extends:join(root,'tsconfig.json'),include:[join(out,'type-general.ts')],exclude:[join(root,'node_modules')]}));const r=spawnSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--pretty','false','-p',join(out,'type-general.json')],{cwd:root,windowsHide:true,encoding:'utf8'});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');process.exitCode=r.status??1;
