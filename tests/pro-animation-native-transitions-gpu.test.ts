import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import * as API from '../modules/pro-animation/src/native-transitions/index.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient} from '../modules/native-gpu/client.ts';
import {nativeBootstrapProgram} from '../modules/native-gpu/bootstrap-program.ts';
import {linear709} from '../src/media/surface.ts';
import {transitionReference,type Field} from '../modules/pro-animation/validation/native-transition-reference.ts';
import type {GpuPixelImage,GpuPixelKernelSourceV1} from '../modules/gpu-effects/pixel-types.ts';

const directory=resolve(process.env.FRAMEWEAVE_TRANSITION_VALIDATION_OUT??'.frameweave/pa3-native-transitions'),executable=resolve(process.env.FRAMEWEAVE_NATIVE_GPU??resolve(directory,'diagnostics/frameweave-native-gpu.exe'));
const source:GpuPixelKernelSourceV1={abiVersion:1,id:'test/pa-native/association-source',version:'1.0.0',inputCount:0,parameterWords:1,code:`
fn pixel(p:vec2u)->vec4f{let k=paramU32(0u);let alpha=f32((p.x+p.y)%4u)*.25;let v=f32((p.x*3u+p.y*5u)%13u)*.125;
 if(k==0u){if(alpha==0.){return vec4f(.25,-.125,1.,0.);}return vec4f((1.+v)*alpha,-.25*alpha,v*.5*alpha,alpha);}
 if(k==1u){return vec4f(.25,2.-v,.5,alpha);}
 let uv=(vec2f(p)+.5)/vec2f(outputSize());return vec4f(uv.x,uv.y,.5,uv.y);}`};
function field(kind:number,w:number,h:number):Field{const out=new Float32Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=(x+y)%4*.25,v=(x*3+y*5)%13*.125,p=kind===0?(a===0?[.25,-.125,1,0]:[(1+v)*a,-.25*a,v*.5*a,a]):kind===1?[.25,2-v,.5,a]:[(x+.5)/w,(y+.5)/h,.5,(y+.5)/h];out.set(p,(y*w+x)*4);}return {width:w,height:h,pixels:out,alpha:kind===0?'premultiplied':'straight'};}

