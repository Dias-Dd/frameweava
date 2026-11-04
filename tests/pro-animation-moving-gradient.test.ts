import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createNativeTransitions} from '../modules/pro-animation/src/native-transitions/index.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient} from '../modules/native-gpu/client.ts';
import {nativeBootstrapProgram} from '../modules/native-gpu/bootstrap-program.ts';
import {linear709} from '../src/media/surface.ts';
import type {FrameContext} from '../src/core/types.ts';
import {shutterSamples} from '../modules/pro-animation/src/shutter-sampling.ts';
const context:FrameContext={frame:3,globalFrame:3,time:.125,globalTime:.125,dt:1/24,fps:{num:24,den:1},durationInFrames:9,progress:3/8,seed:37};
const source={abiVersion:1 as const,id:'test/moving-gradient/source',version:'1.0.0',inputCount:0,parameterWords:2,code:'fn pixel(p:vec2u)->vec4f{let k=paramU32(0u);if(k==0u){return vec4f(-.125,3.,.25,.5);}if(k==1u){return vec4f(1.25,-.25,2.,.25);}let t=paramF32(1u);let v=clamp((f32(p.x)+.5)/f32(outputSize().x)+t*2.,0.,1.);return vec4f(v,v,v,1.);}'};
test('animated gradient is actually generated at all local shutter times on the native GPU',{timeout:60000},async()=>{
 const out=resolve('.frameweave/pa3-native-cards');await mkdir(out,{recursive:true});const bootstrap=nativeBootstrapProgram(1,1,false,128*1024**2),client=await NativeGpuClient.create(bootstrap,{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/native-admission-7d6ea4c/debug/frameweave-native-gpu.exe')});let scope:NativeRecordingScope|undefined;
 try{const stats=await client.stats();scope=new NativeRecordingScope({version:1,backend:'native-wgpu',hardwareVerified:true,owner:bootstrap.session,capabilities:stats.capabilities});const g=scope.api,fx=createNativeTransitions({gpu:g}),kernel=await g.compile(source),output={width:32,height:20,format:'rgba32float' as const,alpha:'premultiplied' as const,color:linear709};
  const image=async(kind:number,time=0)=>{const p=new Float32Array(2);new Uint32Array(p.buffer)[0]=kind;p[1]=time;return g.run(kernel,[],{parameters:p,output});};
  const a=await image(0),b=await image(1),mask=await image(2,context.time),times:number[]=[];
  const result=await fx.imageWipe(a,b,mask,{progress:.371,softness:0,autoSoftness:true,temporalSamples:16,gradientAt:async c=>{times.push(c.time);return image(2,c.time);}},context);scope.publish(result);
  assert.equal(times.length,16);assert.deepEqual(times,Array.from(shutterSamples({count:16,angleDegrees:180},context),s=>s.time));
  const packet=scope.packet(),{parameters,output:_out,external,kernelOffset,...p}=packet,index=g.stats().activeImages-1;await client.reconfigure({...p,version:2,session:bootstrap.session,slots:1,maxBytes:128*1024**2,display:null});let maximum=0,repeated:number[]|undefined;
  for(const frame of [3,0,3]){const ticket=await client.submit(frame,parameters);await ticket.completed;const {pixels}=await client.inspectForTest(ticket.slot,index);if(repeated)assert.deepEqual(pixels,repeated);repeated=pixels;
   for(let y=0;y<20;y++)for(let x=0;x<32;x++){const coverage=times.filter(t=>Math.max(0,Math.min(1,Math.fround(Math.fround((x+.5)/32)+Math.fround(t)*2)))<=Math.fround(.371)).length/16;for(let c=0;c<4;c++)maximum=Math.max(maximum,Math.abs(pixels[(y*32+x)*4+c]-([-.125,3,.25,.5][c]*(1-coverage)+[1.25,-.25,2,.25][c]*coverage)));}
  }
  assert.ok(maximum<=4e-5,JSON.stringify({maximum}));await writeFile(join(out,'moving-gradient.json'),JSON.stringify({version:1,times,maximum,budget:4e-5,stats:await client.stats()},null,2));
 }finally{await client.close();await scope?.api.dispose();}
});
