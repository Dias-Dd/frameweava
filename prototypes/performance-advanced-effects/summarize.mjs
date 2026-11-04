import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const directory=resolve('artifacts/performance-advanced-effects/v1');
const raw=JSON.parse(readFileSync(join(directory,'report.json'),'utf8'));
const supervisor=JSON.parse(readFileSync(join(directory,'supervisor.json'),'utf8').replace(/^\uFEFF/,''));
const dist=values=>{
 const a=values.toSorted((a,b)=>a-b),n=a.length;
 return {n,medianMs:n%2?a[n>>1]:(a[n/2-1]+a[n/2])/2,p95Ms:a[Math.ceil(n*.95)-1],smallTailSample:n<20};
};
const rows=raw.cases.filter(c=>c.id!=='reference').map(c=>{
 const phases={};
 for(const row of c.web.slice(1))for(const span of row.phases)(phases[span.phase]??=[]).push(span.durationMs);
 return {id:c.id,width:c.width,height:c.height,webFinalPng:c.webWarmPng,
  webHostSpans:Object.fromEntries(Object.entries(phases).map(([name,v])=>[name,dist(v)])),
  webStageInnerTimers:null,webColdMs:c.web[0].wallMs,webInitMs:c.webInitMs,
  native:c.native.map(m=>({mode:m.mode,gpuComplete:m.warmComplete,allFrameThroughputFps:m.allFramesPerSecond,
   elapsedMs:m.elapsedMs,frames:m.rows.length,firstFrameMs:m.rows[0].completeMs})),
  nativeInitMs:c.nativeInitMs??null,nativeIneligible:c.nativeIneligible??null,
  nativeLogicalImageBytes:c.nativePlannedImageBytes??null,webPeakOwnedBufferBytes:c.web.at(-1).metrics.scope.peakOwnedBytes,
  nativeStats:c.nativeStats??null};
});
const reference=raw.cases.find(c=>c.id==='reference');
const summary={version:1,status:'completed-with-measurement-limitations',sourceCommit:raw.sourceCommit,preparedSha256:raw.preparedSha256,
 window:raw.gpuWindow,isolation:{userConfirmedOnlyThisAgentRunning:true,peerQuietPreHandshake:false,hardwareGpuOccupancyTrace:false,knownConflict:false},
 environment:raw.environment,supervisor,wallMs:raw.wallMs,sourceUnchanged:raw.sourceUnchanged,
 correctness:{smallImage:reference.comparison,scope:'64x36 last frame cross-backend float comparison; not full-size numerical verification',
  diagnosticInspectCalls:1,expectedF32ReadbackBytes:reference.comparison.components*4,postInspectStatsNotCollected:true,
  pngsDecoded:['mix-540p','mix-1080p','mix-4k','field-540p','field-1080p']},
 diagnostics:[{code:'E_BENCH_CLOCK_FROZEN',severity:'warning',
  message:'Prototype Stage performance.now follows deterministic frame time (src/web/clock.ts:11). Its record/compute/readback timers are invalid zeros and are excluded. Raw data preserved. Node and engine wallNow profile spans remain valid.',
  excluded:['metrics.recordMs','metrics.computeAndValidationMs','metrics.finalReadbackMs','webWarmComputeAndValidation']}],
 timing:{webEndpoint:'real TSX/Renderer final SDR PNG',nativeEndpoint:'real Rust GPU-complete including Node recipe/IPC, no Renderer/UI/encoding',
  ratioBetweenEndpointsAllowed:false,hostSpansOverlap:true,fullPipeline120fpsVerified:false,gpuQueries:false,
  ocioUsedInPerformanceWorkload:false,legacyPhaseLabels:['media.preview-ocio-and-png includes no OCIO here','media.float32-pack-and-base64 uses buffer-v1/deferred Base64 here']},
 rows,nextBottlenecks:[
  {priority:1,work:'Connect the actual effect recipe to native GPU display/Renderer; current browser preview color conversion+PNG dominates. Keep CPU only as reference/fallback.'},
  {priority:2,work:'Native resource lifetime reuse; 4K two-slot tape retains 3.185GB of logical images before physical GPU overhead.'},
  {priority:3,work:'Typed compute/data native adapter is absent; the real 3D field workload is explicitly Web-only.'}],
 unverified:['full native visible preview','sustained long duration 120Hz','native ABI2','physics/Puppet/cloth cases','video decode/audio/MP4 encoding','full-size native numerical comparison','physical VRAM peak']};
if(!raw.ok||!raw.sourceUnchanged||supervisor.result.exitCode!==0||supervisor.result.activeAfterCleanup!==0)throw Error('Failed/incomplete supervised run');
writeFileSync(join(directory,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({sourceCommit:summary.sourceCommit,supervisedMs:supervisor.result.wallMs,rows:rows.map(r=>({id:r.id,web:r.webFinalPng.medianMs,native:r.native.map(n=>({mode:n.mode,median:n.gpuComplete.medianMs,p95:n.gpuComplete.p95Ms,fps:n.allFrameThroughputFps}))})),diagnostics:summary.diagnostics}));
