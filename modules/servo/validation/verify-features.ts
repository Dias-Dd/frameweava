import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {NativeRecordingScope} from '../../native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../../native-gpu/client.ts';
import type {FrameContext} from '../../../src/core/types.ts';
const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
if(!process.env.FRAMEWEAVE_SERVO_RUNTIME)throw Error('Explicit reviewed-local Servo runtime required');
const context=(frame:number):FrameContext=>({frame,globalFrame:frame,time:frame/24,globalTime:frame/24,dt:1/24,progress:frame/24,fps:{num:24,den:1},durationInFrames:24,seed:0});
const cases=[
 {name:'css-absolute-time',html:'<style>@keyframes fade{from{opacity:0}to{opacity:1}}.box{width:100%;height:100%;background:red;animation:fade 1s linear both}</style><div class="box"></div>',javascript:'',frames:[0,12,36,0,12,60,0],expectedAlpha:[0,.5,1,0,.5,1,0]},
 {name:'css-iteration-seek',html:'<style>@keyframes fade{from{opacity:0}to{opacity:1}}.box{width:100%;height:100%;background:red;animation:fade 1s linear 4 alternate both}</style><div class="box"></div>',javascript:'',frames:[0,6,30,54,78,102,6,0],expectedAlpha:[0,.25,.75,.25,.75,0,.25,0]},
 {name:'canvas2d-generated-content',html:'<canvas id="canvas" style="display:block" width="16" height="8"></canvas>',frames:[0,1,0],javascript:`window.frameweaveRender=()=>{const ctx=document.getElementById('canvas').getContext('2d');if(!ctx)throw Error('E_CANVAS_2D');ctx.fillStyle='lime';ctx.fillRect(0,0,16,8);};`},
 {name:'csp-policy',html:'<div style="width:100%;height:100%;background:lime"></div>',frames:[0,1],javascript:`
  window.netDenied=false;fetch('https://undeclared.invalid/frameweave-servo-policy').then(()=>{window.netDenied=false},()=>{window.netDenied=true});
  window.frameweaveRender=c=>{
   let evalDenied=false,functionDenied=false,wasmDenied=false;
   try{(0,eval)('1+1')}catch{evalDenied=true}
   try{new Function('return 1')()}catch{functionDenied=true}
   try{new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]))}catch{wasmDenied=true}
   if(!evalDenied||!functionDenied||!wasmDenied)throw Error('E_POLICY_REGRESSION: eval='+evalDenied+' function='+functionDenied+' wasm='+wasmDenied);
   if(typeof process!=='undefined'||typeof require!=='undefined')throw Error('E_POLICY_REGRESSION: Node globals');
   if(c.frame>0&&!window.netDenied)throw Error('E_POLICY_REGRESSION: undeclared network');
  };`},
];
const results=[];
const selected=process.argv[2]?cases.filter(c=>c.name===process.argv[2]):cases;if(!selected.length)throw Error('Unknown feature case');
for(const fixture of selected){
 const debug=process.env.SERVO_CSS_DEBUG&&fixture.name.startsWith('css-')?`window.frameweaveRender=c=>{const value=getComputedStyle(document.querySelector('.box')).opacity;if(c.time===0&&Number(value)>.001)throw Error('E_CSS_DEBUG: opacity='+value+' time='+c.time);};`:fixture.javascript;
 const scope=new NativeRecordingScope(),module=await scope.api.createModule({version:1,id:'frameweave.servo',moduleVersion:'0.1.0',profile:'sdr-srgb8',execution:'trusted-local',width:16,height:8,input:false,html:fixture.html,javascript:debug});scope.sealInitialization();let client:NativeGpuClient|undefined;const pixels:number[][]=[];
 try{for(const frame of fixture.frames){scope.beginFrame();scope.publish(await scope.api.runModule(module,[],{context:context(frame)}));const packet=scope.packet();if(!client){const {parameters:_p,output:_o,external:_e,kernelOffset:_k,moduleOffset:_m,...rest}=packet;const p:NativeProgram={...rest,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:8*1024**2,display:null};client=await NativeGpuClient.create(p,{executable,timeoutMs:10000});}const ticket=await client.submit(frame,packet.parameters);await ticket.completed;pixels.push((await client.inspectForTest(ticket.slot,packet.output)).pixels);}
  if(fixture.expectedAlpha){console.log(JSON.stringify({case:fixture.name,frames:fixture.frames,pixels:pixels.map(p=>p.slice(0,4))}));for(const [i,image]of pixels.entries()){const [r,g,b,a]=image;assert.ok(Math.abs(a-fixture.expectedAlpha[i])<=1/255+1e-6,JSON.stringify({index:i,frame:fixture.frames[i],pixel:image.slice(0,4),expected:fixture.expectedAlpha[i]}));assert.ok(Math.abs(r-a)<1e-6);assert.equal(g,0);assert.equal(b,0);}assert.deepEqual(pixels[0],pixels.at(-1));}
  else for(const image of pixels)assert.deepEqual(image.slice(0,4),[0,1,0,1]);
  results.push({name:fixture.name,frames:fixture.frames,samplePixels:pixels.map(p=>p.slice(0,4)),stats:await client!.stats()});
 }finally{if(process.env.FRAMEWEAVE_SERVO_TIMELINE_TRACE&&client)console.error(client.stderr.join(''));await client?.close();await scope.api.dispose();}
}
await writeFile(resolve('artifacts/servo-module/features.json'),JSON.stringify({version:1,ok:true,results},null,2)+'\n');console.log(JSON.stringify({ok:true,results}));
