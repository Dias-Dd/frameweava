import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {buildProject} from '../src/compiler/build.ts';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
await import(pathToFileURL(resolve('artifacts/main-mixed-audio/cancel.mjs')).href);
const dir=resolve('.frameweave/main-mixed-audio/cancel'),entry=join(dir,'export.tsx'),source=await readFile(join(dir,'project.tsx'),'utf8');
await writeFile(entry,source.replace("<Layer source={ref('picture')}/>","<Layer source={ref('picture')}/><Layer source={ref('sound','audio')}/>"));
const build=await buildProject(entry),controller=new AbortController();let started=0,timer:ReturnType<typeof setTimeout>|undefined;
try{const task=renderNativeProject(entry,{build,native:process.env.FRAMEWEAVE_NATIVE_GPU!,signal:controller.signal,output:join(dir,'cancelled.mp4'),start:0,end:1,encoder:'libx264',onProgress:event=>{if(event.phase==='audio'&&!started){started=performance.now();timer=setTimeout(()=>controller.abort(),100);}}});
 await assert.rejects(task,{code:'E_RENDER_CANCELLED'});assert.ok(started>0);const serviceCancelMs=performance.now()-started;assert.ok(serviceCancelMs<2500,`Native export cancellation waited ${serviceCancelMs}ms`);console.log(JSON.stringify({serviceCancelMs,stageDefaultTimeoutMs:20000}));
}finally{clearTimeout(timer);controller.abort();}
