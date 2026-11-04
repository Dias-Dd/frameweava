import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {frameContext} from '../src/core/time.ts';
import {fromHalf,toHalf} from '../src/media/surface.ts';
import {shutterTimeSamples,sourceTimeContext} from '../modules/pro-animation/src/native-time/plans.ts';
import {controlsAt,sourceSeconds,type Mode} from '../modules/pro-animation/validation/keyframe-control-scene/controls.ts';
function compare(actual:unknown,expected:unknown,path='$'):number{
 if(typeof expected==='number'){assert.equal(typeof actual,'number',path);const error=Math.abs((actual as number)-expected);assert.ok(error<=1e-9*Math.max(1,Math.abs(expected)),path+':'+error);return error;}
 if(expected&&typeof expected==='object'){assert.ok(actual&&typeof actual==='object',path);assert.deepEqual(Object.keys(actual),Object.keys(expected),path);let error=0;for(const key of Object.keys(expected))error=Math.max(error,compare((actual as Record<string,unknown>)[key],(expected as Record<string,unknown>)[key],path+'.'+key));return error;}
 assert.equal(actual,expected,path);return 0;
}
test('keyframe21 controls -> actual subframe sources -> existing compensated Native shutter -> Glow/Layer F16/F32',{timeout:120000},async()=>{
 const directory=resolve('.frameweave/pa3-keyframe-control/stage');await mkdir(directory,{recursive:true});process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY??=resolve('outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');const proof:object[]=[];
 const modes:Record<string,Mode>={offset:'offset',ping:'ping-pong',continue:'continue',inverse:'inverse'};
 for(const entry of ['project.tsx','half.tsx']){
 const start=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/keyframe-control-scene',entry)),buildMs=performance.now()-start,renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe'),dynamic:'interactive'}});
 try{const frozen=new Map<string,string>();for(const frame of [4,0,7,4]){const begin=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;
 for(const [stage,mode]of Object.entries(modes)){
 const context=frameContext(build.manifest,build.manifest.stages.find(s=>s.id===stage)!,frame),plan=shutterTimeSamples({count:8,angleDegrees:720},context),samples=[...plan].map(s=>{const seconds=sourceSeconds(mode,s.context);return {index:s.index,shutter:s.context,source:sourceTimeContext(s.context,seconds),x:40+210*seconds};});
 const trace=await renderer.exportNativeBuffer(ticket,stage+'/trace');assert.ok(trace.values instanceof Uint32Array);let json='';for(const word of trace.values)json+=String.fromCharCode(word);const maxQueryError=compare(JSON.parse(json),{controls:controlsAt(context),samples});assert.equal(samples.length,8);assert.ok(samples.some(s=>!Number.isInteger(s.shutter.globalFrame)));assert.ok(samples.every(s=>s.source.globalFrame===s.shutter.globalFrame));
 const base=await renderer.exportNativeBuffer(ticket,stage+'/basePixels');assert.ok(base.values instanceof Float32Array);const raw=base.values;let checked=0,maxPixelError=0,nonzero=0;
 for(let x=0;x<320;x++){
 if(samples.some(s=>Math.min(Math.abs(x+.5-(s.x-12)),Math.abs(x+.5-(s.x+12)))<2))continue;
 const covered=samples.filter(s=>x+.5>s.x-12&&x+.5<s.x+12).length,fraction=covered/8,expected=[-.2,4.8,8,.8].map(v=>entry==='half.tsx'?fromHalf(toHalf(v*fraction)):v*fraction),at=(90*320+x)*4;for(let c=0;c<4;c++)maxPixelError=Math.max(maxPixelError,Math.abs(raw[at+c]-expected[c]));checked++;if(covered)nonzero++;
 }
 assert.ok(checked>100);assert.ok(nonzero>0,stage+' actual moving ink');assert.ok(maxPixelError<=4e-6,JSON.stringify({entry,stage,frame,maxPixelError}));
 const result=await renderer.exportNativeBuffer(ticket,stage+'/pixels');assert.ok(result.values instanceof Float32Array);const p=result.values;assert.equal(p.length,320*180*4);assert.ok(p.every(Number.isFinite));assert.ok(p.every((v,i)=>i%4!==3||v>=0&&v<=1));assert.ok(p.some((v,i)=>i%4!==3&&v<0));assert.ok(p.some((v,i)=>i%4!==3&&v>1));assert.ok(p.some((v,i)=>i%4===3&&v===0));if(entry==='half.tsx')assert.ok(p.every(v=>Object.is(v,fromHalf(toHalf(v)))));
 const bytes=new Uint8Array(p.buffer,p.byteOffset,p.byteLength),hash=createHash('sha256').update(bytes).digest('hex'),key=stage+':'+frame;if(frozen.has(key))assert.equal(hash,frozen.get(key));frozen.set(key,hash);if(frame===4)await writeFile(join(directory,entry+'.'+stage+'.f32'),bytes);proof.push({entry,stage,frame,hash,maxQueryError,maxPixelError,checked,nonzero,wallMs:performance.now()-begin});
 }
 }const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);proof.push({entry,buildMs,stats});
 }finally{await renderer.close();}
 }
 await writeFile(join(directory,'result.json'),JSON.stringify({version:1,proof,scope:'All21 keyframe control operations execute in live Native logic and compare to Node references. Four explicit procedural sources follow real affine shutter contexts, not frozen original frames. Original GPU stroke/compensated reducer/Glow/Layer only. Independent pixel reference checks interior scan-line samples away from raster edges; no analytic AA/pixel parity claim. Explicit diagnostic buffer exports after completion, not zero-readback claim.'},null,2));
});
