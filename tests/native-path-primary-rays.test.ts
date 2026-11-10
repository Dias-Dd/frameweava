import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {createNativePathTracer} from '../modules/native-gpu/path-tracer.ts';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {EngineError} from '../src/core/errors.ts';
const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
const sameBytes=(a:ArrayBufferView,b:ArrayBufferView,message='Captured bytes changed')=>assert.ok(Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength)),message);

test('experimental camera-ray adapter is explicitly versioned and requires an apply function',async()=>{
 const scope=new NativeRecordingScope(),init={gpu:scope.api,width:8,height:8} as Parameters<typeof createNativePathTracer>[0];
 try{for(const primary of [null,{version:2,apply(){}},{version:1}])await assert.rejects(createNativePathTracer(init,{} as never,{experimentalPrimaryRays:primary as never}),{code:'E_NATIVE_PATH_PRIMARY'});}
 finally{await scope.api.dispose();}
});

test('primary-ray callback preserves structured error identity, context and causes',async()=>{
 const scope=new NativeRecordingScope(),init={gpu:scope.api,width:2,height:2} as Parameters<typeof createNativePathTracer>[0];
 let issue:Error=new Error('ordinary cause',{cause:new Error('inner')});
 const path=await createNativePathTracer(init,{geometries:{p:{restPositions:[[-1,-1,0],[1,-1,0],[0,1,0]],indices:[0,1,2]}},materials:{m:{kind:'unlit',color:[1,1,1]}},nodes:[{id:'p',geometry:'p',material:'m'}],sample(){return {camera:{position:[0,0,3],target:[0,0,0],projection:'orthographic',viewHeight:2,near:.01,far:8}};}},
  {samples:1,maxBounces:0,experimentalPrimaryRays:{version:1,apply(){throw issue;}}});
 scope.sealInitialization();
 const context={frame:1,globalFrame:1,time:1/24,globalTime:1/24,dt:1/24,progress:.5,fps:{num:24,den:1},durationInFrames:3,seed:17};
 try{
  for(const value of [issue,...['E_RENDER_CANCELLED','E_NATIVE_RAY_PERMISSION','E_NATIVE_BUDGET'].map(code=>new EngineError(code,'typed failure',{stageId:'origin',frame:42,hint:'retained hint',details:{cause:{code:'E_INPUT',message:'original cause'},required:1024}}))]){
   issue=value;scope.beginFrame();await assert.rejects(async()=>await path.renderAt(context,{},{}),(error:unknown)=>error===value);
  }
 }finally{await path.dispose?.();await scope.api.dispose();}
});

