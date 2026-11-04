# C3 AnalysisTask / AnalysisArtifact v1

This is a Node-side helper for one explicitly started analysis request. It adds no scheduler, durable queue, daemon, package resolver or TVG node. Existing projects that do not call it keep their Stage/DAG/time/keyframe contracts. Public exports live in `@frameweave/engine/node`; browser Stages consume completed files and JSON, never this Node API.

## Creating and consuming a task

```ts
import {
  createAnalysisTask, createNodeAnalysisExecutor,
  type AnalysisDefinition
} from '@frameweave/engine/node';
import type {BrightnessInput, BrightnessOutput} from './brightness-task.ts';

const job = createAnalysisTask({
  input: {imagePath: '/explicit/project/image.ppm', batchRows: 16},
  executor: createNodeAnalysisExecutor<BrightnessInput, BrightnessOutput>({
    module: '/explicit/project/brightness-task.ts',
    exportName: 'brightnessTask',
    cacheRoot: '/explicit/project/.frameweave/analysis'
  })
});
const unsubscribe = job.subscribe(status => console.log(status));
job.start();
try {
  const result = await job.wait();
  // result.artifact.directory + manifest.files[n].path are ordinary files.
  console.log(result.output, result.cacheHit, result.cleanup);
} finally { unsubscribe(); }
// job.status() returns a deep copy; job.cancel() requests cancellation.
```

`createAnalysisTask<Input,Output>` accepts a typed executor and snapshots finite JSON input at creation. Input/output must be transportable JSON: no functions, undefined fields, NaN, live handles or binary buffers. Refer to large assets by explicitly resolved local paths or caller-managed resource identities. The loaded module must expose the three methods of `AnalysisDefinition<Input,Output>`; `validateOutput` is required on cold execution and cache reads. A generic type parameter does not validate a dynamically imported module by itself.

```ts
interface AnalysisContext {
  signal: AbortSignal;
  reportProgress(p: {phase: string; completed: number; total?: number}): void;
  deferCleanup(name: string, release: () => void | Promise<void>): void;
}
interface AnalysisDefinition<Input, Output> {
  describe(input: Input, context: AnalysisContext): Promise<AnalysisIdentity>;
  execute(input: Input, context: AnalysisExecutionContext): Promise<{
    output: Output;
    files: {path: string; format: string}[];
  }>;
  validateOutput(value: unknown): void; // throws on invalid output
}
```

`describe` hashes/identifies input, algorithm dependencies, optional models, normalized parameters and runtime environment. It must be deterministic, must not start inference, and must not download assets. It runs before cache lookup and again after cold computation to detect dependencies edited in place. `execute` receives `directory`, `cacheKey`, `identity` and the context above. Write all result files inside `directory` and declare all of them. Register owned resources immediately and use unique cleanup names; callbacks run in reverse acquisition order on success, error and cooperative cancellation. Domain modules retain decoding, inference, coordinates, time indices, interpolation and their own data validators.

## State, cancellation and completion

States are `created → running → succeeded|failed`, or `created → cancelled`, or `running → cancelling → cancelled`. `start()` is allowed once. `subscribe()` returns an unsubscribe function; observers receive independent snapshots and cannot abort task ownership by throwing. `completed/total` describe the current phase, not estimated whole-job elapsed time; total and progress can be unknown.

`executionFinished` means computation has returned (or stopped). It is observable while cleanup is still pending. `cleanupFinished` means the executor's cleanup attempt has settled. `cleanup.complete`, `resources`, `errors`, `stagingRemoved`, `processExited` and `forced` say whether cleanup actually succeeded. A failed cleanup is never converted to a successful result.

`wait()` settles only after the owned child has closed and the host has validated/published results or removed its own staging directory. Successful resolution requires verified cleanup. The returned result is separate from the state snapshot. Errors use the existing `EngineError` and `Diagnostic` conventions; failed/cancelled waits reject and remain observable in `status()`.

