import {test} from 'node:test';
import assert from 'node:assert/strict';
import {depthRangeMatte} from '../modules/spatial-fields/index.ts';
import {camera,descriptor,validityDescriptor} from '../modules/spatial-fields/parameters.ts';
import type {SpatialField,SpatialCamera,DepthMatteOptions,FrameContext} from '../modules/spatial-fields/types.ts';
import type {GpuPixelScope} from '../modules/gpu-effects/index.ts';
const ctx={frame:0,time:0,fps:{num:24,den:1},dt:1/24,seed:91} as FrameContext;
const cam:SpatialCamera={projection:'perspective',position:[0,0,4],target:[0,0,0],near:.1,far:20,verticalFov:50};
const field=():SpatialField=>{const data=descriptor('axial-depth',[4,2,1],ctx,{camera:camera(cam,4,2).key}),mask=validityDescriptor([4,2,1],ctx);const info=(d:any)=>({...d,version:1,kind:'data',origin:[0,0,0],domain:[4,2,1],length:8,byteLength:32});return {data:{info:info(data)},validity:{info:info(mask)}} as any;};
const gpu=new Proxy({},{get(){throw Error('Invalid admission must not access GPU');}}) as GpuPixelScope;
for(const [name,options]of [
  ['reversed interval',{near:5,far:4}],['collapsed interval',{near:1e8-1,far:1e8}],
  ['overlapping feathers',{near:2,far:4,softness:1.01}],['unrepresentable feather',{near:1e7,far:1e7+20,softness:.001}],
  ['negative softness',{softness:-1}],['SDR output',{format:'rgba8unorm'}],['unknown option',{wrong:true}],
] as const)test(name,async()=>assert.rejects(depthRangeMatte(gpu,field(),ctx,{camera:cam,...options} as DepthMatteOptions),(e:any)=>e.code==='E_SPATIAL_FIELD_PARAMETER'));
test('sample and camera seals are required',async()=>{await assert.rejects(depthRangeMatte(gpu,field(),{...ctx,frame:1,time:1/24},{camera:cam}),(e:any)=>e.code==='E_SPATIAL_FIELD_TIME');await assert.rejects(depthRangeMatte(gpu,field(),ctx,{camera:{...cam,far:21}}),(e:any)=>e.code==='E_SPATIAL_FIELD_CAMERA');});
for(const key of ['space','units','channels','length','byteLength'] as const)test('depth '+key+' mismatch',async()=>{const f=field();(f.data.info as any)[key]=key==='length'?7:key==='byteLength'?28:key==='channels'?['red']:'wrong';await assert.rejects(depthRangeMatte(gpu,f,ctx,{camera:cam}),(e:any)=>e.code==='E_SPATIAL_FIELD_FIELD');});
test('validity profile is required',async()=>{const f=field();(f.validity.info.metadata as any).profile='unknown';await assert.rejects(depthRangeMatte(gpu,f,ctx,{camera:cam}),(e:any)=>e.code==='E_SPATIAL_FIELD_FIELD');});
test('cancel and work budget reject before allocation',async()=>{await assert.rejects(depthRangeMatte(gpu,field(),ctx,{camera:cam,signal:AbortSignal.abort()}),(e:any)=>e.code==='E_RENDER_CANCELLED');await assert.rejects(depthRangeMatte(gpu,field(),ctx,{camera:cam,maxWork:1}),(e:any)=>e.code==='E_SPATIAL_FIELD_BUDGET');});
test('option accessors are not invoked',async()=>{let calls=0;await assert.rejects(depthRangeMatte(gpu,field(),ctx,{camera:cam,get near(){calls++;return 1;}}),(e:any)=>e.code==='E_SPATIAL_FIELD_PARAMETER');assert.equal(calls,0);});
