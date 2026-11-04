import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {EngineError} from '../../src/core/errors.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');

/** Supply the installed Servo bundle to the owner, which verifies it on first use. */
export function nativeOwnerEnvironment():NodeJS.ProcessEnv{
 const env=process.env;
 if(process.platform!=='win32'||process.arch!=='x64'||env.FRAMEWEAVE_SERVO_RUNTIME!==undefined)return env;
 const runtime=join(root,'native-bin','win32-x64','servo');
 return existsSync(runtime)?{...env,FRAMEWEAVE_SERVO_RUNTIME:runtime}:env;
}

/** Load-time provenance only. This function is never called by a frame loop. */
export async function nativeExecutable(explicit?:string){
 const name='frameweave-native-gpu'+(process.platform==='win32'?'.exe':''),candidates=[explicit,process.env.FRAMEWEAVE_NATIVE_GPU,join(root,'native-bin',`${process.platform}-${process.arch}`,name),join(root,'.frameweave/native-target/release',name)];
 const file=candidates.find(p=>p&&existsSync(p));if(!file)throw new EngineError('E_NATIVE_GPU_MISSING','Native GPU backend is not installed',{hint:'Build explicitly with node modules/native-gpu/build.mjs --release, or install a package containing the native binary for this platform.'});
 const receipt=join(dirname(file),'native-build.json');let data:any;try{data=JSON.parse(await readFile(receipt,'utf8'));}catch{throw new EngineError('E_NATIVE_BINARY_INTEGRITY','Native executable requires its build provenance receipt');}
 if(data.features?.includes('diagnostics'))throw new EngineError('E_NATIVE_BINARY_PROFILE','CLI requires a production native binary; rebuild without --diagnostics');
 const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==data.executable?.sha256)throw new EngineError('E_NATIVE_BINARY_INTEGRITY','Native executable differs from its build receipt');
 return resolve(file);
}
