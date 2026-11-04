import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createNativeTransitions} from '../modules/pro-animation/src/native-transitions/index.ts';
import {NativeGpuClient} from '../modules/native-gpu/client.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {nativeBootstrapProgram} from '../modules/native-gpu/bootstrap-program.ts';
import {linear709,fromHalf,toHalf} from '../src/media/surface.ts';
import {keyframes} from '../src/core/animation.ts';
import type {NativeGpuScope} from '../modules/native-gpu/authoring.ts';
import type {GpuPixelImage} from '../modules/gpu-effects/pixel-types.ts';
import {maskGaussian} from '../modules/pro-animation/validation/native-controls-scene/gaussian.ts';
import {placedGradient,gaussian,gridReference,jawsReference,lightReference,lineReference,cardReference,centeredBacksideReference,sourceReactorField,sourceBlendReference} from '../modules/pro-animation/validation/native-controls-reference.ts';

const fake={info:{width:32,height:20,format:'rgba32float',alpha:'premultiplied',color:linear709}} as GpuPixelImage;
function spy(){let runs=0;const gpu={capabilities:()=>({backend:'native-wgpu',hardwareVerified:true,limits:{maxStorageBufferBindingSize:1024**2}}),compile:async(k:any)=>k,run:async()=>{runs++;return fake;}} as unknown as NativeGpuScope;return {gpu,runs:()=>runs};}
test('new controls reject malformed fields and do not silently ignore unsupported domains',async()=>{
 const s=spy(),fx=createNativeTransitions({gpu:s.gpu});const bad=[
 ()=>fx.directionalWipe(fake,fake,{progress:.5,angleDegrees:90,direction:[1,0]}),
 ()=>fx.clockWipe(fake,fake,{progress:.5,wipe:'bad' as never}),()=>fx.irisWipe(fake,fake,{outerRadius:10,points:2}),
 ()=>fx.irisWipe(fake,fake,{progress:.5,innerRadius:2}),()=>fx.venetianWipe(fake,fake,{progress:.5,width:0}),
 ()=>fx.randomBlocksWipe(fake,fake,{progress:.5,blockSize:[3,0]}),()=>fx.randomBlocksWipe(fake,fake,{progress:.5,softEdges:1 as never}),
 ()=>fx.lumaWipe(fake,fake,fake,{progress:.5,placement:'bad' as never}),()=>fx.imageWipe(fake,fake,fake,{progress:.5,temporalSamples:8}),
 ()=>fx.imageWipe(fake,fake,fake,{progress:.5,autoSoftness:true}),()=>fx.imageWipe(fake,fake,fake,{progress:.5,blur:65}),
 ()=>fx.gridWipe(fake,fake,{progress:.5,tiles:0}),()=>fx.jawsWipe(fake,fake,{progress:.5,toothWidth:0}),
 ()=>fx.cardFlipWipe(fake,fake,{progress:.5,order:'gradient'}),()=>fx.cardFlipWipe(fake,fake,{progress:.5,cardScale:-1}),
 ()=>fx.cardFlipWipe(fake,fake,{progress:.5,transitionWidth:.2,stagger:1}),
 ()=>fx.lineSweepWipe(fake,fake,{progress:.5,overlap:.5,slantPixels:2}),
 ()=>fx.warpTransition(fake,fake,{progress:.5,range:[0,0]}),()=>fx.warpTransition(fake,fake,{progress:.5,reactorSource:'sources',placement:'tile'}),
 ()=>fx.warpTransition(fake,fake,{progress:.5,reactor:'contrast-difference'}),()=>fx.imageWipe(fake,fake,fake,{progress:.5,borderSoftness:2}),
 ()=>fx.randomBlocksWipe(fake,fake,{progress:.5,cells:[4,4],blockSize:[2,2]}),()=>fx.randomBlocksWipe(fake,fake,{progress:.5,blockSize:[1e-20,2]}),
 ()=>fx.venetianWipe(fake,fake,{progress:.5,width:3,count:4}),()=>fx.lineSweepWipe(fake,fake,{progress:.5,thickness:1e-20}),
 ];for(const f of bad)await assert.rejects(f,e=>['E_PA_TRANSITION','E_PA_TRANSITION_BLUR_DOMAIN','E_PA_TRANSITION_GAUSSIAN_REQUIRED'].includes((e as any).code));assert.equal(s.runs(),0);
});