Cancellation is accepted before the host's synchronous `beginCommit` gate. The accepted abort wins over a result whose computation just finished: no new completed artifact is published. Once state is `running/committing`, `cancel()` returns false and atomic publication/cache return may finish. The commit gate is chosen after child close and successful cleanup, not when a worker merely says inference is done. Terminal cancellation also returns false. These ordering rules are tested, including cancellation from the initial status callback.

The Node adapter passes cancellation to the child's AbortController. If cooperation fails, after `cancelGraceMs` (default 10 s) it kills only its owned process tree. An otherwise finished child that fails to exit within `exitGraceMs` (default 2 s) is also terminated. Forced termination reports `E_ANALYSIS_TERMINATED`, `forced:true`, `complete:false`; cleanup failures retain `E_ANALYSIS_CLEANUP`. Abnormal process exits report `E_ANALYSIS_PROCESS` and unknown/incomplete resource cleanup. `wait()` never pretends those paths were normal success. No automatic retry occurs; construct a new handle for an explicit re-execution.

The process adapter is for trusted local code, not an OS security sandbox. On abrupt process/host crashes there is no durable task recovery or guarantee that an arbitrary native resource has released itself. Normal/active cancellation and forced cancellation with an owned descendant are tested on Windows; non-Windows process-group termination is implemented but not exercised here.

## AnalysisArtifact v1

The independent file schema is `{schemaVersion:1, kind:'frameweave.analysis-artifact'}`. This is not a TVG version change. Its TypeScript contract is in `src/analysis/types.ts`; the strict file/boundary/integrity reader is `AnalysisArtifactStore`.

```ts
interface AnalysisArtifact<Output> {
  schemaVersion: 1;
  kind: 'frameweave.analysis-artifact';
  cacheKey: string; // 64 lowercase hexadecimal SHA256
  identity: {
    inputs: {id: string; sha256: string; bytes: number; resource?: string}[];
    algorithm: {id: string; version: string; integrity: string};
    models: {id: string; version: string; integrity: string}[];
    parametersHash: string;
    runtime: {
      id: string; version: string; integrity: string; environment: Json;
      executor?: {id: string; version: string; environment: Json};
    };
    time?: Json;
  };
  createdAt: string;
  output: Output;
  files: {path: string; format: string; bytes: number; sha256: string}[];
}
```

Input paths are not implicitly cache identities. Modules provide actual content hashes, algorithm code/dependency integrity, model versions/content hashes and all result-affecting parameters. `resource` is an optional caller resource id, not a resolver or a network URL to fetch. `time` carries the module's explicit units/origin/range. For face tracking it is source-media microseconds and a half-open interval; the reader remains the existing TrackData query module.

The Node adapter automatically stamps `runtime.executor` with protocol `node-child-process/1` and actual Node version, platform and architecture. The module declares its algorithm backend, precision and further environment dependencies. The face module fingerprints SDK/WASM/JS files, FFmpeg and the browser executable; it does not claim that a browser executable hash identifies every loaded OS/browser DLL. No cross-browser/GPU numerical determinism is promised.

## Persistent identity and publication

`analysisHash` canonicalizes finite JSON object keys and delegates SHA256 hashing to the existing `hashValue`. Arrays retain declared order. Keys are:

```text
parametersHash = SHA256(canonical(normalized parameters))
cacheKey = SHA256(canonical({schemaVersion:1, identity: identity-with-parametersHash}))
```

Changing input bytes, parameters, algorithm id/version/integrity, model identity, declared environment or executor provenance changes the key. A producer cannot get correct invalidation by naming a version and ignoring changed file bytes; both concrete modules hash their actual resources. Models are optional (`[]` for brightness).

