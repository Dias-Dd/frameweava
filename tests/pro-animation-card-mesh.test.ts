import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createNativeTransitions} from '../modules/pro-animation/src/native-transitions/index.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient} from '../modules/native-gpu/client.ts';
import {nativeBootstrapProgram} from '../modules/native-gpu/bootstrap-program.ts';
import {NativeBufferExporter} from '../modules/native-gpu/data-export.ts';
import {linear709,fromHalf,toHalf} from '../src/media/surface.ts';
import type {NativeGpuScope} from '../modules/native-gpu/authoring.ts';
import type {GpuPixelImage} from '../modules/gpu-effects/pixel-types.ts';

const source={abiVersion:1 as const,id:'test/card/source',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{let k=paramU32(0u);if(k==0u){return vec4f(-.125,3.,.25,.5);}if(k==1u){return vec4f(1.25,-.25,2.,.25);}if(k==3u){return vec4f(-.125,3.,.25,0.);}if(k==4u){return vec4f(4.,-2.,8.,0.);}let uv=(vec2f(p)+.5)/vec2f(outputSize());return vec4f(uv.x,uv.y,.5,1.);}'};
test('new native card mesh: exact alpha/depth, PM emission, backside mapping, vertices and deterministic frame access',{timeout:120000},async t=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');const out=resolve('.frameweave/pa3-native-cards');await mkdir(out,{recursive:true});
 const bootstrap=nativeBootstrapProgram(1,1,false,256*1024**2),client=await NativeGpuClient.create(bootstrap,{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/native-admission-7d6ea4c/debug/frameweave-native-gpu.exe')}),exporter=await NativeBufferExporter.create();let scope:NativeRecordingScope|undefined;
 try{
  const stats=await client.stats();scope=new NativeRecordingScope({version:1,backend:'native-wgpu',hardwareVerified:true,owner:bootstrap.session,capabilities:stats.capabilities});const g=scope.api;let label='';
  // Test instrumentation uses the actual public named-buffer export before the
  // function releases its authoring token; there is no production readback hook.
  const observed=new Proxy(g,{get(target,key){if(key==='releaseBuffer')return async(b:Parameters<NativeGpuScope['releaseBuffer']>[0])=>{if(b.info.semantic==='position'||b.info.channels?.join(',')==='u,v')await target.publishBuffer(label+(b.info.semantic==='position'?'.positions':'.uvs'),b,{version:1});return target.releaseBuffer(b);};return Reflect.get(target,key,target);}});
  const fx=createNativeTransitions({gpu:observed}),k=await g.compile(source),images:GpuPixelImage[]=[];
  for(let i=0;i<5;i++)images.push(await g.run(k,[],{parameters:Uint32Array.of(i),output:{width:i===2?4:32,height:i===2?3:20,format:'rgba32float',alpha:i===4?'straight':'premultiplied',color:linear709}}));
  const cases=[
   {name:'front',a:0,b:1,options:{progress:0,geometry:'mesh' as const,cells:[1,1] as const,shading:false},expected:()=>[-.125,3,.25,.5]},
   {name:'back',a:0,b:1,options:{progress:1,geometry:'mesh' as const,cells:[1,1] as const,shading:false},expected:()=>[1.25,-.25,2,.25]},
   {name:'emission',a:3,b:1,options:{progress:0,geometry:'mesh' as const,cells:[1,1] as const,shading:false},expected:()=>[-.125,3,.25,0]},
   {name:'hiddenStraight',a:0,b:4,options:{progress:1,geometry:'mesh' as const,cells:[1,1] as const,shading:false},expected:()=>[0,0,0,0]},
   {name:'backGradient',a:0,b:2,options:{progress:1,geometry:'mesh' as const,cells:[1,1] as const,shading:false},expected:(x:number,y:number)=>[Math.max(.125,Math.min(.875,(x+.5)/32)),Math.max(Math.fround(1/6),Math.min(Math.fround(5/6),(y+.5)/20)),.5,1]},
   {name:'specular',a:0,b:1,options:{progress:0,geometry:'mesh' as const,cells:[1,1] as const,material:{specular:.3}},expected:()=>[.025,3.15,.4,.5]},
   {name:'half',a:0,b:1,options:{progress:0,geometry:'mesh' as const,cells:[1,1] as const,shading:false,format:'rgba16float' as const},expected:()=>[-.125,3,.25,.5]},
   {name:'edgeOn',a:0,b:1,options:{progress:.5,geometry:'mesh' as const,cells:[1,1] as const,transitionWidth:1,shading:false},expected:()=>[0,0,0,0]},
  ];const records=[];
  for(const c of cases){label=c.name;const image=await fx.cardFlipWipe(images[c.a],images[c.b],c.options);scope.publish(image);records.push({c,index:g.stats().activeImages-1});}
  const packet=scope.packet(),{parameters,output,external,kernelOffset,...p}=packet;await client.reconfigure(exporter.configure({...p,version:2,session:bootstrap.session,slots:1,maxBytes:256*1024**2,display:null}));
  const proof:{name:string;frame:number;maxError:number;positions:number[]}[]=[],frozen=new Map<string,number[]>();for(const frame of [3,0,3]){const ticket=await client.submit(frame,parameters);await ticket.completed;for(const {c,index}of records)await t.test(c.name+' frame '+frame,async()=>{const {pixels}=await client.inspectForTest(ticket.slot,index);assert.ok(pixels.every(Number.isFinite),c.name);let maxError=0;for(let y=0;y<20;y++)for(let x=0;x<32;x++)for(let channel=0;channel<4;channel++)maxError=Math.max(maxError,Math.abs(pixels[(y*32+x)*4+channel]-c.expected(x,y)[channel]));if(maxError>4e-5){const draw=packet.passes.find(p=>p.output===index)!,atlas=await client.inspectForTest(ticket.slot,draw.inputs[0]);await writeFile(join(out,'failure-'+c.name+'.json'),JSON.stringify({name:c.name,maxError,outputFirst:pixels.slice(0,4),atlasPixel:atlas.pixels.slice((1*34+1)*4,(1*34+1)*4+4)},null,2));}assert.ok(maxError<=4e-5,JSON.stringify({name:c.name,maxError}));if(c.name==='half')assert.ok(pixels.every(v=>Object.is(v,fromHalf(toHalf(v)))));if(frozen.has(c.name))assert.deepEqual(pixels,frozen.get(c.name));else frozen.set(c.name,pixels);
   const positions=await exporter.read(client,ticket,c.name+'.positions');assert.ok(positions.values.every(Number.isFinite));if(c.name==='front')assert.deepEqual(Array.from(positions.values),[0,0,0,0,20,0,32,0,0,32,0,0,0,20,0,32,20,0]);proof.push({name:c.name,frame,maxError,positions:Array.from(positions.values)});
  });}
  const final=await client.stats();assert.equal(final.devicesCreated,1);assert.equal(final.webBridge.enabled,false);assert.equal(final.imageReadbacks,0);assert.equal(final.pixelTransferBytes,0);await writeFile(join(out,'gpu-initial.json'),JSON.stringify({schemaVersion:1,proof,stats:final},null,2));
 }finally{await client.close();await exporter.close();await scope?.api.dispose();}
});
