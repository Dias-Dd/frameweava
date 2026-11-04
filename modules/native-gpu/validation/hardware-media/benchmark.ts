/** v1: frozen two-Stage ACEScg project; same resolution, frames and encoder.
 * Measures entire exports. This small A/B is not a per-frame latency percentile. */
import {resolve,join} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';import {cpus,platform,release,totalmem} from 'node:os';import {execFileSync} from 'node:child_process';
import {buildProject} from '../../../../src/compiler/build.ts';import {renderNativeProject} from '../../service.ts';import {acescg,pq2020} from '../../../../src/media/surface.ts';import type {ProfessionalSettings} from '../../../../src/media/service.ts';
const root=resolve('artifacts/native-hardware-media/ab-'+Date.now());await mkdir(root,{recursive:true});
const entry=resolve('modules/native-gpu/examples/two-stage.tsx'),t=performance.now(),build=await buildProject(entry),compileMs=performance.now()-t;
const settings:ProfessionalSettings={schemaVersion:1,media:{workingColor:acescg},video:{preset:'hdr10',encoder:'hevc_nvenc',outputColor:pq2020,conversion:{kind:'ocio',clip:true,transform:{source:'ACEScg',display:'Rec.2100-PQ - Display',view:'ACES 2.0 - HDR 1000 nits (Rec.2020)'}},alpha:{mode:'flatten',matte:[0,0,0]},hdr10:{masteringDisplay:{red:[.708,.292],green:[.17,.797],blue:[.131,.046],white:[.3127,.329],minNits:.005,maxNits:1000},maxCLL:1000,maxFALL:400}}};
const results=[];
for(const [width,height,frames] of [[1920,1080,6],[3840,2160,4]])for(const backend of ['reference','gpu'] as const){
 if(process.argv.includes('--gpu-only')&&backend!=='gpu')continue;
 const output=join(root,width+'-'+backend+'.mp4'),begin=performance.now();const result=await renderNativeProject(entry,{build,native:resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),output,width,height,start:0,end:frames,maxBytes:1536*1024**2,maxConcurrency:2,initialConcurrency:2,professional:settings,professionalBackend:backend});const wallMs=performance.now()-begin;
 const row={width,height,frames,backend,wallMs,exportAverageMsPerFrame:wallMs/frames,exportFps:frames*1000/wallMs,result};results.push(row);await writeFile(join(root,'measurements.json'),JSON.stringify({version:1,compileMs,environment:{commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:true,node:process.version,os:platform()+' '+release(),cpu:cpus()[0].model,systemMemory:totalmem()},scope:'one cold owner/export per case, shader/decoder/filesystem caches are not flushed; identical new frame range, no repeat frame cache; P95 and peak memory not measured; 2 requested slots on GPU route; reference uses its existing serial policy',results},null,2));console.log(JSON.stringify({width,height,frames,backend,wallMs,exportAverageMsPerFrame:wallMs/frames,exportFps:frames*1000/wallMs}));
}
console.log(JSON.stringify({root}));
