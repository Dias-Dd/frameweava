import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {performance} from 'node:perf_hooks';
import {buildProject} from '../src/compiler/build.ts';import {Renderer} from '../src/render/renderer.ts';
const directory=resolve('artifacts/perf-tour');await mkdir(directory,{recursive:true});const label=process.argv[2]??'baseline';
const width=process.argv[3]===undefined?3840:Number(process.argv[3]);if(!Number.isInteger(width)||width<16||width>3840)throw Error('Supply a width from 16 to 3840');const height=Math.round(width*9/16);
const cases:unknown[]=[];
for(const name of ['project-4k60','project-servo-4k60']){
 const compileStart=performance.now(),build=await buildProject('examples/effects-library-tour/'+name+'.tsx'),compileMs=performance.now()-compileStart;
 const initStart=performance.now(),renderer=await Renderer.create(build,{width,height,nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'.frameweave/native-target/release/frameweave-native-gpu.exe'),window:true,dynamic:'interactive',slots:3,maxBytes:6*1024**3},timeoutMs:30000}),initMs=performance.now()-initStart;
 const r=renderer as any,rows:any[]=[];let sample:any;
 const wrap=(owner:any,key:string,field:string)=>{const fn=owner[key].bind(owner);owner[key]=async(...args:any[])=>{const t=performance.now();try{return await fn(...args);}finally{if(sample)sample[field]=(sample[field]??0)+performance.now()-t;}};};
 wrap(r.nativeLogic,'record','recordMs');wrap(r,'admitNativeResult','admitMs');wrap(r.nativeClient,'reconfigure','reconfigureMs');wrap(r.nativeClient,'submit','submitAckMs');
 let previous:any;
 const original=r.nativeLayoutKey.bind(r);r.nativeLayoutKey=(p:any,...args:any[])=>{if(sample){const t=performance.now();const key=original(p,...args);sample.keyMs=performance.now()-t;sample.data=p.data?.map((d:any)=>({length:d.length,initial:d.initial.length,immutable:!!d.immutable}));sample.passes=p.passes.length;sample.kernels=p.kernels.length;sample.changed=previous?{images:JSON.stringify(previous.images)!==JSON.stringify(p.images),data:JSON.stringify(previous.data)!==JSON.stringify(p.data),passes:JSON.stringify(previous.passes)!==JSON.stringify(p.passes),kernels:JSON.stringify(previous.kernels)!==JSON.stringify(p.kernels)}:null;previous=structuredClone(p);return key;}return original(p,...args);};
 try{for(const frame of [18,19,20,21,22,23,168,169,170,171,172,173]){sample={frame};const t=performance.now(),ticket=await renderer.submitNativeFrame(frame);sample.ackAtMs=performance.now()-t;await ticket.completed;sample.totalMs=performance.now()-t;sample.completionWaitMs=sample.totalMs-sample.ackAtMs;rows.push(sample);sample=undefined;}
  cases.push({name,width,height,working:'rgba32float scene-linear Rec709',display:'actual native window',maxBytes:6*1024**3,compileMs,initMs,rows,stats:await renderer.nativeStats()});
 }finally{await renderer.close();await writeFile(resolve(directory,label+'.json'),JSON.stringify({version:1,label,scope:'Caller → Native GPU completion with actual window; wait is not a GPU query. Profiling wrappers measure host phases; no PNG/encoding.',cases},null,2));}
}
console.log(JSON.stringify({file:resolve(directory,label+'.json'),cases:cases.map((c:any)=>({name:c.name,compileMs:c.compileMs,initMs:c.initMs,programUpdates:c.stats.programUpdates,frames:c.rows.map((r:any)=>({f:r.frame,total:r.totalMs,record:r.recordMs,admit:r.admitMs,reconfigure:r.reconfigureMs,ack:r.submitAckMs,wait:r.completionWaitMs,data:r.changed}))}))}));
