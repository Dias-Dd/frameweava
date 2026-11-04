/** Independent Decimal records and a Node-only scalar benchmark; not a new execution service. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createInertia} from '../src/inertia.ts';
import type {FrameContext} from '../../../src/core/types.ts';
const at=(seconds:number):FrameContext=>({frame:seconds*12,fps:{num:12,den:1},time:seconds,globalFrame:0,globalTime:0,dt:1/12,durationInFrames:12,progress:0,seed:17});
const fixture=JSON.parse(await readFile('modules/pro-animation/validation/inertia-reference/decimal-reference.json','utf8'));
const rows=fixture.cases.map((r:any)=>{const s=createInertia({from:r.origin,velocity:r.velocity,timeConstantSeconds:r.tau}),out=s.sample(at(r.time));return {input:r,actual:out,valueError:Math.abs(out.value-Number(r.value)),velocityError:Math.abs(out.velocity-Number(r.speed))};});
for(const row of rows){assert.ok(row.valueError<=Math.max(1e-10,Math.abs(Number(row.input.value))*3e-16));assert.ok(row.velocityError<=1e-10);}
const free=createInertia({from:0,velocity:1000,timeConstantSeconds:.25}),bounded=createInertia({from:0,velocity:1000,timeConstantSeconds:.25,bounds:{max:100,spring:{damping:15}}});
const count=20000,warmup=10000,batches=5,latency=[];let checksum=0;
for(let i=0;i<warmup;i++)checksum+=bounded.valueAt(at((i%971)/100));
for(const [label,response] of [['decay',free],['bounded',bounded]] as const){for(let batch=0;batch<batches;batch++){const start=performance.now();for(let i=0;i<count;i++){const result=response.sample(at(((i*7919)%977)/100));checksum+=result.value+result.velocity;}const ms=performance.now()-start;latency.push({label,batch,count,ms,microsecondsPerSample:ms*1000/count});}}
const result={node:process.version,platform:process.platform,arch:process.arch,numericReference:{precision:fixture.precision,inputSemantics:fixture.inputSemantics,cases:rows,maxValueError:Math.max(...rows.map((r:any)=>r.valueError)),maxVelocityError:Math.max(...rows.map((r:any)=>r.velocityError)),budgets:{value:'max(1e-10, abs(expected)*3e-16)',velocity:1e-10}},benchmark:{scope:'Node-only hot scalar function + FrameContext allocation/rational validation; not CLI/Stage/GPU time',warmup,count,batches,latency,checksum},limits:['No browser/Worker/WASM is imported or launched by this script.','No cross-runtime bit identity claim; dedicated Stage strict failure retained.','No throughput SLA, peak memory or long simulation measurement.']};
await mkdir(resolve('.frameweave/pa3-inertia'),{recursive:true});await writeFile(resolve('.frameweave/pa3-inertia/numeric-proof.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({maxValueError:result.numericReference.maxValueError,maxVelocityError:result.numericReference.maxVelocityError,latency}));