Each request gets a random `.tmp-UUID` child directory under the explicit cache root. The child writes files there, validates module output, rechecks input identity, runs cleanup, hashes/validates every file, and writes `manifest.json` plus `complete.json` containing the manifest SHA256. The host waits for process close, validates the prepared directory again, then atomically renames it to `<cacheRoot>/<cacheKey>`. Failure and accepted cancellation remove only that request's staging directory. They do not publish incomplete keys.

Cache reads verify sidecar version/hash, manifest version/key/identity, every result's ordinary-file status, path scope, byte count, SHA256 and the complete declared file list. Corruption fails with `E_ANALYSIS_CACHE`; it is not silently re-downloaded, overwritten or relocked. SHA256 is an integrity check within a trusted working directory, not an authenticity signature against an adversary who can rewrite both files and hashes.

Concurrent same-key jobs may both compute; this version deliberately adds no lock queue or deduplication scheduler. The first complete rename wins. A loser validates the existing winner and returns its complete artifact with `publication:'concurrent-winner'`; it never overwrites it. Ordinary hits use `cacheHit:true/publication:'cache'`. A concurrent loser uses `cacheHit:false` because it did compute. This race is tested with two workers blocked at a common barrier before publication.

## Paths, budgets and cleanup ownership

The configured root is an explicit caller-owned local directory; keep it worktree-local in tests. Ordinary result paths are relative, use `/`, and cannot traverse, alias control manifests, use links, special files, backslashes, drive paths, trailing dots/spaces or duplicate case-insensitive names. The store checks real paths and refuses to discard a published key. It is not a sandbox for deliberately malicious module code with arbitrary Node filesystem access.

Default limits are 256 MiB of declared result bytes, 1,000 files and 4 MiB per metadata file. Configure smaller per-artifact limits with `NodeAnalysisOptions.store`. There is no total-cache quota, automatic eviction, stale-staging scan, fsync durability guarantee after power loss, persistent history, restart/resume or background GC. The owner of the configured directory must explicitly remove unneeded completed keys or crash leftovers while tasks are stopped. A `.tmp-*` directory is never a successful cache entry. Do not use StageCache's 128 MiB in-memory frame LRU as this result store.

## Alternative executors and P4-R1

`AnalysisExecutor<Input,Output>.execute(input, context)` is replaceable and browser-independent. Its context contains `signal`, progress, `executionFinished()` and the `beginCommit()` gate. A future Worker/WASM/native adapter must use the same abort/commit ordering, verify cleanup before resolving, publish only complete artifacts, and return `AnalysisResult`. No alternative backend is claimed implemented in v1.

P4-R1 can later supply algorithm/module/model `id`, exact version, package/module integrity and explicit resource locations from already installed locks. No package manager, manifest registry, model downloader or privilege escalation is added here. R1 permissions/platform/module ABI must be reviewed before permitting a package to execute as a trusted Node analysis module; a visual plugin does not acquire filesystem/process access by calling this API. No R1, C1 or C2 manifest/schema contract was changed.

## Reproduction

From this worktree:

```powershell
$env:FRAMEWEAVE_HOME = Join-Path (Get-Location) '.frameweave/user-home'
node --import tsx --test tests/analysis.test.ts prototypes/analysis-job-mvp/tests/*.test.ts
node --import tsx examples/analysis/verify.ts outputs/analysis-c3/brightness-NEW
$env:FRAMEWEAVE_C3_OUTPUT = Join-Path (Get-Location) 'outputs/analysis-c3/video-NEW'
node --import tsx prototypes/analysis-job-mvp/verify.ts
node --import tsx prototypes/analysis-job-mvp/demo.ts
node --import tsx prototypes/analysis-job-mvp/verify-export.ts
```

The face module requires the previously installed prototype SDK and already present pinned model/video. This C3 verification does not download them. Use a new evidence directory for a new run. Original MVP `validation/`, `evidence/`, `generated/project.tsx` and its caches remain historical evidence; migrated runs use the distinct `.frameweave/analysis-c3` and `generated/c3` paths.
