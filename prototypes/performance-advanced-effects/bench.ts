import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {cpus,release,totalmem} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {buildProject} from '../../src/compiler/build.ts';
import {Renderer} from '../../src/render/renderer.ts';
import {frameContext} from '../../src/core/time.ts';
import {pixelsFromSurface,linear709,srgb,type ProfessionalSurface} from '../../src/media/surface.ts';
import {NativeGpuClient} from '../../modules/native-gpu/client.ts';
import type {NativeProgram} from '../../modules/native-gpu/client.ts';
import {nativePixelShader} from '../../modules/gpu-effects/pixel-shader.ts';
import {RecipeRecorder} from './record.ts';
import {recipe,names} from './recipe.ts';
import type {PerformanceEvent} from '../../src/render/performance.ts';
import type {BuiltProject} from '../../src/core/types.ts';

const root=resolve('.'),out=resolve('artifacts/performance-advanced-effects/v1');
process.env.FRAMEWEAVE_HOME=resolve('.frameweave/ap');await mkdir(out,{recursive:true});
const git=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const files=['prototypes/performance-advanced-effects/recipe.ts','prototypes/performance-advanced-effects/record.ts','prototypes/performance-advanced-effects/stage.ts','prototypes/performance-advanced-effects/field-stage.ts','prototypes/performance-advanced-effects/bench.ts',
 'modules/spatial-vfx/index.ts','modules/spatial-vfx/shaders.ts','modules/spatial-compute/index.ts','modules/spatial-compute/kernels.ts',
 'modules/gpu-image-effects/resident/creative/filters.ts','modules/gpu-image-effects/resident/creative/kernels.ts',
 'modules/gpu-effects/pixel-effects.ts','modules/gpu-effects/pixel-scope.ts','modules/gpu-effects/pixel-shader.ts','modules/native-gpu/client.ts','src/render/renderer.ts'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
const cases=[
 {id:'reference',kind:'mix',width:64,height:36,frames:2,reference:true},
 {id:'mix-540p',kind:'mix',width:960,height:540,frames:24},
 {id:'mix-1080p',kind:'mix',width:1920,height:1080,frames:24},
 {id:'mix-4k',kind:'mix',width:3840,height:2160,frames:8},
 {id:'field-540p',kind:'field',width:960,height:540,frames:12},
 {id:'field-1080p',kind:'field',width:1920,height:1080,frames:12},
];
type Prepared={version:1;hashes:Record<string,string>;cases:(typeof cases[number]&{build:BuiltProject;compileMs:number;nativePlan?:NativeProgram;nativePlanSha256?:string;wgslSha256?:string[];webBytes:Record<string,string>})[]};
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function distribution(values:number[]){
 const a=[...values].sort((a,b)=>a-b),n=a.length;
 return {n,medianMs:n%2?a[Math.floor(n/2)]:(a[n/2-1]+a[n/2])/2,p95Ms:a[Math.ceil(n*.95)-1],minMs:a[0],maxMs:a.at(-1),smallTailSample:n<20};
}
async function tape(build:BuiltProject,frame:number,r:RecipeRecorder){
 r.reset();const c=frameContext(build.manifest,build.manifest.stages[0],frame);
 const image=await recipe(r.api,c,build.manifest.composition.width,build.manifest.composition.height);await image.release();
 return r.parameters;
}
if(process.argv.includes('--prepare')){
 const prepared:Prepared={version:1,hashes:await hashes(),cases:[]};
 for(const c of cases){
  const entry=join(out,c.id+'.tsx'),stage=join(root,'prototypes/performance-advanced-effects',c.kind==='mix'?'stage.ts':'field-stage.ts');
  await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';export default <Composition width={${c.width}} height={${c.height}} fps={24} durationInFrames={120} seed={51} background="transparent"><Stage id="image" entry={${JSON.stringify(stage)}} outputs={{surface:'surface',metrics:'json'}} seek="stateless"/><Layer source={ref('image')}/></Composition>;`);
  const t=performance.now(),build=await buildProject(entry,{outputDir:join(out,'build-'+c.id)}),compileMs=performance.now()-t;
  let nativePlan:NativeProgram|undefined;
  if(c.kind==='mix'){
   const r=new RecipeRecorder();await tape(build,0,r);const p=r.program();
   nativePlan=p;
   if(p.passes.length!==12)throw Error('Frozen workload no longer has 12 logical passes');
   await tape(build,7,r);if(r.passes.length!==12)throw Error('Time changed pass layout');
  }
  const webFiles=[...Object.values(build.stageBundles).map(f=>join(build.dir,f)),...Object.values(build.assets)];
  const webBytes=Object.fromEntries(await Promise.all(webFiles.map(async f=>[relative(root,f).replaceAll('\\','/'),digest(await readFile(f))])));
  prepared.cases.push({...c,build,compileMs,webBytes,...nativePlan?{nativePlan,nativePlanSha256:digest(JSON.stringify(nativePlan)),wgslSha256:nativePlan.kernels.map(k=>digest(k.code))}:{}});
 }
 await writeFile(join(out,'prepared.json'),JSON.stringify(prepared));console.log(JSON.stringify({version:1,prepared:out,cases:prepared.cases.map(c=>({id:c.id,compileMs:c.compileMs}))}));process.exit(0);
}
const prepared=JSON.parse(await readFile(join(out,'prepared.json'),'utf8')) as Prepared;
if(!process.env.FRAMEWEAVE_GPU_WINDOW)throw Error('GPU run requires an explicitly coordinated FRAMEWEAVE_GPU_WINDOW');
if(JSON.stringify(await hashes())!==JSON.stringify(prepared.hashes))throw Error('Prepared source changed');
for(const c of prepared.cases){
 for(const [file,sha]of Object.entries(c.webBytes))if(digest(await readFile(file))!==sha)throw Error('Prepared Web bytes changed: '+file);
 if(c.nativePlan&&digest(JSON.stringify(c.nativePlan))!==c.nativePlanSha256)throw Error('Prepared native plan changed');
}
const selected=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
const report:any={version:1,workload:'advanced-effects/1',sourceCommit:git(),sourceHashes:prepared.hashes,names,gpuWindow:process.env.FRAMEWEAVE_GPU_WINDOW,
 preparedSha256:digest(await readFile(join(out,'prepared.json'))),binaryReceipts:{},
 environment:{platform:process.platform,release:release(),node:process.version,cpu:cpus()[0]?.model,ram:totalmem(),physicalVramPeak:null,
  powerPlan:process.platform==='win32'?execFileSync('powercfg',['/getactivescheme'],{encoding:'utf8'}).trim():null},
 contracts:{format:'rgba32float',color:linear709,alpha:'premultiplied',raySteps:32,smokeOctaves:3,fieldGrid:[32,32,32],fieldRaySteps:64,cache:false,
  nativeScope:'Same effect recipe runs actual Rust/wgpu command tape; headless GPU completion including Node recording/IPC. No native UI/PNG/Renderer claim.',
  webScope:'Real TSX -> current Renderer -> hardware WebGPU -> final floating readback/transfer -> CPU identity compositor -> explicit SDR PNG.',
  nativeVsWebWallSpeedupClaim:false},cases:[],ok:false};
let activeRenderer:Renderer|undefined,activeNative:NativeGpuClient|undefined,stopped=false;
const stop=()=>{stopped=true;void activeRenderer?.close();void activeNative?.close();};
const watchdog=setTimeout(stop,170000);watchdog.unref();process.once('SIGINT',stop);process.once('SIGTERM',stop);
const t0=performance.now();
try{
 for(const config of prepared.cases.filter(c=>!selected||c.id===selected)){
  if(stopped)throw Error('Deadline/interruption');
  const result:any={id:config.id,width:config.width,height:config.height,compileMs:config.compileMs,web:[],native:[]};report.cases.push(result);
  const events:PerformanceEvent[]=[],t=performance.now();
  const renderer=await Renderer.create(config.build,{preview:true,cache:false,allowWasm:false,timeoutMs:30000,
   media:{workingColor:linear709,transport:'buffer-v1',preview:{color:srgb,clip:true}},onProfile:e=>events.push(e)});
  activeRenderer=renderer;result.webInitMs=performance.now()-t;let reference:Float32Array|undefined;
  try{
   for(let frame=0;frame<config.frames;frame++){
    if(stopped)throw Error('Deadline/interruption');events.length=0;const begin=performance.now();
    if(config.reference){
     const value=await renderer.evaluateFrame(frame),wallMs=performance.now()-begin;
     if(frame===1)reference=pixelsFromSurface(value.stageOutputs.image.surface as ProfessionalSurface);
     result.web.push({frame,wallMs,metrics:value.stageOutputs.image.metrics,phases:events.splice(0)});
    }else{
     const value=await renderer.renderFrame(frame),wallMs=performance.now()-begin;
     if(value.cacheHits!==0)throw Error('New frame hit cache');
     result.web.push({frame,wallMs,metrics:value.stageOutputs.image.metrics,phases:events.splice(0),pngBytes:value.png.length});
     if(frame===config.frames-1){
      const file=join(out,config.id+'.png');await writeFile(file,value.png);
      const decoded=await sharp(value.png).raw().toBuffer({resolveWithObject:true});
      if(decoded.info.width!==config.width||decoded.info.height!==config.height)throw Error('Wrong PNG dimensions');
     }
    }
   }
  }finally{await renderer.close();activeRenderer=undefined;}
  result.webWarmPng=distribution(result.web.slice(1).map((r:any)=>r.wallMs));
  result.webWarmComputeAndValidation=distribution(result.web.slice(1).map((r:any)=>(r.metrics as any).computeAndValidationMs));
  if(config.kind==='mix'){
   const recorder=new RecipeRecorder();await tape(config.build,0,recorder);
   const program=config.nativePlan!,profile=config.reference?'debug':'release',exe=resolve('.frameweave/native-target',profile,'frameweave-native-gpu.exe');
   const receipt=JSON.parse(await readFile(resolve('.frameweave/native-target',profile,'native-build.json'),'utf8'));
   if(digest(await readFile(exe))!==receipt.executable.sha256)throw Error('Native binary changed');
   for(const [file,sha]of Object.entries(receipt.inputHashes))if(digest(await readFile(join(root,'modules/native-gpu',file)))!==sha)throw Error('Native build inputs changed: '+file);
   report.binaryReceipts[profile]=receipt;
   result.nativePlannedImageBytes=program.images.reduce((n,i)=>n+i.width*i.height*16,0)*program.slots;
   const begin=performance.now(),native=await NativeGpuClient.create(program,{executable:exe,timeoutMs:30000});
   activeNative=native;result.nativeInitMs=performance.now()-begin;
   try{
    for(const mode of config.reference?['sequential']:['sequential','pipelined']){
     const rows:any[]=[],completions:Promise<void>[]=[],start=performance.now();
     for(let frame=0;frame<config.frames;frame++){
      if(stopped)throw Error('Deadline/interruption');const call=performance.now();
      const words=await tape(config.build,frame,recorder),recordMs=performance.now()-call;
      const ticket=await native.submit(frame,words),row:any={frame,recordMs,submitMs:performance.now()-call,slot:ticket.slot};rows.push(row);
      const done=ticket.completed.then(()=>{row.completeMs=performance.now()-call;});completions.push(done);
      if(mode==='sequential')await done;
     }
     await Promise.all(completions);
     result.native.push({mode,rows,elapsedMs:performance.now()-start,warmComplete:distribution(rows.slice(1).map(r=>r.completeMs)),
      warmRecord:distribution(rows.slice(1).map(r=>r.recordMs)),allFramesPerSecond:config.frames/(performance.now()-start)*1000});
    }
    result.nativeStats=await native.stats();
    if(config.reference){
     const slot=result.native[0].rows.at(-1).slot,{pixels}=await native.inspectForTest(slot,program.images.length-1);
     if(!reference||pixels.length!==reference.length)throw Error('Reference shape mismatch');
     let maxAbs=0,maxRelative=0,overTolerance=0,min=Infinity,max=-Infinity;
     for(let i=0;i<pixels.length;i++){const d=Math.abs(pixels[i]-reference[i]);maxAbs=Math.max(maxAbs,d);maxRelative=Math.max(maxRelative,d/Math.max(1,Math.abs(reference[i])));if(d>1e-4+2e-4*Math.abs(reference[i]))overTolerance++;min=Math.min(min,pixels[i]);max=Math.max(max,pixels[i]);}
     result.comparison={components:pixels.length,maxAbs,maxRelative,overTolerance,min,max,absoluteTolerance:1e-4,relativeTolerance:2e-4};
     if(overTolerance)throw Error('Native/Web actual recipe comparison failed: '+JSON.stringify(result.comparison));
    }
   }finally{await native.close();activeNative=undefined;}
  }else{
   try{nativePixelShader({abiVersion:2,id:'qualification/data',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'}],parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(data0(0u));}'});throw Error('ABI2 unexpectedly qualified');}
   catch(e){if((e as any).code!=='E_GPU_PIXEL_CONTRACT')throw e;result.nativeIneligible={code:(e as any).code,reason:String((e as Error).message)};}
  }
  console.log(JSON.stringify({case:config.id,webPng:result.webWarmPng,webComputeAndValidation:result.webWarmComputeAndValidation,
   native:result.native.map((r:any)=>({mode:r.mode,complete:r.warmComplete,fps:r.allFramesPerSecond})),comparison:result.comparison,nativeIneligible:result.nativeIneligible}));
  await writeFile(join(out,selected?'report-'+selected+'.json':'report.json'),JSON.stringify(report,null,2));
 }
 report.ok=true;
}catch(e){report.error={code:(e as any).code,message:(e as Error).message};throw e;}
finally{
 clearTimeout(watchdog);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
 report.wallMs=performance.now()-t0;report.sourceUnchanged=JSON.stringify(await hashes())===JSON.stringify(prepared.hashes);
 await writeFile(join(out,selected?'report-'+selected+'.json':'report.json'),JSON.stringify(report,null,2));
}
