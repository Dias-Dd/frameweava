import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {NativeGpuClient,type NativeProgram} from '../../native-gpu/client.ts';
import {NativeRecordingScope} from '../../native-gpu/scope.ts';
import type {FrameContext} from '../../../src/core/types.ts';
if(!process.env.FRAMEWEAVE_SERVO_RUNTIME)throw Error('Explicit frozen Servo runtime required');
const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
const context=(frame:number):FrameContext=>({frame,globalFrame:frame,time:frame/24,globalTime:frame/24,dt:1/24,progress:frame/24,fps:{num:24,den:1},durationInFrames:24,seed:0});
async function fixture(javascript:string,slots=1,timeoutMs=3000){
 const scope=new NativeRecordingScope(),module=await scope.api.createModule({version:1,id:'frameweave.servo',moduleVersion:'0.1.0',profile:'sdr-srgb8',execution:'trusted-local',width:16,height:8,input:false,timeoutMs,html:'<div id="box" style="width:100%;height:100%;background:red"></div>',javascript});scope.sealInitialization();
 const frame=async(n:number)=>{scope.beginFrame();scope.publish(await scope.api.runModule(module,[],{context:context(n)}));return scope.packet();};
 const {parameters:_p,output:_o,external:_e,kernelOffset:_k,moduleOffset:_m,...packet}=await frame(0);
 const program:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots,maxBytes:16*1024**2,display:null};
 return {scope,program,frame};
}
function cleanup(stderr:string){const events=stderr.split(/\r?\n/).filter(s=>s.startsWith('{')).map(s=>JSON.parse(s)).filter(s=>s.event==='servoClosed');assert.equal(events.length,1,stderr);assert.equal(events[0].status,0);assert.equal(events[0].runtime.logicalBridgeResources,0);assert.equal(events[0].runtime.instances,0);assert.equal(events[0].runtime.renderingContextReadbackAttempts,0);return events[0];}
const results:{case:string;[key:string]:unknown}[]=[];
function record(result:typeof results[number]){results.push(result);console.log(JSON.stringify(result));}
// A failed initialization must release partially constructed pages, textures,
// fences and contexts before replying. Use the real private owner protocol so
// the shutdown receipt can be captured even though Client.create rejects.
{
 const f=await fixture("throw Error('deliberate initialization failure')");
 const child=spawn(executable,[],{windowsHide:true,stdio:'pipe'});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.stdin.on('error',()=>{});
 const start=performance.now();const timer=setTimeout(()=>child.kill(),10000);
 const exited=new Promise<number|null>((done,fail)=>{child.on('error',fail);child.on('exit',done);});
 child.stdin.end(JSON.stringify({id:1,op:'init',program:f.program})+'\n');
 try{const code=await exited;assert.equal(code,0,stderr);const reply=JSON.parse(stdout.trim());assert.equal(reply.ok,false);assert.equal(reply.error.code,'E_NATIVE_MODULE');assert.match(reply.error.message,/E_SERVO_JS/);record({case:'initialization-error',ms:performance.now()-start,error:reply.error,cleanup:cleanup(stderr)});}finally{clearTimeout(timer);child.kill();await f.scope.api.dispose();}
}
{
 const f=await fixture("let count=0;window.frameweaveRender=()=>{count++;document.getElementById('box').style.opacity=String(count/4);}",2),client=await NativeGpuClient.create(f.program,{executable});
 try{const samples=[];for(let frame=0;frame<4;frame++){const p=await f.frame(frame),ticket=await client.submit(frame,p.parameters);await ticket.completed;const pixels=(await client.inspectForTest(ticket.slot,p.output)).pixels;const expected=frame<2?.25:.5;assert.ok(Math.abs(pixels[3]-expected)<=1/255+1e-6);samples.push({frame,slot:ticket.slot,pixel:pixels.slice(0,4)});}assert.equal((await client.stats()).nativeModules.instances,2);await client.close();await client.close();record({case:'slot-state-isolation-and-repeat-close',samples,cleanup:cleanup(client.stderr.join(''))});}finally{await client.close();await f.scope.api.dispose();}
}
{
 const f=await fixture("window.frameweaveRender=c=>{if(c.frame===1)throw Error('deliberate render failure');};"),client=await NativeGpuClient.create(f.program,{executable});
 try{const first=await client.submit(0,(await f.frame(0)).parameters);await first.completed;await assert.rejects(client.submit(1,(await f.frame(1)).parameters),{code:'E_NATIVE_MODULE'});await client.exited;await assert.rejects(client.submit(2,(await f.frame(2)).parameters),{code:'E_NATIVE_CLOSED'});await client.close();record({case:'render-error-invalidates-owner',initialError:'E_NATIVE_MODULE',subsequentUseAfterExit:'E_NATIVE_CLOSED',cleanup:cleanup(client.stderr.join(''))});}finally{await client.close();await f.scope.api.dispose();}
}
{
 // Deliberately set the caller deadline earlier than the module's own barrier
 // timeout: this checks the existing client's hard termination path directly.
 const f=await fixture("window.frameweaveRender=c=>{if(c.frame===1)for(;;){};};",1,30000),client=await NativeGpuClient.create(f.program,{executable,timeoutMs:10000});
 try{const first=await client.submit(0,(await f.frame(0)).parameters);await first.completed;const start=performance.now();await assert.rejects(client.submit(1,(await f.frame(1)).parameters),{code:'E_NATIVE_TIMEOUT'});assert.equal(client.connected(),false);await client.exited;await client.close();await client.close();record({case:'nonterminating-JS-owner-terminated',ms:performance.now()-start,note:'Process termination reclaims resources; graceful shutdown receipt is not expected.'});}finally{await client.close();await f.scope.api.dispose();}
}
await writeFile(resolve('artifacts/servo-module/lifecycle.json'),JSON.stringify({version:1,ok:true,results},null,2)+'\n');console.log(JSON.stringify({ok:true,results}));
