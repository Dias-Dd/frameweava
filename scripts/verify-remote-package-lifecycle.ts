import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,lstat,cp,copyFile,statfs} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {packagesCLI} from '../src/packages/cli.ts';
import {installedPackages,restorePackages} from '../src/packages/manager.ts';
import {programLibraryDirectory} from '../src/packages/program-library.ts';

const proof=resolve(process.argv[2]??'.frameweave/remote-lifecycle/run-'+Date.now());
await mkdir(dirname(proof),{recursive:true});await mkdir(proof);process.env.FRAMEWEAVE_HOME=join(proof,'home');
const started=performance.now(),library=programLibraryDirectory(),exec=promisify(execFile);
const steps:any[]=[];let baseline:Awaited<ReturnType<typeof installedPackages>>|undefined,restored=false;
async function footprint(folder:string){let bytes=0,files=0;try{for(const entry of await readdir(folder,{withFileTypes:true})){const file=join(folder,entry.name),info=await lstat(file);assert.ok(!info.isSymbolicLink(),'No links in tested Store');if(entry.isDirectory()){const child=await footprint(file);bytes+=child.bytes;files+=child.files;}else{bytes+=info.size;files++;}}}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}return {bytes,files};}
async function snapshot(label:string,result?:unknown){const state=await installedPackages(library),volume=await statfs(library).catch(()=>undefined);const item={label,count:state.records.length,roots:state.lock?.roots??{},store:await footprint(state.store),volumeFreeBytes:volume?Number(volume.bavail)*Number(volume.bsize):null,result};steps.push(item);await writeFile(join(proof,'progress.json'),JSON.stringify({library,steps},null,2));console.log(JSON.stringify({label,count:item.count,bytes:item.store.bytes,result}));return item;}
async function cli(args:string[]){return packagesCLI(args) as Promise<any>;}
const index=JSON.parse(await readFile('registry/index.json','utf8'));
const trust=[...new Set(index.packages.map((p:any)=>'local:'+p.manifest.source.authority))] as string[];
const all=['install','pro-animation@1.1.0','--add','deep-image@0.1.0','--add','sparse-volume@0.1.0','--add','pro-animation-native@0.2.3',...trust.flatMap(s=>['--trust',s])];
const initial=await installedPackages(library);await writeFile(join(proof,'initial-state.json'),JSON.stringify({library,config:initial.config,lock:initial.lock,packages:initial.records.map(r=>({reference:r.manifest.id+'@'+r.manifest.version,integrity:r.integrity}))},null,2));
if(initial.records.length)await cp(library,join(proof,'original-backup'),{recursive:true,force:false,errorOnExist:true});
try{
  await snapshot('initial');
  const installed=await cli(all);assert.equal(installed.installed.length,11);
  const previous=new Set(initial.records.map(r=>r.manifest.id+'@'+r.manifest.version));
  assert.deepEqual(installed.remote.downloaded,[...installed.installed].filter((ref:string)=>!previous.has(ref)).sort());
  const full=await snapshot('all-installed-from-GitHub',installed);baseline=await installedPackages(library);
  await cp(library,join(proof,'baseline-backup'),{recursive:true,force:false,errorOnExist:true});
  const locked=JSON.stringify(baseline.lock);await assert.rejects(cli(['uninstall','frameweave.motion']),{code:'E_PACKAGE_DEPENDENT'});assert.equal(JSON.stringify((await installedPackages(library)).lock),locked);
  await snapshot('shared-dependency-removal-refused');
  const removed=await cli(['uninstall','deep-image','sparse-volume']);const few=await snapshot('two-libraries-removed',removed);assert.equal(few.count,9);assert.ok(removed.freedBytes>0);
  const one=await cli(['install','deep-image@0.1.0']);assert.deepEqual(one.remote.downloaded,['deep-image@0.1.0']);assert.equal(one.remote.transferredBytes,11690);
  const single=await snapshot('one-library-reinstalled',one);assert.equal(single.count,10);
  const emptied=await cli(['uninstall','--all']);const empty=await snapshot('all-libraries-removed',emptied);assert.equal(empty.count,0);assert.equal(empty.store.bytes,0);assert.equal(empty.store.files,0);assert.equal(emptied.freedBytes,single.store.bytes);
  const scratch=join(proof,'basic');await mkdir(scratch);const starter=join(scratch,'starter');
  const command=async(args:string[],name:string)=>{const r=await exec(process.execPath,['--import','tsx','src/cli.ts',...args,'--json'],{windowsHide:true,timeout:60000,maxBuffer:4*1024**2});await writeFile(join(proof,name+'.json'),r.stdout);return JSON.parse(r.stdout);};
  await command(['init',starter],'core-init');
  await command(['frame',join(starter,'project.tsx'),'--frame','0','--width','160','--height','90','--output',join(scratch,'core.png')],'core-frame');
  const pixels=await sharp(join(scratch,'core.png')).raw().toBuffer({resolveWithObject:true});assert.equal(pixels.info.width,160);assert.equal(pixels.info.height,90);assert.ok(pixels.data.some(v=>v>0));
  await copyFile('examples/creation/audio.tsx',join(scratch,'audio.tsx'));
  await command(['create',join(scratch,'audio.tsx'),'--output',join(scratch,'core.wav')],'core-audio');
  const probe=await exec('ffprobe',['-v','error','-show_entries','stream=codec_type,sample_rate,channels:format=duration','-of','json',join(scratch,'core.wav')],{windowsHide:true});const audio=JSON.parse(probe.stdout);assert.ok(audio.streams.some((s:any)=>s.codec_type==='audio'&&s.sample_rate==='48000'));
  await exec('ffmpeg',['-v','error','-xerror','-i',join(scratch,'core.wav'),'-f','null','-'],{windowsHide:true,timeout:15000});await writeFile(join(proof,'core-audio-probe.json'),probe.stdout);
  await snapshot('basic-PNG-and-decoded-WAV-with-zero-packages');
  const final=await cli(all);await snapshot('all-libraries-restored-from-GitHub',final);assert.deepEqual((await installedPackages(library)).lock,baseline.lock);
  assert.equal((await cli(['verify'])).valid,true);restored=true;
  const scratchCache=await footprint(join(process.env.FRAMEWEAVE_HOME!,'cache/runtime/remote-packages'));assert.equal(scratchCache.bytes,0);
  const result={ok:true,library,initialCount:initial.records.length,finalCount:11,steps,allRestored:true,temporaryDownloads:scratchCache,elapsedMs:performance.now()-started};
  await writeFile(join(proof,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,elapsedMs:result.elapsedMs,finalCount:11}));
}finally{
  if(!restored&&baseline){
    // Recovery uses the exact verified backup, never edited integrity fields.
    await mkdir(library,{recursive:true});for(const file of ['frameweave.packages.json','frameweave.packages.lock.json'])await copyFile(join(proof,'baseline-backup',file),join(library,file));
    const catalogs=baseline.records.map(r=>join(proof,'baseline-backup',r.directory.slice(library.length)));
    const recovery=await restorePackages(library,catalogs);await writeFile(join(proof,'recovery.json'),JSON.stringify(recovery,null,2));
  }
}
