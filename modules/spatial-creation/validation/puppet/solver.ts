/** L0 original-WASM algorithm check, NOT a public package/SDK integration test. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';
import {imagePuppetLayout} from '../../puppet-layout.ts';import {puppetMotionDefaults,puppetMotionPins,puppetMotionTargets,type PuppetMotion} from '../../puppet.ts';
import {createNativePuppetTools} from '../../../puppet-effects/native.ts';import type {ModuleLoader} from '../../../../src/plugins/sdk.ts';import type {FrameContext} from '../../../../src/core/types.ts';
const pack=resolve(process.env.CREATION_PACKAGE??'.frameweave/spatial-creation/puppet-package-003'),bytes=new Uint8Array(await readFile(join(pack,'wasm/puppet.wasm'))),sha=createHash('sha256').update(bytes).digest('hex'),provenance=JSON.parse(await readFile(join(pack,'PROVENANCE.json'),'utf8'));
if(sha!==provenance.solverSha256['puppet-effects'])throw Error('Unreviewed solver bytes');
const load=(async()=>bytes) as ModuleLoader,rows:any[]=[],start=performance.now();
for(const size of [[320,400],[8,8]])for(const kind of Object.keys(puppetMotionDefaults) as PuppetMotion[]){
 const pins=puppetMotionPins(kind),layout=imagePuppetLayout(640,360,...size as [number,number],{pins}),solver=await createNativePuppetTools(load).createPuppet(layout.mesh);
 try{for(let i=0;i<32;i++){const phase=i/32*Math.PI*2,c:FrameContext={frame:i,globalFrame:i,time:i/24,globalTime:i/24,dt:1/24,progress:i/31,fps:{num:24,den:1},durationInFrames:32,seed:7},targets=puppetMotionTargets(kind,pins,{phase,frequency:0},c);
  try{const result=await solver.solve({pins:Object.entries(targets).map(([name,p])=>({vertexId:layout.byName[name],position:layout.world(p)}))});rows.push({kind,size,phase,...result.diagnostics});}catch(error){console.error('SOLVER_PHASE',kind,size,phase,error);throw error;}
 }}finally{await solver.dispose();}
}
const out=resolve(process.env.CREATION_EVIDENCE??'modules/spatial-creation/validation/puppet/evidence');await mkdir(out,{recursive:true});await writeFile(join(out,'solver-cycle.json'),JSON.stringify({backend:'Node original compiled WASM; separate from Native GPU/SpiderMonkey acceptance',solverSha256:sha,wallMs:performance.now()-start,solves:rows.length,rows},null,2));console.log('PASS',rows.length,'original WASM default-pose solves across complete cycles and two aspects');
