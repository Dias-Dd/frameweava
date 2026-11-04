import {imageEmitterGpu} from './image-emitter-gpu.ts';
import {createParticleRenderer} from '../src/renderer.ts';
import {pixelsFromSurface} from '../../../src/media/surface.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import type {ParticleFrame} from '../src/types.ts';
const context:FrameContext={frame:0,globalFrame:0,time:0,globalTime:0,dt:1/24,progress:0,fps:{num:24,den:1},durationInFrames:49,seed:1};
const frame=(count=1):ParticleFrame=>({frame:0,time:0,fps:{num:24,den:1},seed:1,step:0,emitted:count,contacts:[],particles:Array.from({length:count},(_,id)=>({id,birthTime:0,lifetime:10,radius:1,position:[0,0,0],velocity:[0,0,0],trail:[]}))});
const check=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
async function rejection(run:()=>unknown,code:string){try{await run();}catch(e){check((e as {code?:string}).code===code,`Expected ${code}, got ${String(e)}`);return;}throw Error(`Missing expected ${code}`);}
const nextTask=()=>new Promise<void>(resolve=>{const c=new MessageChannel();c.port1.onmessage=()=>{c.port1.close();c.port2.close();resolve();};c.port2.postMessage(null);});
export async function browserChecks(software:boolean){
  if(software){await rejection(()=>createParticleRenderer({width:32,height:32}),'E_SPATIAL_GPU_UNAVAILABLE');return {softwareRejected:true};}
  const outcomes:string[]=[],owners:ReturnType<typeof createParticleRenderer>[]=[];
  const create=(chunkInstances=32)=>{const owner=createParticleRenderer({width:32,height:32,viewHeight:4,chunkInstances});owners.push(owner);return owner;};
  try{
    const owner=create(),one=pixelsFromSurface(await owner.render(frame(),context,{ink:[-1,4,2],opacity:.5,fadeWithAge:false})),i=(16*32+16)*4;
    check(one[i]===-.5&&one[i+1]===2&&one[i+2]===1&&one[i+3]===.5,'Linear signed/HDR center pixel');
    check(one[3]===0&&one.some((v,j)=>j%4===3&&v>0&&v<.5),'Transparent / soft edge');
    const two=pixelsFromSurface(await owner.render(frame(2),context,{ink:[-1,4,2],opacity:.5}));
    check(two[i]===-.75&&two[i+1]===3&&two[i+3]===.75,'Premultiplied source-over independent known result');outcomes.push('known F32 RGBA, Alpha, black/white over');
    // Visible composites are compared independently from hidden RGB and alpha.
    for(const bg of [0,1])for(let c=0;c<3;c++)check(Math.abs(two[i+c]+bg*(1-two[i+3])-([-.75,3,1.5][c]+bg*.25))<1e-7,'Visible over background mismatch');
    const small=create(1),chunked=pixelsFromSurface(await small.render(frame(2),context,{ink:[-1,4,2],opacity:.5}));check(two.every((v,j)=>v===chunked[j]),'Chunk boundary changed blending');outcomes.push('chunk1/32 identical');
    const empty=pixelsFromSurface(await owner.render(frame(0),context));check(empty.every(v=>v===0),'Empty is transparent');
    const half=await owner.render(frame(),context,{ink:[-1,4,2],opacity:.5},'rgba16float');check(half.format==='rgba16float'&&pixelsFromSurface(half)[i+1]===2,'Real half publication');outcomes.push('empty/half');
    const future={...context,frame:12,time:.5,globalFrame:12,globalTime:.5},futureSample={...frame(),frame:12,time:.5};
    const signal=pixelsFromSurface(await owner.render(futureSample,future,{ink:[-1,4,2],opacity:{$keyframes:[{frame:0,value:0},{frame:24,value:1}]},fadeWithAge:false}));check(signal.every((v,j)=>v===one[j]),'Signal must use supplied Stage context');outcomes.push('existing Signal absolute context');
    const pending=owner.render(frame(),context,{ink:[-1,4,2],opacity:.5}),closing=owner.dispose();check(closing===owner.dispose(),'dispose must share completion');
    await rejection(()=>owner.render(frame(),context),'E_SPATIAL_BUSY');await pending;await closing;await rejection(()=>owner.render(frame(),context),'E_SPATIAL_DISPOSED');
    const released=owner.stats();check(released.geometries===0&&released.textures===0&&released.fencesCreated===released.fencesDestroyed,'Release counts');outcomes.push('busy/drain/idempotent disposal');
    const fail=create();await rejection(()=>fail.render(frame(),context,{ink:[1e300,0,0]}),'E_SPATIAL_GPU_RANGE');check(fail.stats().draws===0,'Invalid attribute submitted');await rejection(()=>fail.render(frame(),context),'E_SPATIAL_GPU_FAILED');outcomes.push('F32 input range rejected before draws');
    const overflow=create();await rejection(()=>overflow.render(frame(),context,{ink:[1e6,0,0],fadeWithAge:false},'rgba16float'),'E_MEDIA_RANGE');check(overflow.stats().failed,'Half overflow must not silently clamp or replay');outcomes.push('half overflow terminal');
    // Test-only context capture. No public device handle or test backdoor in the module.
    const original=document.createElement.bind(document);let canvas:HTMLCanvasElement|undefined;
    document.createElement=((tag:string,...args:unknown[])=>{const result=(original as any)(tag,...args);if(tag==='canvas')canvas=result;return result;}) as typeof document.createElement;
    let lost:ReturnType<typeof createParticleRenderer>;
    try{lost=create();}finally{document.createElement=original;}
    const gl=canvas!.getContext('webgl2')!;const lose=gl.getExtension('WEBGL_lose_context');check(lose,'WEBGL_lose_context unavailable');
    const inFlight=lost!.render(frame(),context);lose!.loseContext();await rejection(()=>inFlight,'E_SPATIAL_GPU_LOST');await nextTask();await lost!.dispose();outcomes.push('real context loss during fence cleanup');
    return {imageEmitter:await imageEmitterGpu(),outcomes,backend:small.stats().backend,released,knownPixel:Array.from(two.slice(i,i+4))};
  }finally{for(const owner of owners)await owner.dispose();}
}
