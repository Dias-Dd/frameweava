import {mkdir,writeFile,readFile} from 'node:fs/promises';import {resolve} from 'node:path';import assert from 'node:assert/strict';
import {buildProject} from '../src/compiler/build.ts';import {Renderer} from '../src/render/renderer.ts';
const mode=process.argv[2]??'before',out=resolve('artifacts/perf-tour/reference');await mkdir(out,{recursive:true});
const rows=[];
for(const name of ['project-4k60','project-servo-4k60']){
 const build=await buildProject('examples/effects-library-tour/'+name+'.tsx'),renderer=await Renderer.create(build,{width:320,height:180,nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'.frameweave/native-target/debug/frameweave-native-gpu.exe'),window:true,dynamic:'interactive',slots:2,maxBytes:128*1024**2}});
 try{for(const frame of [168,169,170,171]){const ticket=await renderer.submitNativeFrame(frame);await ticket.completed;const internal=renderer as any,index=internal.nativePlan.program.passes.at(-1).output;
 const raw=await internal.nativeClient.inspectForTest(ticket.slot,index),display=await internal.nativeClient.inspectDisplayForTest(ticket.slot);
 for(const [kind,values]of Object.entries({scene:raw.pixels,display:display.pixels}) as [string,number[]][]){const bytes=Buffer.from(Float32Array.from(values).buffer),file=resolve(out,`${name}-${frame}-${kind}.f32`);if(mode==='before')await writeFile(file,bytes);else assert.deepEqual(bytes,await readFile(file));}
 }rows.push({name,frames:[168,169,170,171],ok:true,stats:await renderer.nativeStats()});}finally{await renderer.close();}
}
await writeFile(resolve(out,mode+'.json'),JSON.stringify({mode,ok:true,scope:'320x180 correctness only; actual scene and display Float32 bytes, four evolving frames, same GPU. Not a 4K performance measurement.',rows},null,2));console.log(JSON.stringify({mode,ok:true,cases:rows.length}));
