/** Strict characterization of the actual recorded Web Stage error. No simulated output or suppressed failure. */
import {readFile,writeFile} from 'node:fs/promises';
const proof=JSON.parse(await readFile('.frameweave/pa3-glyph/glyph-scene-proof.json','utf8'));
const cancellation=proof.rows.find((row:any)=>row.cancellation)?.cancellation;
if(!cancellation)throw new Error('Run the actual glyph Stage validation first');
const report={expectedLocalCode:'E_PA_GLYPH_CANCELLED',actualOuterCode:cancellation.code,stageId:cancellation.stageId,frame:cancellation.frame,originalCodeInMessage:cancellation.message.includes('E_PA_GLYPH_CANCELLED'),accepted:cancellation.code==='E_PA_GLYPH_CANCELLED',actual:cancellation,scope:'Local API exposes typed EngineError; current core Web Stage only forwards selected namespaces. Exact module-code passthrough is NOT verified/supported. Core change belongs to Main.'};
await writeFile('.frameweave/pa3-glyph/strict-error-boundary.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.accepted)process.exitCode=1;
