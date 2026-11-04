# ACL-2 Analysis Tool Bridge v1

DX-1B extension: the shared service now provides `sampleBatch(id,{times,mode?,maxGapSeconds?},{signal?})`, a bounded parsed-Reader session, and default Node PNG overlays. See `DX1B_INTEGRATION.md` for the lean entry and Agent-1 wiring. The existing common CLI is not edited in DX-1B.

```powershell
node --import tsx src/analysis-tools/entry.ts sample-batch <artifactId> --times 0,0.125,4,4.0625,4 --project C:/project --json
node --import tsx src/analysis-tools/entry.ts preview <artifactId> --time 4 --output previews/node.png --project C:/project --json
node --import tsx src/analysis-tools/entry.ts preview <artifactId> --time 4 --backend renderer --output previews/renderer.png --project C:/project --json
```

Batch accepts 1..1024 times, retains order/duplicates, rejects an invalid request atomically, and caps serialized output at 2 MiB. Its Reader is the same Graphics Contracts Reader used by single queries. A batch authenticates the complete Artifact once. Separate calls still authenticate all files every time, using at most four parallel file readers. The session only memoizes decoded data/Reader after full C3 validation and an additional fresh Track JSON hash check. It never uses stat/mtime as permission to skip file hashes. Maximum four entries / 2 MiB of serialized Track JSON; this is not an exact JavaScript heap quota. `queryCacheStatus()` exposes those limits and counts; `clearQueryCache()` and `close()` release entries. Content-authentication failures clear the session. Cache hits do not imply current filesystem trust without reauthentication.

Node entry: `@frameweave/engine/node`. CLI wiring: `analysisCLI(args)` from `src/analysis-tools/index.ts`. CLI and future MCP adapters call **the same `AnalysisService`**. This module adds no scheduler, daemon, queue, ArtifactStore implementation, Track schema or time evaluator.

## Agent workflow

In this source distribution, invoke `node --import tsx src/cli.ts` from the engine directory. Its final stdout is one JSON document, without npm's console banner. `npm run frameweave -- analyze ...` also works interactively. `--project` is a directory or existing project entry; it selects the filesystem grant, not an arbitrary worker/module.

```powershell
node --import tsx src/cli.ts analyze list --project C:/project --json
node --import tsx src/cli.ts analyze run face-tracking --project C:/project --input assets/person.webm --events --json
# Substitute artifactId / jobId from the preceding actual response.
node --import tsx src/cli.ts analyze inspect <artifactId> --project C:/project --json
node --import tsx src/cli.ts analyze sample <artifactId> --time 4.0625 --project C:/project --json
node --import tsx src/cli.ts analyze sample <artifactId> --from 0 --to 8 --limit 64 --project C:/project --json
node --import tsx src/cli.ts analyze preview <artifactId> --time 4 --output previews/face-4.png --project C:/project --json
node --import tsx src/cli.ts analyze status <jobId> --project C:/project --json
node --import tsx src/cli.ts analyze cancel <jobId> --project C:/project --json
```

`run` waits for C3 execution, executor cleanup, atomic publication, terminal receipt, and verified result summary. Optional `--events` emits JSONL progress **only to stderr**; a failed invocation's final error is also one JSONL record in this mode. No streaming plaintext or whole TrackData appears in stdout. SIGINT requests C3 cancellation and waits for owned resources. Failed commands exit 1 and use the existing CLI error shape on stderr: `{ "ok": false, "diagnostics": [{"code": "...", "severity": "error", "message": "...", "details": ...}] }`. Without `--events`, the error is one pretty-printed JSON document. Error handling continues to use `EngineError`/`diagnostic`; CLI adapters must not treat any stderr text as a successful response.

There is **no background task host**. A service owns its live C3 handles in memory. Another CLI process can read only terminal receipts; it cannot subscribe to or cancel a still-running foreign process. Unknown UUIDs return `E_ANALYSIS_NOT_LIVE`. A completed receipt reports `scope: "terminal-receipt", controllable: false`; `cancel` returns `accepted: false`. No persisted `running` status can be mistaken for a controllable job. Interactive cancellation uses the foreground invocation; persistent tools such as a future MCP host can retain one service instance. Hard process termination is not recovery and does not fabricate a receipt.

## Available adapters and provisioning

`list` reports exact registered IDs, aliases, adapter version, algorithm ID, entry hash, parameter constraints/defaults, output type, operations, limitations, readiness diagnostics, and tool schemas.

| Capability | Aliases | Parameters | Operations |
|---|---|---|---|
| `frameweave.analysis.face-tracking` | `face-tracking` | `startSeconds=0`, `endSeconds=8`, `sampleRate=8`, `analysisWidth=640`; the three existing detection/presence/tracking confidence thresholds default .5 | inspect, sample, sampleBatch, preview |
| `frameweave.analysis.image-brightness` | `image-brightness`, `brightness` | `batchRows=16` | inspect |