test('real camera-ray effects preserve the default, protect visible foreground and match AA features with Alpha/lens/shutter',{
 skip:executable?false:'Reviewed FRAMEWEAVE_NATIVE_GPU required',
},async()=>{
 const parent=resolve('.frameweave/scene3d');await mkdir(parent,{recursive:true});
 const dir=await mkdtemp(join(parent,'primary-rays-')),entry=join(dir,'project.tsx');
 await writeFile(entry,`
import {Composition,Stage,Layer,ref,EngineError} from '@frameweave/engine';
import {defineNativeStage,createNativePathTracer,type NativeScene3D,type SceneGeometry} from '@frameweave/engine/native';
export const picture=defineNativeStage(async init=>{
 const panel=(x0:number,x1:number,z:number):SceneGeometry=>({restPositions:[[x0,-4,z],[x1,-4,z],[x1,4,z],[x0,4,z]],indices:[0,1,2,0,2,3]});
 const scene:NativeScene3D={geometries:{a:panel(-4,0,-2),b:panel(0,4,-2),f:panel(-.7,-.15,.6),mask:panel(.4,1,.8),blend:panel(-.05,.35,.8),glass:panel(1.05,1.4,.4),emit:panel(-1.2,-.95,.4)},
  materials:{a:{kind:'unlit',color:[.7,.2,.1]},b:{kind:'unlit',color:[.1,.5,.2]},f:{kind:'unlit',color:[.02,.05,.9]},
   mask:{kind:'unlit',color:[.9,0,0],alphaMode:'mask',opacity:0},blend:{kind:'unlit',color:[.2,.8,.1],alphaMode:'blend',opacity:.5},
   glass:{kind:'dielectric',ior:1.5},emit:{kind:'emissive',radiance:[4,2,1]}},
  nodes:['a','b','f','mask','blend','glass','emit'].map(id=>({id,geometry:id,material:id})),environment:{lower:[0,0,0],upper:[0,0,0]},
  sample(c){return {camera:{position:[0,0,3],target:[0,0,0],projection:'perspective',verticalFov:50,near:.01,far:12},transforms:{b:[1,0,0,c.time*.08,0,1,0,0,0,0,1,0]}};}};
 const kernel=await init.gpu.compileCompute({abiVersion:1,id:'test/primary-rays',version:'1.0.0',bindings:[{type:'f32',access:'read_write'},{type:'u32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read_write'},{type:'f32',access:'read_write'},{type:'f32',access:'read'}],parameterWords:2,workgroupSize:[8,8,1],code:
  'fn compute(p:vec3u,l:vec3u,g:vec3u){let i=p.y*paramU32(0u)+p.x;let a=i*3u;var d=vec3f(load0(a),load0(a+1u),load0(a+2u));store4(a,d.x);store4(a+1u,d.y);store4(a+2u,d.z);let gate=(load5(a+2u)+.1)/(-d.z);if(load1(i*4u)==0u||load2(i*4u)>gate){d=normalize(d+vec3f(.08,0.,0.));store0(a,d.x);store0(a+1u,d.y);store0(a+2u,d.z);}let old=select(load3(i*4u),0.,paramU32(1u)==0u);store3(i*4u,max(old,abs(length(d)-1.)));store3(i*4u+1u,f32(load1(i*4u+3u)));store3(i*4u+2u,f32(load1(i*4u+1u)));store3(i*4u+3u,load2(i*4u));}' });
 const guard=await init.gpu.compileCompute({abiVersion:1,id:'test/primary-foreground',version:'1.0.0',bindings:[{type:'f32',access:'read_write'},{type:'f32',access:'read'},{type:'u32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read'}],parameterWords:1,workgroupSize:[8,8,1],code:
  'fn compute(p:vec3u,l:vec3u,g:vec3u){let i=p.y*paramU32(0u)+p.x;let a=i*3u;let gate=(load4(a+2u)+.1)/(-load0(a+2u));if(load2(i*4u)!=0u&&load3(i*4u)<gate){store0(a,load1(a));store0(a+1u,load1(a+1u));store0(a+2u,load1(a+2u));}}'});
 const paths:Awaited<ReturnType<typeof createNativePathTracer>>[]=[];
 for(let optics=0;optics<2;optics++)for(let mode=0;mode<3;mode++){
  let diagnostic:Parameters<typeof init.gpu.publishBuffer>[1]|undefined;
  let original:Parameters<typeof init.gpu.publishBuffer>[1]|undefined;
  paths.push(await createNativePathTracer(init,scene,{samples:64,maxBounces:2,aovs:true,cryptomatte:true,denoiseFeatures:true,motionVectors:true,
   ...optics?{lens:{apertureRadius:.12,focusDistance:5},shutter:{angleDegrees:180,timeSamples:4}}:{},
   ...mode?{experimentalPrimaryRays:{version:1,async apply(input,arena){if(mode===1)return;
    if(input.sample===-1){diagnostic=arena.buffer(await init.gpu.createBuffer({type:'f32',length:input.width*input.height*4}));original=arena.buffer(await init.gpu.createBuffer({type:'f32',length:input.width*input.height*3}));}
    await init.gpu.dispatch(kernel,[input.directions,input.nearest.hits,input.nearest.measurements,diagnostic!,original!,input.origins],{workItems:[input.width,input.height,1],parameters:Uint32Array.of(input.width,input.sample+1)});
    await input.retrace();await init.gpu.dispatch(guard,[input.directions,original!,input.nearest.hits,input.nearest.measurements,input.origins],{workItems:[input.width,input.height,1],parameters:Uint32Array.of(input.width)});
    if(input.sample===63)await init.gpu.publishBuffer('primary-unit',diagnostic!,{version:1});
   }}}:{}}));
 }
 paths.push(await createNativePathTracer(init,scene,{samples:1,aovs:true,experimentalPrimaryRays:{version:1,apply(){throw Error('deliberate primary failure');}}}));
 paths.push(await createNativePathTracer(init,scene,{samples:1,aovs:true,experimentalPrimaryRays:{version:1,apply(){throw new EngineError('E_NATIVE_BUDGET','typed primary failure',{stageId:'spoofed',frame:0,hint:'review the caller budget',details:{cause:{code:'E_SOURCE',message:'original'},required:1024}});}}}));
 return {renderAt(c){return paths[c.frame].renderAt({...c,time:2/24,globalTime:2/24,frame:2,globalFrame:2,progress:2/6,seed:9187},{},{});},async dispose(){for(const p of paths)await p.dispose?.();}};
});
export default <Composition width={24} height={24} fps={24} durationInFrames={8}><Stage id="test" factory={picture}/><Layer source={ref('test')}/></Composition>;
`);
 const renderer=await Renderer.create(await buildProject(entry),{timeoutMs:120000,nativeGpu:{executable:resolve(executable!),rayQuery:true,slots:1,dynamic:'throughput',readback:'final-surface'}});
 const seen=new Map<number,Record<string,Float32Array|Uint32Array|Int32Array>>(),records=[];
 try{
  for(const frame of [0,1,2,3,4,5,5,2]){
   const mode=frame%3,names=['frameweave.final-surface','test/path-guide','test/path-motion','test/path-transport','test/path-cryptomatte','test/path-denoise-features',...mode===2?['test/primary-unit']:[]];
   const result=await renderer.captureNativeFrame(frame,names),data=Object.fromEntries(names.map(name=>[name,result.buffers[name].values]));
   for(const values of Object.values(data))assert.ok(values.every(Number.isFinite));
   if(seen.has(frame))for(const name of names)sameBytes(data[name],seen.get(frame)![name]);else seen.set(frame,Object.fromEntries(Object.entries(data).map(([name,v])=>[name,v.slice()])));
   if(mode===1)for(const name of names)sameBytes(data[name],seen.get(frame-1)![name],'No-op adapter must preserve every captured byte: '+name);
   if(mode!==2)continue;
   const before=seen.get(frame-2)!,pixels=data['frameweave.final-surface'],reference=before['frameweave.final-surface'],coverage=data['test/path-cryptomatte'],features=data['test/path-denoise-features'];
   assert.ok(pixels instanceof Float32Array&&coverage instanceof Uint32Array&&features instanceof Float32Array);
   const colors=[[.7,.2,.1],[.1,.5,.2],[.02,.05,.9],[.9,0,0],[.2,.8,.1],[1,1,1],[1,1,1]];
   let error=0,protectedPixels=0,changed=0,mixed=0,glass=0,emission=0,shieldedSamples=0;
   for(let p=0;p<576;p++){
    const counts=new Uint32Array(8);
    for(let s=0;s<64;s++){
     const old:number=before['test/path-cryptomatte'][s*576+p],next:number=coverage[s*576+p],front=(id:number)=>id===3||id===5||id===6||id===7;
     if(front(old)||front(next)){assert.equal(next,old,'Ray bending must preserve foreground coverage even at Alpha/lens/shutter silhouettes');shieldedSamples++;}
     counts[next]++;
    }
    assert.equal(counts[4],0,'Invisible Alpha-mask surface must not become a geometric shield');
    if(counts[5]>0&&counts[5]<64)mixed++;glass+=counts[6];emission+=counts[7];
    const average=[0,0,0];for(let id=1;id<8;id++)for(let c=0;c<3;c++)average[c]+=counts[id]/64*colors[id-1][c];
    for(let c=0;c<3;c++)error=Math.max(error,Math.abs(features[p*3+c]-average[c]));
    if(counts[3]===64){protectedPixels++;for(let c=0;c<4;c++)assert.equal(pixels[p*4+c],reference[p*4+c]);}
    if(Math.abs(pixels[p*4]-reference[p*4])>1e-4)changed++;
   }
   assert.ok(error<1e-6,JSON.stringify({error}));assert.ok(protectedPixels>8&&changed>5&&mixed>0&&glass>0&&emission>0,JSON.stringify({protectedPixels,changed,mixed,glass,emission}));
   const unit=data['test/primary-unit'];for(let p=0;p<576;p++){assert.ok(unit[p*4]<1e-6);assert.equal(unit[p*4+1],0);}
   records.push({frame,optics:frame>=3?'AA+lens+shutter':'AA',independentFeatureError:error,protectedPixels,shieldedSamples,changed,mixed,glassSamples:glass,emissionSamples:emission});
  }
  await assert.rejects(renderer.captureNativeFrame(6,['frameweave.final-surface']),/deliberate primary failure/);
  await assert.rejects(renderer.captureNativeFrame(7,['frameweave.final-surface']),error=>{
   assert.ok(error instanceof EngineError);assert.equal(error.code,'E_NATIVE_BUDGET');assert.equal(error.frame,0);assert.equal(error.stageId,'test');
   assert.equal(error.hint,'review the caller budget');assert.deepEqual(error.details,{cause:{code:'E_SOURCE',message:'original'},required:1024});return true;
  });
  sameBytes((await renderer.captureNativeFrame(0,['frameweave.final-surface'])).buffers['frameweave.final-surface'].values,seen.get(0)!['frameweave.final-surface'],'Failed recording must clean up and permit the next frame');
  const controller=new AbortController();controller.abort();await assert.rejects(renderer.captureNativeFrame(0,['frameweave.final-surface'],{signal:controller.signal}),{code:'E_RENDER_CANCELLED'});
  await writeFile(join(dir,'result.json'),JSON.stringify({version:1,records,defaultAllBuffersByteExact:true,failureRecovered:true,cancelRejected:true,stats:await renderer.nativeStats()},null,2));
  console.log(JSON.stringify({result:join(dir,'result.json'),records}));
 }finally{await renderer.close();await renderer.close();}
});