const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
function noise(x:number,y:number,seed:number){let h=Math.imul(x,0x8da6b343)^Math.imul(y,0xd8163841)^Math.imul(seed,0xcb1ab31f);h^=h>>>13;h=Math.imul(h,0x5bd1e995);h^=h>>>15;return (h&0xffffff)/16777216;}
function coverage(v:number,t:number,s=.05){if(s===0)return Number(v<=t);const q=clamp((t*(1+s)-v)/s);return q*q*(3-2*q);}
/** Independent winding test, not the shader's ray/edge intersection algorithm. */
function inPolygon(x:number,y:number,n:number,outer:number,inner:number,rotation:number){const count=n*(outer===inner?1:2),verts=Array.from({length:count},(_,i)=>{const radius=outer===inner||i%2===0?outer:inner,a=rotation+i*2*Math.PI/count;return [radius*Math.sin(a),-radius*Math.cos(a)];});let inside=false;for(let i=0,j=count-1;i<count;j=i++){const a=verts[i],b=verts[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return Number(inside);}
const source={abiVersion:1 as const,id:'test/native-controls/solid',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{let kind=paramU32(0u);if(kind==0u){return vec4f(-.125,3.,.25,.5);}if(kind==1u){return vec4f(1.25,-.25,2.,.25);}let uv=(vec2f(p)+.5)/vec2f(outputSize());if(kind==3u){return vec4f(.1+uv.x,.25+uv.y,-.125,1.);}if(kind==4u){return vec4f(uv.x*uv.x,-.125+uv.y*.5,.25,1.);}return vec4f(uv.x,uv.y,.5,1.);}'};
type Case={label:string;run:(fx:ReturnType<typeof createNativeTransitions>,a:GpuPixelImage,b:GpuPixelImage,m:GpuPixelImage)=>Promise<GpuPixelImage>;mask?:(x:number,y:number)=>number;pixel?:(x:number,y:number)=>number[];inputs?:readonly [number,number];plane?:number[]};
test('extended controls run on the admitted native GPU: independent geometry, mask placement/blur and parameter extremes',{timeout:120000},async t=>{
 const out=resolve('.frameweave/pa3-native-controls');await mkdir(out,{recursive:true});const bootstrap=nativeBootstrapProgram(1,1,false,256*1024**2),client=await NativeGpuClient.create(bootstrap,{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'.frameweave/pa3-native-controls/diagnostics-mesh-v1/frameweave-native-gpu.exe')});let scope:NativeRecordingScope|undefined;
 try{const hardware=await client.stats();scope=new NativeRecordingScope({version:1,backend:'native-wgpu',owner:bootstrap.session,hardwareVerified:true,capabilities:hardware.capabilities});const gpu=scope.api,fx=createNativeTransitions({gpu}),k=await gpu.compile(source),images:GpuPixelImage[]=[];
  Object.assign(fx,createNativeTransitions({gpu,blurMask:maskGaussian(gpu)}));
  for(let i=0;i<5;i++)images.push(await gpu.run(k,[],{parameters:Uint32Array.of(i),output:{width:i===2?4:32,height:i===2?3:20,format:'rgba32float',alpha:'premultiplied',color:linear709}}));
  const gradient=placedGradient('stretch'),blur1=gaussian(gradient,1),blur2=gaussian(gradient,2),wide=gaussian(blur1,8);
  const imageBorder=gaussian(blur1.map(v=>coverage(v,Math.fround(.371),Math.fround(.05))),1.25);
  const reactors={brightness:blur1,contrast:blur1.map((v,i)=>Math.min(Math.abs(v-wide[i])*4,1)),local:blur1.map((_,i)=>{const x=i%32,y=Math.floor(i/32),gx=(blur1[y*32+clamp(x+1,0,31)]-blur1[y*32+clamp(x-1,0,31)])*.5,gy=(blur1[clamp(y+1,0,19)*32+x]-blur1[clamp(y-1,0,19)*32+x])*.5;return Math.min(Math.hypot(gx,gy)*8,1);})};
  const block=Array.from({length:32*20},(_,i)=>Number(noise(Math.floor((i%32+.5)/3.5),Math.floor((Math.floor(i/32)+.5)/4.25),37)<=Math.fround(.37))),feathered=gaussian(block,1);
  const cases:Case[]=[
   {label:'linear physical angle + 4x4 coverage',run:(f,a,b)=>f.directionalWipe(a,b,{progress:.371,angleDegrees:90,featherPixels:0,softness:0,edgeSamples:4}),mask:(x,y)=>{let c=0;for(let j=0;j<4;j++)for(let i=0;i<4;i++)c+=Number((x+(i+.5)/4)/32<=Math.fround(.371));return c/16;}},
   ...[3,5,6,11].map(points=>({label:'polygon '+points,run:(f:ReturnType<typeof createNativeTransitions>,a:GpuPixelImage,b:GpuPixelImage)=>f.irisWipe(a,b,{outerRadius:7.25,points,rotationDegrees:17,edgeSamples:4}),mask:(x:number,y:number)=>{let c=0;for(let j=0;j<4;j++)for(let i=0;i<4;i++)c+=inPolygon(x+(i+.5)/4-16,y+(j+.5)/4-10,points,7.25,7.25,Math.fround(17*Math.PI/180));return c/16;}})),
   {label:'independent inner radius',run:(f,a,b)=>f.irisWipe(a,b,{outerRadius:8.25,innerRadius:3.25,points:5,rotationDegrees:17,edgeSamples:4}),mask:(x,y)=>{let c=0;for(let j=0;j<4;j++)for(let i=0;i<4;i++)c+=inPolygon(x+(i+.5)/4-16,y+(j+.5)/4-10,5,8.25,3.25,Math.fround(17*Math.PI/180));return c/16;}},
   {label:'zero inner radius means no aperture',run:(f,a,b)=>f.irisWipe(a,b,{outerRadius:10,innerRadius:0}),mask:()=>0},
   {label:'zero outer radius',run:(f,a,b)=>f.irisWipe(a,b,{outerRadius:0}),mask:()=>0},
   {label:'block pixel size + subpixels',run:(f,a,b)=>f.randomBlocksWipe(a,b,{progress:.37,blockSize:[3.5,4.25],seed:37,softEdges:true,softness:0}),mask:(x,y)=>{let c=0;for(let j=0;j<4;j++)for(let i=0;i<4;i++)c+=Number(noise(Math.floor((x+(i+.5)/4)/3.5),Math.floor((y+(j+.5)/4)/4.25),37)<=Math.fround(.37));return c/16;}},
   {label:'rotated pixel-width blinds',run:(f,a,b)=>f.venetianWipe(a,b,{progress:.4,width:6.5,angleDegrees:90,featherPixels:0,softness:0,edgeSamples:4}),mask:(x,y)=>{let c=0;for(let j=0;j<4;j++)for(let i=0;i<4;i++){const z=(x+(i+.5)/4)/6.5;c+=Number(z-Math.floor(z)<=Math.fround(.4));}return c/16;}},
   ...(['clockwise','counterclockwise','both'] as const).map(wipe=>({label:'radial '+wipe,run:(f:ReturnType<typeof createNativeTransitions>,a:GpuPixelImage,b:GpuPixelImage)=>f.clockWipe(a,b,{progress:.37,wipe,softness:0,edgeSamples:1}),mask:(x:number,y:number)=>{let rank=(Math.atan2(y+.5-10,x+.5-16)/Math.PI/2+.25+1)%1;if(wipe==='counterclockwise')rank=(1-rank)%1;if(wipe==='both')rank=Math.min(rank,1-rank)*2;return Number(rank<=Math.fround(.37));}})),
   ...(['stretch','center','tile'] as const).map(placement=>({label:'map '+placement,run:(f:ReturnType<typeof createNativeTransitions>,a:GpuPixelImage,b:GpuPixelImage,m:GpuPixelImage)=>f.lumaWipe(a,b,m,{progress:.371,placement,invert:true}),mask:(x:number,y:number)=>coverage(1-placedGradient(placement)[y*32+x],Math.fround(.371),Math.fround(.05))})),
   {label:'mask spatial feather',run:(f,a,b)=>f.randomBlocksWipe(a,b,{progress:.37,blockSize:[3.5,4.25],featherPixels:2,seed:37,softness:0}),mask:(x,y)=>feathered[y*32+x]},
   {label:'glass Gaussian map blur',run:(f,a,b,m)=>f.glassWipe(a,b,m,{progress:.371,mapBlur:2,placement:'stretch'}),mask:(x,y)=>coverage(blur2[y*32+x],Math.fround(.371),Math.fround(.05))},
   {label:'image adaptive mask shutter',run:(f,a,b,m)=>f.imageWipe(a,b,m,{progress:keyframes([{frame:0,value:0},{frame:8,value:1}]),autoSoftness:true,temporalSamples:16,blur:1},{frame:3,globalFrame:3,time:.125,globalTime:.125,dt:1/24,progress:3/8,fps:{num:24,den:1},durationInFrames:9,seed:37}),mask:(x,y)=>Array.from({length:16},(_,i)=>coverage(blur1[y*32+x],Math.fround((3+((i+.5)/16-.5)*.5)/8),Math.fround(.05))).reduce((a,b)=>a+b)/16},
   ...(['brightness','contrast','local'] as const).map(reactor=>({label:'warp reactor '+reactor,run:(f:ReturnType<typeof createNativeTransitions>,a:GpuPixelImage,b:GpuPixelImage,m:GpuPixelImage)=>f.warpTransition(a,b,m,{progress:.371,reactor,smoothness:1}),mask:(x:number,y:number)=>coverage(reactors[reactor][y*32+x],Math.fround(.371),Math.fround(.05))})),
   {label:'rotated physical Grid borders',run:(f,a,b)=>f.gridWipe(a,b,{progress:.371,tiles:7,borderPixels:1.25,rotationDegrees:27,reverse:true}),mask:gridReference},
   {label:'Jaws width and height',run:(f,a,b)=>f.jawsWipe(a,b,{progress:.371,toothWidth:7.25,heightPercent:37,rotationDegrees:23,shape:'sine'}),pixel:jawsReference},
   {label:'radial source-color light',run:(f,a,b)=>f.lightWipe(a,b,{progress:.371,shape:'round',center:[-.2,.7],reverse:true,colorFromSource:true}),pixel:lightReference},
   {label:'rotated pixel strip sweep',run:(f,a,b)=>f.lineSweepWipe(a,b,{progress:.371,rotationDegrees:27,thickness:3.5,slantPixels:-2,flip:true}),mask:(x,y)=>lineReference(x,y)},
   ...[0,1].map(overlap=>({label:'line overlap '+overlap,run:(f:ReturnType<typeof createNativeTransitions>,a:GpuPixelImage,b:GpuPixelImage)=>f.lineSweepWipe(a,b,{progress:.371,rotationDegrees:27,thickness:3.5,overlap,flip:true}),mask:(x:number,y:number)=>lineReference(x,y,overlap)})),
   {label:'standalone Scale Wipe',run:(f,a,b)=>f.scaleWipe(a,b,{stretchOnly:true,stretch:3,center:[-.5,1.5],angleDegrees:27}),mask:()=>0},
   {label:'card controls',run:(f,a,b,m)=>f.cardFlipWipe(a,b,{progress:.371,cardScale:.75,transitionWidth:.25,order:'gradient',gradient:m,axis:'random',timingRandomness:.3,seed:37,columnsFollowRows:true}),pixel:cardReference},
   {label:'differently sized centered Twister Backside',run:(f,a,_b,m)=>f.twisterTransition(a,m,{progress:1,shading:false}),pixel:centeredBacksideReference},
   ...(['brightness','brightness-difference','contrast-difference','local-difference'] as const).map(reactor=>({label:'two-source '+reactor,inputs:[3,4] as const,run:(f:ReturnType<typeof createNativeTransitions>,a:GpuPixelImage,b:GpuPixelImage)=>f.warpTransition(a,b,{progress:.371,reactor,smoothness:1,amount:0,blendSpan:.4}),pixel:sourceBlendReference,plane:sourceReactorField(reactor,gaussian)})),
   {label:'adaptive image coverage spatial border',run:(f,a,b,m)=>f.imageWipe(a,b,m,{progress:.371,blur:1,borderSoftness:1.25}),mask:(x,y)=>imageBorder[y*32+x]},
  ];
  const halfFx=Object.fromEntries(Object.entries(fx).map(([name,fn])=>[name,(...args:any[])=>{const index=args[2]?.info?3:2;args[index]={...args[index],format:'rgba16float'};return (fn as (...args:any[])=>Promise<GpuPixelImage>)(...args);}])) as typeof fx;
  const records=[];for(const [format,profile]of [['rgba32float',fx],['rgba16float',halfFx]] as const)for(const c of cases){const image=await c.run(profile,images[c.inputs?.[0]??0],images[c.inputs?.[1]??1],images[2]);scope.publish(image);records.push({c,format,index:gpu.stats().activeImages-1});}
  const packet=scope.packet(),{parameters,output,external,kernelOffset,...p}=packet;await client.reconfigure({...p,version:2,session:bootstrap.session,slots:1,maxBytes:256*1024**2,display:null});const proof:Array<Record<string,unknown>>=[];
  const frozen=new Map<string,number[]>();for(const frame of [3,0,3]){const ticket=await client.submit(frame,parameters);await ticket.completed;for(const r of records)await t.test(r.c.label+' '+r.format+' frame '+frame,async()=>{const key=r.c.label+'/'+r.format,{pixels}=await client.inspectForTest(ticket.slot,r.index);assert.ok(pixels.every(Number.isFinite),r.c.label);assert.ok(pixels.every((v,i)=>i%4!==3||v>=0&&v<=1),r.c.label+' alpha');if(frozen.has(key))assert.deepEqual(pixels,frozen.get(key));else frozen.set(key,pixels);if(r.format==='rgba16float')assert.ok(pixels.every(v=>Object.is(v,fromHalf(toHalf(v)))),'logical F16 publication');
    const budget=r.format==='rgba16float'?.001953125:4e-5;let maxError=0,at=0;for(let y=0;y<20;y++)for(let x=0;x<32;x++){const coverage=r.c.mask?.(x,y),a=[-.125,3,.25,.5],b=[1.25,-.25,2,.25],expected=r.c.pixel?.(x,y)??(coverage===undefined?undefined:a.map((v,c)=>v*(1-coverage)+b[c]*coverage));if(expected)for(let c=0;c<4;c++){const reference=r.format==='rgba16float'?fromHalf(toHalf(expected[c])):expected[c],error=Math.abs(pixels[(y*32+x)*4+c]-reference);if(error>maxError){maxError=error;at=y*32+x;}}}
    let planeMaxError:number|undefined;if(r.c.plane){const pass=packet.passes.find(p=>p.output===r.index)!;const plane=await client.inspectForTest(ticket.slot,pass.inputs[2]);planeMaxError=Math.max(...r.c.plane.map((v,i)=>Math.abs(v-plane.pixels[i*4])));assert.ok(planeMaxError<2e-6,JSON.stringify({case:r.c.label,planeMaxError}));}
    let diagnostic:unknown;if(maxError>budget){const pass=packet.passes.find(p=>p.output===r.index);if(pass?.inputs[2]!==undefined){const plane=await client.inspectForTest(ticket.slot,pass.inputs[2]),react=packet.passes.find(p=>p.output===pass.inputs[2]);let intermediate:unknown;if(react&&react.inputs.length===2){const left=await client.inspectForTest(ticket.slot,react.inputs[0]),right=await client.inspectForTest(ticket.slot,react.inputs[1]),leftField=left.pixels.filter((_,i)=>i%4===0),meanFromActual=gaussian(leftField,8);intermediate={sourceGpu:left.pixels[at*4],sourceReference:blur1[at],meanGpu:right.pixels[at*4],meanReference:wide[at],meanOfActualSource:meanFromActual[at]};}diagnostic={at,gpuMask:plane.pixels[at*4],referenceReactor:reactors.contrast[at],actualCoverage:(.5-pixels[at*4+3])*4,referenceCoverage:r.c.mask?.(at%32,Math.floor(at/32)),intermediate};await writeFile(join(out,'reference-failure-'+r.c.label.replaceAll(/[^a-z0-9]/gi,'-')+'.json'),JSON.stringify(diagnostic,null,2));}}
    proof.push({frame,label:r.c.label,format:r.format,maxError,planeMaxError,budget,withinBudget:maxError<=budget,independentReference:!!(r.c.mask||r.c.pixel)});assert.ok(maxError<=budget,JSON.stringify({case:r.c.label,format:r.format,maxError,diagnostic}));
  });}
  const stats=await client.stats();assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);await writeFile(join(out,'gpu.json'),JSON.stringify({schemaVersion:1,proof,stats},null,2));
 }finally{await client.close();await scope?.api.dispose();}
});