CLI shortcuts: `--start`, `--end`, `--fps`, `--width`, `--batch-rows`. All remaining parameters use `--parameters '{"minTrackingConfidence":0.6}'`. Unknown keys, nulls, duplicate shortcuts, NaN, out-of-range parameters, arbitrary worker/export/cache flags are rejected. The descriptor's version is the bridge adapter version; Artifact identity carries the **actual algorithm/model/runtime versions**.

Face tracking reuses the existing C3 MediaPipe module unchanged. Requires its separately provisioned `prototypes/analysis-job-mvp/node_modules/@mediapipe/tasks-vision` 1.2.0, existing FFmpeg, a local Chromium, and the existing `assets/face_landmarker.task` (SHA256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`). No automatic installation or model download. `availability.ready` checks local files, model hash, SDK version, and browser existence; actual browser launch/model compatibility is checked during C3 execution and can still fail. Queries do not require model readiness.

Optionally supply a preprovisioned **project-local** model using data-only `frameweave.analysis.json`:

```json
{
  "schemaVersion": 1,
  "faceModel": {
    "path": "assets/face_landmarker.task",
    "version": "float16/1",
    "sha256": "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"
  }
}
```

This config cannot register code. Missing or hash-mismatched models are unavailable, not silently replaced. Face input is a local `.webm`, `.mp4`, `.mov` or `.mkv` up to 1 GiB; an even analysis width 128..1280 and range <=20 seconds / 600 samples retain the producer's limits. Brightness reuses the C3 P6 RGB module, up to 32 MiB, without header comments. It has no time or preview adapter and does not advertise those operations.

## Shared service and tool schemas

```typescript
import {createAnalysisService, executeAnalysisTool,
  analysisToolDefinitions, diagnostic} from '@frameweave/engine/node';

const service = await createAnalysisService({projectRoot: 'C:/project'});
const controller = new AbortController();
try {
  const result = await executeAnalysisTool(service, 'run', {
    capabilityId: 'face-tracking', input: 'assets/person.webm'
  }, {signal: controller.signal, onProgress: event => console.error(JSON.stringify(event))});
  const point = await executeAnalysisTool(service, 'sample', {
    artifactId: result.artifact.artifactId, time: 4.0625, mode: 'linear'
  });
  console.log(JSON.stringify(point));
} catch (error) {
  console.error(JSON.stringify({ok: false, diagnostics: [diagnostic(error)]}));
} finally { await service.close(); }
```

Direct methods: `list()`, `start(request)`, `subscribe(jobId, listener)`, `status(jobId)`, `cancel(jobId)`, `wait(jobId)`, `run(request, {signal,onProgress})`, `inspect(artifactId,{from?,to?})`, `sample(artifactId,query)`, `preview(artifactId,time,output,{mode?,maxGapSeconds?})`, `close()`. `start` performs preflight and starts C3 immediately; it returns the live job view. `wait` includes cleanup and receipt persistence. Subscriptions cover subsequent events and are removed by the caller's returned function. `run` handles subscription lifetime. `close` cancels and waits for **all owned** jobs; use one service for the desired ownership interval. C3 commit arbitration remains unchanged: late cancellation can be rejected once atomic publication starts. Inspect `accepted`, state, and cleanup fields rather than inferring success from an abort request.

`analysisToolDefinitions` exposes closed JSON input schemas for `frameweave.analysis.{list,run,status,cancel,inspect,sample,sampleBatch,preview}`. They map to `executeAnalysisTool` and contain no Worker path. Success envelopes use `{ok:true,schemaVersion:1,operation:"analysis.<operation>",diagnostics:[],...}`. Failure uses existing diagnostics, without a second error class. Resource outputs follow Graphics Contracts `ResourceReference`: resourceId, kind, SHA256, bytes; the bridge also returns an explicit local path and file URI. Schemas are adapter metadata, not an install/execution registry or a running MCP server.

## Artifact and query semantics

The ID is the existing C3 cache key (64 lowercase SHA256 hex). Each operation calls `AnalysisArtifactStore.read`, verifying Manifest, completion hash, identity-derived key, declared paths, byte lengths and **every output file**. Track JSON additionally goes through Graphics Contracts `readJsonResource` and `validateTrackData`; identities and all frame references must agree with the Artifact. The service never runs inference to satisfy inspect/sample/preview. It does not load the full TrackData into its default tool response.

Inspect returns input/algorithm/model/runtime identity, version, time/coordinate contract, deterministic sample/valid/missing/segment statistics, supported operations and verified references. A segment ID is **not a person identity**. Confidence remains null when unavailable. Brightness summarizes verified statistics without the 256-bin histogram. Unregistered artifact formats offer generic metadata only, limited to eight file references and no professional query claims.

Sample delegates exclusively to the formal `createTrackReader`, in **source-media seconds rounded to integer microseconds**. Result `timestampUs` is the requested time, not an invented observation timestamp. Range pages query actual observed timestamps in `[from,to)`, default limit16, maximum128, offset0..600. Exact, linear and nearest results, default maximum gap, loss boundaries, segment changes, missing detection, not-bracketed and outside-range reasons are unchanged. `observation` is `observed`, `interpolated`, or `missing`; query errors are diagnostics, not manufactured coordinates. `nearest` may return a neighboring observation under the original Reader rule; it is explicitly distinct from linear interpolation.

Preview uses the verified captured source PNG at or before the query, plus the exact Reader result. It reports **both** `timestampUs` and `backgroundTimestampUs`, and `backgroundPolicy: "hold-previous-analysis-frame"`. Default `backend: 'node'` uses the existing sharp dependency for one fixed circle/line/text overlay; it launches no Renderer/browser and supports up to 4,194,304 pixels. `backend: 'renderer'` retains the existing `videoFramesStage`/`labelStage` path through `buildProject`/`Renderer`, without a new Stage time contract. Output includes actual backend, dimensions, SHA/bytes and diagnostics. Pixel equality is only promised for the same backend/environment; the requested Arial fallback is not a locked cross-platform font identity. A missing track draws no marker. It is a sampled-frame inspection preview, not a claim that a new exact-time source decode happened. Output is a fresh project PNG, verified with a ResourceReference. It cannot overwrite files or write into `.frameweave`. Temporary renderer projects and browser resources are removed in `finally`.

## Storage, security, and cleanup responsibility

All access is under the explicitly selected real project root; descendant symlinks/junctions and traversal are rejected. The sole additional provisioned source is the fixed trusted engine adapter/model installation. Output IDs cannot select arbitrary cache paths. The bridge is a trusted local Node tool, **not an OS security sandbox against concurrent malicious filesystem mutation**; the project's owner must control its directory during execution.

Default namespace: `.frameweave/analysis-tools/artifacts` uses the **existing C3 store** and atomic publication logic. No StageCache is used as persistent storage. The existing identity includes content, algorithm, models, parameter hash, runtime/environment; package-lock identities can be supplied by future approved adapters. Cross-process reuse, corruption errors, concurrent same-key publication, cancellation cleanup, and failure non-publication all remain C3 responsibilities.

`.frameweave/analysis-tools/jobs/<uuid>.json` is a bounded-size **terminal audit receipt**, not a queue or result cache. It contains state, cleanup, diagnostic and Artifact ID. A successful receipt is revalidated against its Artifact when read from a different instance. A receipt write error is reported even if C3 has already published an Artifact; it does not retract a committed result. There is no crash recovery, job enumeration, TTL or automatic disk eviction. Owners remove old terminal receipts and unneeded C3 artifacts only when no task/query uses them. Frames can dominate disk use (up to 600 PNGs per face result); the existing C3 per-artifact default is 256 MiB / 1000 declared files. Neither limit is a total store quota. Temporary previews are scoped, owned and automatically removed; explicitly requested PNGs remain.

## ACL-1 / ACL-3 and P4-R1 integration

ACL-1 can present the canonical capability IDs, descriptor schemas, verified entry identity, operations and readiness returned by `list`; install/lock remains P4-R1's responsibility. `installedPackages` supplies exact trusted source/content/module hashes and rejects invalid locks. R1 v1's manifest currently denies Node process/filesystem permissions and has no Analysis entry contract. Consequently installed package descriptions **do not authorize importing or executing an analysis worker**. The catalog labels them `not-authorized-by-R1-v1-manifest`; only the two statically compiled first-party adapters run. Advertising a face capability on a machine missing its dependencies returns unavailable. No P4 ABI or manifest is extended here.

Future minimal cross-workspace request: an explicitly approved analysis entry declaration with input/parameter/result-reader identity and Node execution authorization, resolved by R1's verified lock. It must not grant execution based only on a natural-language capability description. Until then, another trusted engine analysis adapter is a code-reviewed extension to `capabilities.ts` plus a registered result adapter, not a model-supplied module path.

ACL-3 may retain `AnalysisService` for live status/cancel and expose `analysisToolDefinitions` through its own transport. It should reuse `executeAnalysisTool`, map thrown `EngineError` through `diagnostic`, and pass the project's explicit authorization/root. Tool preview resources can then be consumed by TSX/Resource and normal frame/preview/render commands. This change does not provide a full MCP server, continuous host, ASR, segmentation or a new data schema.

## Validation

Specialized: `node --import tsx --test tests/analysis-tools.test.ts`. Real acceptance (requires preprovisioned MVP assets): `node --import tsx scripts/verify-analysis-tools.ts`. The latter creates a unique project and retains command JSON, stdout, stderr JSONL, actual artifacts, PNGs and acceptance metrics under `outputs/acl2/e2e/run-*`. It does not modify frozen MVP/C3 evidence. See `ACL2_REPORT.md` for this branch's measured results and exact unverified scope.
