import {mkdir,writeFile,readdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import {execFileSync} from 'node:child_process';
import {buildProject} from '../../../../src/compiler/build.ts';import {NativeLogicHost} from '../../../native-gpu/logic-host.ts';
const root=resolve('.frameweave/c2-shader');await mkdir(root,{recursive:true});
const compiled=await buildProject('modules/spatial-creation/validation/coverage-round2/fixture.tsx',{outputDir:join(root,'compiled')}),host=new NativeLogicHost(undefined,compiled,'',96,64,20000);
let source:string;try{await host.init();const r=await host.record(0),program=r.program.kernels.find(k=>k.code.includes('fn pm_sample'));if(!program)throw Error('Actual recorded property-map shader missing');source=program.code;}finally{await host.close();}
await writeFile(join(root,'property-map.wgsl'),source!);await writeFile(join(process.env.CREATION_EVIDENCE!,'failed-02-property-map.wgsl'),source!);
const deps=resolve('.frameweave/naga-library-target/debug/deps'),library=(await readdir(deps)).find(n=>/^libnaga-[a-f0-9]+\.rlib$/.test(n));if(!library)throw Error('Pinned built Naga dependency missing');
execFileSync(process.env.RUSTC??'C:/Users/ASUS/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe',['--edition=2021','modules/spatial-creation/validation/coverage-round2/validate-shader.rs','--extern','naga='+join(deps,library),'-L','dependency='+deps,'-o',join(root,'validate-shader.exe')],{stdio:'inherit',windowsHide:true});
execFileSync(join(root,'validate-shader.exe'),[join(root,'property-map.wgsl')],{stdio:'inherit',windowsHide:true});