test('all 32 transitions execute on admitted Rust/wgpu; endpoints, F64 reference, 16F/32F, HDR/Alpha and repeated frame',{timeout:120000},async()=>{
 await mkdir(directory,{recursive:true});const bootstrap=nativeBootstrapProgram(1,1,false,256*1024**2),client=await NativeGpuClient.create(bootstrap,{executable});
 let scope:NativeRecordingScope|undefined;
 try{
  const hardware=await client.stats();assert.equal(hardware.capabilities.hardwareVerified,true);
  scope=new NativeRecordingScope({version:1,backend:'native-wgpu',owner:bootstrap.session,hardwareVerified:true,capabilities:hardware.capabilities});const gpu=scope.api;
  let lastParams:Float32Array=new Float32Array();const observed={...gpu,run:async(...args:Parameters<typeof gpu.run>)=>{const p=args[2]?.parameters!;lastParams=new Float32Array(p.buffer.slice(p.byteOffset,p.byteOffset+p.byteLength));return gpu.run(...args);}};
  const fx=API.createNativeTransitions({gpu:observed});
  const w=31,h=19,k=await gpu.compile(source),inputs:GpuPixelImage[]=[];
  for(let i=0;i<3;i++)inputs.push(await gpu.run(k,[],{parameters:Uint32Array.of(i),output:{width:w,height:h,format:'rgba32float',alpha:i===0?'premultiplied':'straight',color:linear709}}));
  const records:{name:typeof API.transitionNames[number];format:string;progress:number;image:number;parameters:Float32Array}[]=[];
  async function record(name:typeof API.transitionNames[number],format:'rgba16float'|'rgba32float',progress:number,extra:Record<string,unknown>={}){
   const fn=fx[name] as (...args:any[])=>Promise<GpuPixelImage>,options={progress,format,...extra};
   const out=['lumaWipe','alphaWipe','displacementTransition','glassWipe','imageWipe','warpTransition'].includes(name)?await fn(...inputs,options):await fn(inputs[0],inputs[1],options);
   scope!.publish(out);records.push({name,format,progress,image:gpu.stats().activeImages-1,parameters:lastParams});
  }
  for(const format of ['rgba16float','rgba32float'] as const)for(const progress of [0,.3712345,1])for(const name of API.transitionNames)await record(name,format,progress);
  const variants:readonly (readonly [typeof API.transitionNames[number],Record<string,unknown>])[]=[
   ['directionalWipe',{direction:[1,-2],softness:0}],['clockWipe',{center:[.3,.7],startAngleDegrees:37,softness:.12}],
   ['irisWipe',{center:[.1,.8],softness:0}],['venetianWipe',{axis:'y',count:9}],['randomBlocksWipe',{cells:[7,3],seed:37}],
   ['pushTransition',{direction:'right'}],['slideTransition',{direction:'up'}],['splitTransition',{axis:'y'}],
   ['zoomTransition',{strength:.5,boundary:'transparent'}],['rotateTransition',{turns:-.2,boundary:'transparent'}],
   ['rippleTransition',{amplitude:-3,frequency:2,speed:-.5}],['displacementTransition',{strength:2,range:[-.5,2],boundary:'transparent'}],
   ['starWipe',{points:5,innerRatio:.25}],['cardFlipWipe',{axis:'y',stagger:0,shading:0}],['glassWipe',{displacement:5}],
   ['gridWipe',{shape:'doors',reverse:true,rotationDegrees:23}],['gridWipe',{shape:'rectangle',rotationDegrees:-37}],
   ...['red','green','blue','alpha','hue','saturation','lightness'].map(channel=>['imageWipe',{channel,invert:true}] as const),
   ['jawsWipe',{shape:'rounded',rotationDegrees:17}],['jawsWipe',{shape:'square'}],['jawsWipe',{shape:'sine'}],
   ['lineSweepWipe',{strips:9,slant:-2,flip:true}],['radialScaleWipe',{reverse:true}],
   ['twisterTransition',{rotationDegrees:31,shading:.2}],['warpTransition',{direction:'same'}],['warpTransition',{direction:'perpendicular'}],
  ];for(const [name,o]of variants)await record(name,'rgba32float',.3712345,o);
  const packet=scope.packet(),{parameters,output,external,kernelOffset,...p}=packet;
  await client.reconfigure({...p,version:2,session:bootstrap.session,slots:1,maxBytes:256*1024**2,display:null});
  const summaries=[];let repeat:number[]|undefined;
  for(const frame of [5,0,5]){
   const start=performance.now(),ticket=await client.submit(frame,parameters);await ticket.completed;
   // Endpoints and reference validated on first frame; last output on every seek.
   if(frame===5&&!repeat){for(const r of records){const {pixels}=await client.inspectForTest(ticket.slot,r.image),expected=transitionReference(r.name,field(0,w,h),field(1,w,h),field(2,w,h),r.parameters,r.format==='rgba16float');
    assert.ok(pixels.every(Number.isFinite),r.name+' finite pixels');let error=0,index=0;for(let i=0;i<pixels.length;i++){const d=Math.abs(pixels[i]-expected[i]);if(d>error){error=d;index=i;}}
    const budget=r.format==='rgba16float'?.001953125:4e-5;
    assert.ok(error<=budget,JSON.stringify({...r,parameters:undefined,error,budget,index,actual:pixels[index],expected:expected[index]}));
    if(r.progress===0||r.progress===1)assert.equal(error,0,r.name+' endpoint');
    summaries.push({name:r.name,format:r.format,progress:r.progress,maxAbs:error,budget});
   }}
   const last=(await client.inspectForTest(ticket.slot,output)).pixels;if(repeat)assert.deepEqual(last,repeat);repeat=last;
   summaries.push({frame,wallMs:performance.now()-start,includesDiagnosticReadback:true});
  }
  const stats=await client.stats();assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);assert.equal(stats.devicesCreated,1);
  await writeFile(join(directory,'gpu-reference.json'),JSON.stringify({schemaVersion:1,records:summaries,stats,scope:'diagnostic binary only; F64 reference is our documented semantics, not AE pixel parity'},null,2));
 }finally{await client.close();await scope?.api.dispose();}
});
