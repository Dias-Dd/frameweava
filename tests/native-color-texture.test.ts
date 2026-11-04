import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {residentLayout} from '../modules/native-gpu/memory.ts';
import {borrowNativeScope} from '../modules/native-gpu/borrow.ts';
import {registerNativeScope} from '../modules/native-gpu/provenance.ts';
import {appendNativeComposite} from '../modules/native-gpu/composite.ts';
import type {TVG} from '../src/core/types.ts';
import {transformPixels,gamutMatrix} from '../src/media/color.ts';
import {linear709,linear2020,acescg,surfaceFromPixels,pixelsFromSurface,toHalf,fromHalf,type AlphaMode,type ColorEncoding} from '../src/media/surface.ts';

const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
const colors=[linear709,linear2020,{...linear709,primaries:'display-p3'} as ColorEncoding,acescg];
test('linear CPU reference preserves PM Alpha-zero emission through gamut and reference-white conversion',()=>{
 const emission=Float32Array.of(-.125,3,.25,0);
 for(const from of colors)for(const base of colors){const to={...base,referenceWhiteNits:203},pm=transformPixels(emission,from,to,'premultiplied').pixels,unassociated=transformPixels(emission,from,to,'straight').pixels;assert.deepEqual(pm,unassociated);assert.equal(pm[3],0);assert.ok(pm.slice(0,3).some(v=>v!==0));}
});
function recording(s:NativeRecordingScope){const {output,parameters,external:_e,kernelOffset:_k,moduleOffset:_m,...p}=s.packet();return {program:{...p,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:128*1024**2,display:null} as NativeProgram,parameters,output};}
const half=(v:number)=>fromHalf(toHalf(v));
function compare(actual:number[],expected:ArrayLike<number>,format:string,label:string){
 let maxScaled=0,maxAbsolute=0;assert.equal(actual.length,expected.length);
 for(let i=0;i<actual.length;i++){
  const e=expected[i],d=Math.abs(actual[i]-e);assert.ok(Number.isFinite(actual[i]),label);
  // F16 comparison permits one representable half step at a rounding boundary;
  // F32 uses an absolute+relative bound, including near-zero cancellation.
  const bound=format==='rgba16float'?Math.max(2**-24,2**(Math.floor(Math.log2(Math.max(Math.abs(e),2**-14)))-10))*1.001:2e-6*(1+Math.abs(e));
  assert.ok(d<=bound,`${label} component ${i}: ${actual[i]} vs ${e}, error ${d}, bound ${bound}`);
  maxAbsolute=Math.max(maxAbsolute,d);maxScaled=Math.max(maxScaled,d/(1+Math.abs(e)));
 }return {maxScaled,maxAbsolute};
}

