import assert from 'node:assert/strict';
import {readFile,copyFile,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as sdk from '@frameweave/engine/node';
const cwd=dirname(fileURLToPath(import.meta.url)),proof=join(cwd,'library-proof'),author=join(proof,'author'),root=dirname(dirname(fileURLToPath(import.meta.resolve('@frameweave/engine/cli'))));
const prior=JSON.parse(await readFile(join(proof,'results.json'),'utf8'));assert.equal(prior.sourceCommit,process.env.FRAMEWEAVE_TEST_COMMIT);assert.equal(prior.rows.length,6);assert.ok(prior.rows.every(row=>row.pass));
process.env.FRAMEWEAVE_HOME=join(cwd,'.library-home');
const file=join(author,'extra-channels.tsx');await copyFile(join(root,'examples/gpu-image-effects/channels.tsx'),file);
const policy={workingColor:sdk.linear709,transport:'buffer-v1',preview:{color:sdk.srgb,clip:true}},renderer=await sdk.Renderer.create(await sdk.buildProject(file),{cache:false,media:policy});
let report;
try{
 const frame=await renderer.renderMediaFrame(1),status=renderer.status();
 assert.equal(status.gpu.required,true);assert.deepEqual(frame.diagnostics,[]);
 for(const id of ['image','matteView']){
  const stats=frame.stageOutputs[id].stats.compositing;
  assert.ok(stats.calls>0);assert.equal(stats.owner.backend,'webgpu');assert.equal(stats.owner.owner.backendInfo.isFallbackAdapter,false);assert.equal(stats.owner.owner.liveBuffers,0);assert.equal(stats.owner.liveBytes,0);
 }
 assert.ok(sdk.pixelsFromSurface(frame.surface).some(value=>value>1));
 await writeFile(join(proof,'channels-final.png'),await sdk.mediaPreview(frame.surface,policy));
 report={sourceCommit:prior.sourceCommit,passed:true,checks:1,functions:['mergeMatte','alphaToRGB'],status};
}finally{await renderer.close();await renderer.close();}
await writeFile(join(proof,'channels-installed.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,checks:1,functions:report.functions}));
