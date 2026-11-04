// One bounded run. SUCCESS terminates this process; there is no watch/retry loop.
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2),full=args.includes('--full'),colorTexture=args.includes('--color-texture'),pa=args.includes('--pa'),mesh=args.includes('--mesh'),nativeAdmission=args.includes('--native-admission'),imageAdmission=args.includes('--image-admission');
if(args.includes('--help')){console.log('node scripts/verify-main.mjs [--full] [--color-texture] [--pa] [--mesh] [--native-admission] [--image-admission] [--only comma-separated-jobs] [--timeout seconds]\nDefault: types + focused unit tests + source R1/Native GPU/PNG/F16/F32 EXR/permission checks.\n--color-texture adds native color/mesh numerical checks and real PNG/EXR/MP4 (requires a matching debug binary).\n--full adds MP4, shipped example and Flat/Capsule. It does not replace npm installation or full-repository qualification.\nTimeout is a cumulative child-process time budget; SUCCESS exits immediately.');process.exit(0);}
let only;let budget=full||pa||mesh?180:colorTexture?120:90;for(let i=0;i<args.length;i++){if(['--full','--color-texture','--pa','--mesh','--native-admission','--image-admission'].includes(args[i]))continue;if(args[i]==='--only'){only=args[++i]?.split(',');continue;}if(args[i]==='--timeout'){budget=Number(args[++i]);continue;}throw Error('Unknown option: '+args[i]);}
if(!Number.isFinite(budget)||budget<5||budget>360)throw Error('--timeout must be 5..360 seconds');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=join(root,'artifacts/main-checks',String(Date.now()));await mkdir(out,{recursive:true});
const started=performance.now(),source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
const env={...process.env,FRAMEWEAVE_TEST_COMMIT:source};
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';if(!env.FRAMEWEAVE_TEST_BROWSER&&existsSync(edge))env.FRAMEWEAVE_TEST_BROWSER=edge;
const specs=[
 ['types',['node_modules/typescript/bin/tsc','--noEmit','--pretty','false']],
 ['unit',['--import','tsx','--test','tests/native-effects.test.ts','tests/native-effects-package.test.ts','tests/native-raster.test.ts','tests/native-gpu-cancellation.test.ts','tests/native-borrow-lifetime.test.ts','tests/native-module.test.ts','tests/native-import-lifetime.test.ts','tests/spidermonkey-module-resources.test.ts','tests/spidermonkey-host.test.ts',...pa?['tests/native-pa-images.test.ts']:[]]],
 ['production',['--import','tsx','--test','tests/native-gpu-production.test.ts']],
 ['interfaces',['--import','tsx','scripts/verify-native-interfaces.ts']],
 ['native',['--import','tsx','scripts/verify-installed-native-images-v2.mjs','--source',...full?[]:['--quick']]],
 ...imageAdmission?[
  ['image-admission',['--import','tsx','--test','tests/native-image-admission.test.ts','tests/native-color-texture.test.ts','tests/native-mesh-transparency.test.ts']],
  ['image-media',['--import','tsx','modules/native-gpu/validation/verify-image-admission.ts']],
  ['cpu-color',['--import','tsx','--test','--test-name-pattern','binary16 known|linear Source-over|PQ absolute','tests/professional-media.test.ts']],
 ]:[],
 ...nativeAdmission?[
  ['graph-admission',['--import','tsx','--test','tests/native-graph-dimensions.test.ts','tests/core.test.ts','tests/audio-ports.test.ts']],
  ['graph-native-gpu',['--import','tsx','scripts/verify-native-graph-admission.ts']],
 ]:[],
 ...mesh?[
  ['mesh-numeric',['--import','tsx','--test','tests/native-mesh-transparency.test.ts']],
  ['mesh-media',['--import','tsx','modules/native-gpu/validation/verify-mesh-transparency.ts']],
 ]:[],
 ...pa?[
  ['pa-managed',['--import','tsx','scripts/verify-managed-native-pa.ts']],
  ['pa-numeric',['--import','tsx','modules/native-effects/pa/validate.ts','gpu']],
  ['pa-mean',['--import','tsx','modules/native-effects/pa/validate.ts','mean']],
 ]:[],
 ...colorTexture?[
  ['color-texture-numeric',['--import','tsx','--test','tests/native-color-texture.test.ts']],
  ['color-texture-media',['--import','tsx','scripts/verify-native-color-texture.ts']],
 ]:[],
];
const selected=only?specs.filter(([name])=>only.includes(name)):specs;if(!selected.length||only?.some(name=>!specs.some(([key])=>key===name)))throw Error('--only must name jobs in this profile');
const rows=[],running=new Set();let stopped=false,reason;
function stop(why){if(stopped)return;stopped=true;reason=why;for(const item of running){if(item.child.exitCode!==null)continue;if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(item.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else item.child.kill('SIGTERM');}}
const elapsed=()=>rows.reduce((n,r)=>n+r.seconds,0)+[...running].reduce((n,r)=>n+(performance.now()-r.start)/1000,0);
const timer=setInterval(()=>{if(elapsed()>=budget)stop('cumulative timeout');},100);
const signal=()=>stop('cancelled');process.once('SIGINT',signal);process.once('SIGTERM',signal);
async function run([name,argv]){
 const taskEnv=name==='pa-numeric'||name==='pa-mean'?{...env,FRAMEWEAVE_NATIVE_EFFECTS_RUN:join(out,name),FRAMEWEAVE_HOME:join(out,name,'home')}:env;
 const begin=performance.now(),child=spawn(process.execPath,argv,{cwd:root,env:taskEnv,windowsHide:true,stdio:['ignore','pipe','pipe']}),item={child,start:begin};running.add(item);let stdout='',stderr='';
 child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
 let error;const code=await new Promise(resolve=>{child.once('error',e=>{error=String(e);resolve(null);});child.once('close',resolve);});
 running.delete(item);const row={name,command:[process.execPath,...argv],code,error,seconds:(performance.now()-begin)/1000};rows.push(row);
 await Promise.all([writeFile(join(out,name+'.stdout.txt'),stdout),writeFile(join(out,name+'.stderr.txt'),stderr)]);
 if(code!==0||error)reason??=name+' failed';console.log(name+': '+(code===0?'PASS':'FAIL'));return row;
}
try{await Promise.all(selected.map(run));}finally{clearInterval(timer);process.off('SIGINT',signal);process.off('SIGTERM',signal);}
const success=!stopped&&rows.every(r=>r.code===0),result={status:success?'success':'failure',profile:imageAdmission?'native-image-admission-critical':nativeAdmission?'native-graph-admission-critical':mesh?'native-mesh-critical':pa?'native-pa-critical':colorTexture?'native-color-texture-critical':full?'full-native-images':'quick-critical-paths',source,selectedJobs:selected.map(([name])=>name),unselectedJobs:specs.filter(([name])=>!selected.some(([key])=>key===name)).map(([name])=>name),budgetSeconds:budget,cumulativeSeconds:rows.reduce((n,r)=>n+r.seconds,0),wallSeconds:(performance.now()-started)/1000,reason:reason??null,rows,artifacts:out,excluded:full?['npm build/install','whole repository','cross-platform']:['Flat/Capsule',...colorTexture||pa||mesh?[]:['MP4'],'full library numeric matrix','npm build/install','whole repository','cross-platform']};
await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
console.log(success?'SUCCESS':'FAIL');process.exitCode=success?0:1;