test('explicit GPU color v1 matches CPU matrices for all four gamuts, reference whites, Alpha and F16/F32',async()=>{
 const s=new NativeRecordingScope(),cases:{id:number;expected:Float32Array;format:string;label:string}[]=[];
 const samples=[4,-.5,2,.75,-2,8,.125,.5,655,-400,7,.25,2e-5,-1e-5,4e-6,1,7,-3,2,0,1,1,1,1];
 for(const format of ['rgba32float','rgba16float'] as const)for(const alpha of ['straight','premultiplied','opaque'] as AlphaMode[])for(const from of colors){
  const p=Float32Array.from(samples);for(let n=0;n<p.length;n+=4){if(alpha==='opaque')p[n+3]=1;else if(alpha==='premultiplied'&&p[n+3]!==0)for(let c=0;c<3;c++)p[n+c]*=p[n+3];}
  const source=surfaceFromPixels(6,1,p,{format,color:from,alpha}),input=await s.api.upload(source),quantized=pixelsFromSurface(source);
  for(const base of colors){const to={...base,referenceWhiteNits:base===from?100:203},output=await s.api.convertColor(input,{version:1,color:to});s.publish(output);
   const expected=transformPixels(quantized,from,to,alpha).pixels;if(format==='rgba16float')for(let i=0;i<expected.length;i++)expected[i]=half(expected[i]);cases.push({id:-1,expected,format,label:`${from.primaries}->${to.primaries}/${alpha}/${format}`});
  }
 }
 // Deliberately cancel large positive and negative operands near zero.
 const m=gamutMatrix(linear709,acescg),cancel=Float32Array.of(10000,-10000*m[0][0]/m[0][1],.001,1),input=await s.api.upload(surfaceFromPixels(1,1,cancel,{format:'rgba32float',color:linear709,alpha:'straight'}));s.publish(await s.api.convertColor(input,{version:1,color:acescg}));cases.push({id:-1,expected:transformPixels(cancel,linear709,acescg,'straight').pixels,format:'rgba32float',label:'HDR cancellation'});
 const random=new Float32Array(256*4);let seed=7153;for(let i=0;i<random.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;random[i]=i%4===3?(seed%997+1)/998:(seed/2**32-.5)*20000;}
 const a=await s.api.upload(surfaceFromPixels(256,1,random,{format:'rgba32float',color:linear709,alpha:'premultiplied'})),to={...acescg,referenceWhiteNits:203};
 const b=await s.api.convertColor(a,{version:1,color:to}),converted=transformPixels(random,linear709,to,'premultiplied').pixels;cases.push({id:-1,expected:converted,format:'rgba32float',label:'random HDR and non-binary Alpha'});
 s.publish(await s.api.convertColor(b,{version:1,color:linear709}));cases.push({id:-1,expected:transformPixels(converted,to,linear709,'premultiplied').pixels,format:'rgba32float',label:'roundtrip'});
 const white={...linear709,referenceWhiteNits:200};s.publish(await s.api.convertColor(a,{version:1,color:white,format:'rgba16float'}));cases.push({id:-1,expected:Float32Array.from(transformPixels(random,linear709,white,'premultiplied').pixels,half),format:'rgba16float',label:'reference white only and explicit F32 to F16'});
 const f=recording(s);const selected=f.program.passes.filter(p=>f.program.kernels[p.kernel].kind==='color');cases.forEach((v,i)=>v.id=selected[i].output);const c=await NativeGpuClient.create(f.program,{executable});
 try{const t=await c.submit(0,f.parameters);await t.completed;const errors=[];for(const item of cases)errors.push({...item,expected:undefined,...compare((await c.inspectForTest(t.slot,item.id)).pixels,item.expected,item.format,item.label)});
  const stats=await c.stats();assert.equal(stats.devicesCreated,1);assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);assert.equal(stats.numericalValidationPasses,0);console.log(JSON.stringify({case:'color-v1',conversions:cases.length,errors,stats}));
 }finally{await c.close();await s.api.dispose();}
});

type Address='clamp'|'repeat'|'mirror'|'transparent';
function sample(p:Float32Array,alpha:AlphaMode,u:number,v:number,filter:string,mode:Address){
 const at=(x:number,y:number)=>{const addr=(i:number)=>mode==='clamp'?Math.max(0,Math.min(1,i)):mode==='repeat'?((i%2)+2)%2:mode==='mirror'?((i%4)+4)%4<2?((i%4)+4)%4:3-((i%4)+4)%4:i;x=addr(x);y=addr(y);if(x<0||x>1||y<0||y>1)return [0,0,0,0];const q=Array.from(p.slice((y*2+x)*4,(y*2+x)*4+4));if(alpha==='straight')for(let j=0;j<3;j++)q[j]*=q[3];else if(alpha==='opaque')q[3]=1;return q;};
 if(filter==='nearest')return at(Math.floor(u*2),Math.floor(v*2));const x=u*2-.5,y=v*2-.5,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,a=at(ix,iy),b=at(ix+1,iy),c=at(ix,iy+1),d=at(ix+1,iy+1);return a.map((_,i)=>(a[i]*(1-fx)+b[i]*fx)*(1-fy)+(c[i]*(1-fx)+d[i]*fx)*fy);
}

