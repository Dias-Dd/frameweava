import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,resolve,join,isAbsolute,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {EngineError,diagnostic} from '../core/errors.ts';
import {userLibraryHome} from '../plugins/paths.ts';
import {runtimeCachePath} from './paths.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export async function distributionVersion():Promise<string>{return JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;}
/** An inventory detects missing/modified release files; npm's tarball integrity remains the trust source. */
export async function verifyDistribution(){
  let inventory:{schemaVersion:number;algorithm:string;files:Record<string,string>};
  try{inventory=JSON.parse(await readFile(join(root,'distribution.json'),'utf8'));}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {kind:'source-checkout',verified:false,files:0};throw e;}
  if(inventory.schemaVersion!==1||inventory.algorithm!=='sha256'||!inventory.files||typeof inventory.files!=='object')throw new EngineError('E_DISTRIBUTION_INTEGRITY','Invalid release inventory');
  for(const [file,hash]of Object.entries(inventory.files)){
    const target=resolve(root,file),r=relative(root,target);
    if(isAbsolute(file)||r.startsWith('..')||!r||!/^[a-f0-9]{64}$/.test(hash))throw new EngineError('E_DISTRIBUTION_INTEGRITY','Unsafe release inventory entry');
    let bytes:Buffer;try{bytes=await readFile(target);}catch{throw new EngineError('E_DISTRIBUTION_INTEGRITY',`Missing release file: ${file}`);}
    if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new EngineError('E_DISTRIBUTION_INTEGRITY',`Modified release file: ${file}`);
  }
  return {kind:'npm-release',verified:true,files:Object.keys(inventory.files).length};
}
export async function distributionDoctor(){
  const distribution=await verifyDistribution(),{runtimePin}=await import('../compiler/runtime-lock.ts');
  const {ffmpegPath}=await import('../encoding/ffmpeg.ts');
  const ffmpeg=ffmpegPath();await access(ffmpeg);
  const home=userLibraryHome(),modelPath=join(home,'models','Xenova','paraphrase-multilingual-MiniLM-L12-v2','2c4055b12046f11709e9df2c122e59ffbdc2f900','onnx','model_quantized.onnx');
  return {version:await distributionVersion(),node:process.version,platform:process.platform,arch:process.arch,distribution,runtimePin,
    paths:{installation:root,home,cache:runtimeCachePath(),ffmpeg,tsxLoader:import.meta.resolve('tsx/esm')},runtime:{logicHost:'spidermonkey',mediaBackend:'native-wgpu',htmlRenderer:'servo-optional'},
    windowsModelPath:{path:modelPath,length:modelPath.length,risk:process.platform==='win32'&&modelPath.length>=260,
      advice:'Set FRAMEWEAVE_HOME to a short writable absolute path before provisioning models (for example C:\\fw-home). Existing caches are not moved and all hashes remain required.'},
    optionalAnalysis:{faceTracking:'The former Chromium face adapter was removed. A Native/Servo adapter is not implemented; analyze list reports it unavailable.'}};
}
