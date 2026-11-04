import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import type {MeshData} from '../modules/puppet-effects/src/types.ts';
import {createPuppetProcessorTools} from '../modules/puppet-effects/src/processor.ts';import {createPuppetTools,encodeSolve,prepareMesh} from '../modules/puppet-effects/src/solver.ts';
import {validateMeshData} from '../modules/graphics-contracts/index.ts';import {surfaceFromPixels,linear709,srgb,type PixelFormat} from '../src/media/surface.ts';import type {ModuleLoader} from '../src/plugins/sdk.ts';import {instantiateModule} from '../modules/puppet-effects/runtime/session.mjs';import {gridMesh} from '../modules/puppet-effects/validation/fixtures.ts';
const wasm=await readFile('modules/puppet-effects/dist/module.wasm'),tools=createPuppetProcessorTools({validateMeshData},(async()=>new Uint8Array(wasm)) as ModuleLoader),options={id:'alpha',world:{left:0,right:32,bottom:0,top:24},edgeLengthPx:4};
function image(w:number,h:number,alpha:(x:number,y:number)=>number,format:PixelFormat='rgba32float',premult=false){const p=new Float32Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=alpha(x,y),i=(y*w+x)*4;p.set(format.includes('unorm')?[a*.2,a*.5,a*.7,a]:[-.25*(premult?a:1),3*(premult?a:1),.5*(premult?a:1),a],i);}return surfaceFromPixels(w,h,p,{format,color:format.includes('unorm')?srgb:linear709,alpha:premult?'premultiplied':'straight'});}
const ring=(x:number,y:number)=>x>=2&&x<22&&y>=2&&y<22&&!(x>=7&&x<17&&y>=7&&y<17)?1:0;
function area(mesh:MeshData){let sum=0;for(let k=0;k<mesh.indices.length;k+=3){const[a,b,c]=mesh.indices.slice(k,k+3).map(i=>mesh.restPositions[i]);const cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);assert.ok(cross>0);sum+=cross/2;}return sum;}
test('real WASM mask meshing preserves holes, disconnected regions, exact crack area and top-left UV',async()=>{
 const p=await tools.createPuppetProcessor({worker:false});try{const source=image(32,24,(x,y)=>ring(x,y)||x>=26&&x<30&&y>=5&&y<10?1:0),r=await p.generateMesh(source,options);assert.ok(r.mesh);assert.equal(r.components.length,2);assert.equal(r.contours.filter(c=>c.kind==='hole').length,1);assert.equal(r.diagnostics.areaPixels,320);assert.ok(Math.abs(area(r.mesh)-320)<1e-9);assert.equal(r.mesh.controls?.length,2);
 for(const [i,xy]of r.mesh.uv!.entries()){assert.equal(r.mesh.restPositions[i][0],xy[0]*32);assert.equal(r.mesh.restPositions[i][1],24-xy[1]*24);}
 for(let k=0;k<r.mesh.indices.length;k+=3){const v=r.mesh.indices.slice(k,k+3).map(i=>r.mesh!.uv![i]),cx=(v[0][0]+v[1][0]+v[2][0])/3*32,cy=(v[0][1]+v[1][1]+v[2][1])/3*24;assert.ok(!(cx>7&&cx<17&&cy>7&&cy<17),'hole must have no triangle');}
 const pins=r.components.map(c=>({vertexId:c.anchorVertexId,position:r.mesh!.restPositions[r.mesh!.vertexIds.indexOf(c.anchorVertexId)].slice(0,2) as [number,number]})),pose=await p.solve(r.mesh,{pins});for(let i=0;i<pose.positions.length;i++)for(let j=0;j<3;j++)assert.ok(Math.abs(pose.positions[i][j]-r.mesh.restPositions[i][j])<1e-6);assert.equal((await p.diagnostics()).buffers,0);
 }finally{assert.deepEqual(await p.dispose(),{remainingBuffers:0});}
});
test('hole fill and rejection are explicit; nested islands and empty alpha remain meaningful',async()=>{
 const p=await tools.createPuppetProcessor({worker:false});try{const source=image(32,24,ring),filled=await p.generateMesh(source,{...options,holes:'fill'});assert.equal(filled.diagnostics.areaPixels,400);assert.equal(filled.contours.filter(c=>c.kind==='hole'&&!c.includedBoundary).length,1);await assert.rejects(p.generateMesh(source,{...options,holes:'reject'}),{code:'E_PUPPET_HOLES'});
 const nested=await p.generateMesh(image(32,24,(x,y)=>ring(x,y)||x>=10&&x<14&&y>=10&&y<14?1:0),options);assert.equal(nested.components.length,2);assert.equal(nested.diagnostics.areaPixels,316);
 const empty=await p.generateMesh(image(32,24,()=>0),options);assert.equal(empty.mesh,null);assert.deepEqual(empty.components,[]);assert.deepEqual(empty.contours,[]);assert.equal(empty.diagnostics.vertices,0);
 }finally{await p.dispose();}
});
test('EDT expansion/erosion agrees with an independent brute-force discrete distance mask',async()=>{
 const p=await tools.createPuppetProcessor({worker:false});try{const w=20,h=16,mask=(x:number,y:number)=>x>=4&&x<15&&y>=4&&y<12?1:0;
 for(const expansion of [-2,-1,0,1,2]){const r=await p.generateMesh(image(w,h,mask),{...options,world:{left:0,right:w,bottom:0,top:h},edgeLengthPx:3,expansionPx:expansion});let count=0;for(let y=-4;y<h+4;y++)for(let x=-4;x<w+4;x++){let d=Infinity;for(let yy=-4;yy<h+4;yy++)for(let xx=-4;xx<w+4;xx++)if(!!mask(xx,yy)===(expansion>=0))d=Math.min(d,(x-xx)**2+(y-yy)**2);if(expansion>=0?!!mask(x,y)||d<=expansion**2:!!mask(x,y)&&d>expansion**2)count++;}assert.equal(r.diagnostics.expandedPixels,count);assert.ok(Math.abs(r.diagnostics.areaPixels-count)<1e-9);assert.ok(Math.abs(area(r.mesh!)-count)<1e-9);}
 }finally{await p.dispose();}
});
test('alpha membership ignores RGB/association/transfer, handles thresholds and RGBA8/16F/32F',async()=>{
 const p=await tools.createPuppetProcessor({worker:false});try{let expected:unknown;for(const format of ['rgba8unorm','rgb10a2unorm','rgba16float','rgba32float'] as const)for(const premult of [false,true]){const r=await p.generateMesh(image(32,24,ring,format,premult),options);if(expected)assert.deepEqual(r.mesh,expected);else expected=r.mesh;}
 const threshold=await p.generateMesh(image(32,24,(x,y)=>x>=4&&x<10&&y>=4&&y<12?.5:x>=15&&x<21&&y>=4&&y<12?.25:0),{...options,threshold:.5});assert.equal(threshold.diagnostics.selectedPixels,48);assert.equal(threshold.components.length,1);
 }finally{await p.dispose();}
});
test('deterministic rest mesh and solve across random calls, fresh processors and caller mutations',async()=>{
 const a=await tools.createPuppetProcessor({worker:false}),b=await tools.createPuppetProcessor({worker:false}),source=image(32,24,ring);try{const first=await a.generateMesh(source,options);for(const o of [{...options,expansionPx:1},options,{...options,edgeLengthPx:3},options]){const r=await a.generateMesh(source,o);if(o===options)assert.deepEqual(r,first);}assert.deepEqual(await b.generateMesh(source,options),first);first.mesh!.restPositions[0][0]=999;assert.notEqual((await a.generateMesh(source,options)).mesh!.restPositions[0][0],999);
 const made=await a.generateMesh(source,options),mesh=made.mesh!,i=mesh.vertexIds.indexOf(made.components[0].anchorVertexId),base=mesh.restPositions[i],constraint=(f:number)=>({pins:[{vertexId:mesh.vertexIds[i],position:[base[0]+f/100,base[1]] as [number,number]}]});let reference;for(const frame of [100,0,100,24,100]){const pose=await a.solve(mesh,constraint(frame));if(frame===100){if(reference)assert.deepEqual(pose,reference);else reference=pose;}}assert.deepEqual(await b.solve(mesh,constraint(100)),reference);
 }finally{await a.dispose();await b.dispose();}
});
test('bounds, budgets, concurrent calls, close and cancellation reject without poisoning successful retry',async()=>{
 const p=await tools.createPuppetProcessor({worker:false}),source=image(32,24,ring);try{
 for(const budget of [{maxVertices:3},{maxTriangles:1},{maxContours:1},{maxProcessedPixels:32},{maxWorkingBytes:1},{maxWork:1},{maxReplyBytes:48}])await assert.rejects(async()=>p.generateMesh(source,{...options,budget}),{code:'E_PUPPET_BUDGET'});
 for(const change of [{edgeLengthPx:0},{simplifyPx:-1},{threshold:2},{world:{left:1,right:0,bottom:0,top:1}},{oops:true}])assert.throws(()=>p.generateMesh(source,{...options,...change} as any),{code:'E_PUPPET_PARAMETER'});
 const active=p.generateMesh(source,options);assert.throws(()=>p.generateMesh(source,options),{code:'E_PUPPET_BUSY'});const closing=p.dispose();assert.throws(()=>p.generateMesh(source,options),{code:'E_PUPPET_DISPOSED'});assert.ok((await active).mesh);assert.deepEqual(await closing,{remainingBuffers:0});assert.deepEqual(await p.dispose(),{remainingBuffers:0});
 }finally{await p.dispose();}
 const c=new AbortController();c.abort();await assert.rejects(tools.createPuppetProcessor({worker:false,signal:c.signal}),{code:'E_WASM_CANCELLED'});
});
test('existing ARAP numerical bytes stay exact against frozen 0.1.1 WASM on old fixtures',async()=>{
 const old=await instantiateModule(await readFile('modules/puppet-effects/validation/frozen-0.1.1/module.wasm')),fresh=await instantiateModule(wasm),legacy=await createPuppetTools({validateMeshData},(async()=>new Uint8Array(wasm)) as ModuleLoader).createPuppet(gridMesh(),{worker:false});
 try{for(const size of [2,3,5]){const mesh=gridMesh(size,size),prepared=prepareMesh(mesh);for(const frame of [100,0,100,12,48]){const encoded=encodeSolve(prepared,{pins:[{vertexId:'v0',position:[-1,-1]},{vertexId:'v'+(size*size-1),position:[1+Math.sin(frame)*.15,1]}],refine:4},256000000);assert.deepEqual(fresh.call(1,encoded.bytes,16+mesh.vertexIds.length*16),old.call(1,encoded.bytes,16+mesh.vertexIds.length*16));}}
 assert.ok((await legacy.solve({pins:[{vertexId:'v0',position:[-1,-1]}]})).positions.length);const record=JSON.parse(await readFile('modules/puppet-effects/validation/frozen-0.1.1/build.json','utf8')),after=await readFile('modules/puppet-effects/rust/src/arap.rs');assert.equal(createHash('sha256').update(after).digest('hex'),record.inputs['rust/src/arap.rs']);assert.equal(createHash('sha256').update(await readFile('modules/puppet-effects/validation/frozen-0.1.1/module.wasm')).digest('hex'),record.outputs['dist/module.wasm']);assert.deepEqual(WebAssembly.Module.imports(await WebAssembly.compile(wasm)),[]);
 const source=JSON.parse(await readFile('modules/puppet-effects/vendor/effectcraft/SOURCE.json','utf8'));for(const f of source.files){const bytes=await readFile('modules/puppet-effects/vendor/effectcraft/'+f.local);assert.equal(bytes.length,f.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);}
 }finally{old.dispose();fresh.dispose();await legacy.dispose();}
});