test('resident texture/UV v1 matches independent sampling for wraps, filters, Alpha, HDR, indices and F16/F32',async()=>{
 const s=new NativeRecordingScope(),g=s.api,positions=await g.createField({type:'f32',dimensions:[4,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},Float32Array.of(-1,1,.5,1,1,.5,-1,-1,.5,1,-1,.5)),indices=await g.createBuffer({type:'u32',length:6},Uint32Array.of(0,2,1,1,2,3)),cases:{id:number;expected:Float32Array;format:string;label:string}[]=[];
 const tint=[1.2,.7,-.5,.8] as const;
 for(const format of ['rgba32float','rgba16float'] as const)for(const alpha of ['straight','premultiplied','opaque'] as AlphaMode[]){
  const values=Float32Array.of(4,-2,1,.5,-1,2,8,.25,9,4,-3,0,2,3,4,1);if(alpha==='premultiplied')for(let i=0;i<16;i+=4)for(let j=0;j<3;j++)values[i+j]*=values[i+3];if(alpha==='opaque')for(let i=3;i<16;i+=4)values[i]=1;
  const source=surfaceFromPixels(2,2,values,{format,color:acescg,alpha}),pixels=pixelsFromSurface(source),image=await g.upload(source);
  for(const filter of ['nearest','linear'] as const)for(const mode of ['clamp','repeat','mirror','transparent'] as Address[]){
   const lo=-.625,hi=1.875,uvs=await g.createField({type:'f32',dimensions:[4,1,1],components:2,semantic:'generic'},Float32Array.of(lo,lo,hi,lo,lo,hi,hi,hi)),outAlpha=filter==='nearest'?'premultiplied':'straight';
   s.publish(await g.drawMesh({positions,indices,color:tint,texture:{version:1,image,uvs,filter,addressU:mode,addressV:mode},output:{width:4,height:4,format,alpha:outAlpha,color:acescg}}));
   const expected=new Float32Array(64);for(let y=0;y<4;y++)for(let x=0;x<4;x++){let q=sample(pixels,alpha,lo+(hi-lo)*(x+.5)/4,lo+(hi-lo)*(y+.5)/4,filter,mode);q=q.map((v,i)=>i===3?v*tint[3]:v*tint[i]*tint[3]);if(outAlpha==='straight'){if(q[3]===0)q=[0,0,0,0];else for(let i=0;i<3;i++)q[i]/=q[3];}for(let i=0;i<4;i++)expected[(y*4+x)*4+i]=format==='rgba16float'?half(q[i]):q[i];}
   cases.push({id:-1,expected,format,label:`${alpha}/${format}/${filter}/${mode}`});
  }
 }
 const f=recording(s);const selected=f.program.passes.filter(p=>!!p.draw);cases.forEach((v,i)=>v.id=selected[i].output);const c=await NativeGpuClient.create(f.program,{executable});try{const t=await c.submit(0,f.parameters);await t.completed;const errors=[];for(const item of cases)errors.push({label:item.label,...compare((await c.inspectForTest(t.slot,item.id)).pixels,item.expected,item.format,item.label)});const stats=await c.stats();assert.equal(stats.devicesCreated,1);assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);console.log(JSON.stringify({case:'mesh-texture-v1',draws:cases.length,errors,stats}));}finally{await c.close();await g.dispose();}
});

test('mesh UV interpolation is perspective correct, not affine',async()=>{
 // Project to exact integer screen coordinates. This isolates perspective
 // interpolation from implementation-specific rasterizer subpixel snapping.
 const s=new NativeRecordingScope(),g=s.api,xyz=[[-.75,-.75,1],[.375,-.375,.5],[0,1.5,2]],uv=[[0,1],[1,1],[.5,0]],positions=await g.createField({type:'f32',dimensions:[3,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},Float32Array.from(xyz.flat())),uvs=await g.createField({type:'f32',dimensions:[3,1,1],components:2,semantic:'generic'},Float32Array.from(uv.flat())),pixels=Float32Array.of(0,0,0,1,4,0,0,1,0,4,0,1,4,4,0,1),image=await g.upload(surfaceFromPixels(2,2,pixels,{format:'rgba32float',color:linear709,alpha:'opaque'}));
 s.publish(await g.drawMesh({positions,texture:{version:1,image,uvs},matrix:[1,0,0,0,0,1,0,0,0,0,.25,1,0,0,0,0],output:{width:16,height:16,format:'rgba32float',alpha:'premultiplied',color:linear709}}));const f=recording(s);const c=await NativeGpuClient.create(f.program,{executable});
 try{const t=await c.submit(0,f.parameters);await t.completed;const actual=(await c.inspectForTest(t.slot,f.output)).pixels;const w=xyz.map(p=>p[2]),screen=xyz.map((p,i)=>[(p[0]/w[i]*.5+.5)*16,(.5-p[1]/w[i]*.5)*16]);const [a,b,d]=screen,x=8.5,y=8.5,den=(b[1]-d[1])*(a[0]-d[0])+(d[0]-b[0])*(a[1]-d[1]),l0=((b[1]-d[1])*(x-d[0])+(d[0]-b[0])*(y-d[1]))/den,l1=((d[1]-a[1])*(x-d[0])+(a[0]-d[0])*(y-d[1]))/den,l=[l0,l1,1-l0-l1];assert.ok(l.every(v=>v>0));const divisor=l.reduce((n,v,i)=>n+v/w[i],0),q=[0,1].map(j=>l.reduce((n,v,i)=>n+v*uv[i][j]/w[i],0)/divisor),expected=sample(pixels,'opaque',q[0],q[1],'linear','clamp');compare(actual.slice((8*16+8)*4,(8*16+8)*4+4),expected,'rgba32float','perspective');const affine=[0,1].map(j=>l.reduce((n,v,i)=>n+v*uv[i][j],0));assert.ok(Math.abs(q[0]-affine[0])+Math.abs(q[1]-affine[1])>.01);}finally{await c.close();await g.dispose();}
});

test('color/texture admission rejects foreign handles, implicit color conversion and malformed private layouts',async()=>{
 const s=new NativeRecordingScope(),g=s.api,other=new NativeRecordingScope(),image=await g.upload(surfaceFromPixels(1,1,[4,-1,2,.5],{format:'rgba32float',color:linear709,alpha:'straight'})),positions=await g.createField({type:'f32',dimensions:[3,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},Float32Array.of(-1,-1,.5,1,-1,.5,0,1,.5)),uvs=await g.createField({type:'f32',dimensions:[3,1,1],components:2,semantic:'generic'},new Float32Array(6));
 await assert.rejects(other.api.convertColor(image,{version:1,color:acescg}),{code:'E_NATIVE_SCOPE'});await assert.rejects(g.convertColor(image,{version:2 as 1,color:acescg}),{code:'E_NATIVE_SCOPE'});await assert.rejects(g.convertColor(image,{version:1,color:{...linear709,transfer:'pq',reference:'display'}}),{code:'E_GPU_PIXEL_CONTRACT'});await assert.rejects(g.convertColor(image,{version:1,color:{...linear709,referenceWhiteNits:1e-300}}),{code:'E_NATIVE_COLOR'});
 const kernel=await g.compile({abiVersion:1,id:'test/no-implicit-color',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p));}'});await assert.rejects(g.run(kernel,[image],{output:{color:acescg}}),{code:'E_NATIVE_SCOPE'});
 const draw={positions,texture:{version:1 as const,image,uvs},output:{width:4,height:4,format:'rgba32float' as const,alpha:'premultiplied' as const,color:linear709}};await assert.rejects(g.drawMesh({...draw,output:{...draw.output,color:acescg}}),{code:'E_NATIVE_SCOPE'});const short=await g.createField({type:'f32',dimensions:[1,1,1],components:2,semantic:'generic'},new Float32Array(2));await assert.rejects(g.drawMesh({...draw,texture:{...draw.texture,uvs:short}}),{code:'E_NATIVE_SCOPE'});
 s.publish(await g.drawMesh(draw));const f=recording(s);for(const mutate of [(p:NativeProgram)=>{p.passes.at(-1)!.draw!.uvs=999;},(p:NativeProgram)=>{p.passes.at(-1)!.draw!.textureVersion=2 as 1;},(p:NativeProgram)=>{p.passes.at(-1)!.header[8]=4;},(p:NativeProgram)=>{p.images.at(-1)!.color=acescg;}]){const p=structuredClone(f.program);mutate(p);await assert.rejects(NativeGpuClient.create(p,{executable}),e=>/^E_NATIVE_(MESH|PASS)$/.test((e as {code:string}).code));}
 await g.release(image);await assert.rejects(g.convertColor(image,{version:1,color:acescg}),{code:'E_NATIVE_SCOPE'});await g.dispose();await g.dispose();await other.api.dispose();
});

test('UV centers, independent address axes, persistent UV state and release are explicit',async()=>{
 const s=new NativeRecordingScope(),g=s.api,positions=await g.createField({type:'f32',dimensions:[3,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},Float32Array.of(-1,-1,.5,3,-1,.5,-1,3,.5)),uvs=await g.createStateField({type:'f32',dimensions:[3,1,1],components:2,semantic:'generic'},Float32Array.of(1.25,-.25,1.25,-.25,1.25,-.25),{version:1,id:'uvs'});
 s.sealInitialization();s.beginFrame();await g.stateStep([uvs],{version:1,epoch:0,step:0,reset:true});const image=await g.upload(surfaceFromPixels(2,2,[4,-1,2,.5,1,2,3,1,6,2,1,.25,8,1,2,1],{format:'rgba32float',color:linear709,alpha:'straight'}));
 s.publish(await g.drawMesh({positions,texture:{version:1,image,uvs,addressU:'repeat',addressV:'clamp'},output:{width:2,height:2,format:'rgba32float',alpha:'premultiplied',color:linear709}}));await g.release(image);await g.releaseBuffer(uvs);
 const f=recording(s),c=await NativeGpuClient.create(f.program,{executable});try{const t=await c.submit(0,f.parameters);await t.completed;const p=(await c.inspectForTest(t.slot,f.output)).pixels;for(let i=0;i<p.length;i+=4)assert.deepEqual(p.slice(i,i+4),[2,-.5,1,.5]);const missing=structuredClone(f.program);missing.passes.shift();const c2=await NativeGpuClient.create(missing,{executable});try{await assert.rejects(c2.submit(0,f.parameters.slice(1)),{code:'E_NATIVE_STATE_SEQUENCE'});}finally{await c2.close();}}finally{await c.close();await g.dispose();}
});

test('image aliases used by resident mesh buffers extend allocation lifetime',()=>{
 const image={width:2,height:1,format:'rgba32float',alpha:'straight',color:linear709},p:NativeProgram={version:2,session:'a'.repeat(64),slots:1,maxBytes:1024**2,images:[image,image,image,image],kernels:[],passes:[{kernel:0,inputs:[],output:0,header:[]},{kernel:0,inputs:[],output:1,header:[]},{kernel:0,inputs:[],output:2,header:[],draw:{positions:0,uvs:0,textureVersion:1,count:3}},{kernel:0,inputs:[],output:3,header:[]}],data:[{length:8,type:'f32',initial:[],sourceImage:0}],display:null};const layout=residentLayout(p);assert.notEqual(layout.mapping[0],layout.mapping[1]);assert.notEqual(layout.mapping[0],layout.mapping[2]);
});

test('borrowed module lease owns converted images and cleans up without releasing its input',async()=>{
 const s=new NativeRecordingScope(),g=s.api;registerNativeScope(g,{version:1,backend:'native-wgpu',owner:'a'.repeat(64),hardwareVerified:true,capabilities:{...g.capabilities(),hardwareVerified:true}});
 const input=await g.upload(surfaceFromPixels(1,1,[4,-1,2,.5],{format:'rgba32float',alpha:'straight',color:linear709})),lease=borrowNativeScope(g),converted=await lease.scope.convertColor(input,{version:1,color:acescg});await assert.rejects(lease.scope.release(input),{code:'E_NATIVE_RESOURCE_OWNER'});await lease.dispose();await lease.dispose();await assert.rejects(g.convertColor(converted,{version:1,color:linear709}),{code:'E_NATIVE_SCOPE'});await g.release(input);await g.dispose();
});

test('composition checks placed Layer and Mask colors, allowing explicitly converted intermediate Stages',()=>{
 const image={width:2,height:1,format:'rgba32float',alpha:'premultiplied'},p:NativeProgram={version:2,session:'a'.repeat(64),slots:1,maxBytes:1024**2,images:[{...image,color:acescg},{...image,color:linear709}],kernels:[],passes:[],display:null};
 const tvg={schemaVersion:'0.1',composition:{id:'test',width:2,height:1,fps:{num:24,den:1},durationInFrames:2,background:'transparent',seed:1},effects:[],resources:[],layers:[{id:'final',start:0,end:2,source:{$ref:'converted',port:'surface'}}],stages:['intermediate','converted'].map(id=>({id,engine:'native-gpu',inputs:{},outputs:{surface:'surface'},props:{},time:{start:0,duration:2,offset:0,rate:{num:1,den:1}},seek:'stateless'}))} as TVG,outputs=new Map([['intermediate:surface',0],['converted:surface',1]]);
 assert.equal(appendNativeComposite(structuredClone(p),[],tvg,0,outputs,2,1),1);
 const placed=structuredClone(tvg);placed.layers.push({id:'other',start:0,end:2,source:{$ref:'intermediate',port:'surface'}});assert.throws(()=>appendNativeComposite(structuredClone(p),[],placed,0,outputs,2,1),{code:'E_NATIVE_COLOR'});
 const masked=structuredClone(tvg);masked.layers[0].mask={$ref:'intermediate',port:'surface'};assert.throws(()=>appendNativeComposite(structuredClone(p),[],masked,0,outputs,2,1),{code:'E_NATIVE_COLOR'});
});
