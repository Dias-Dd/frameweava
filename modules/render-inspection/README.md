# Agent Render Inspection / ACL-3

Node service entry: `modules/render-inspection/index.ts`, also exported from `@frameweave/engine/node`. CLI adapter: `inspectionCLI` in this module. The only common CLI routing change is the `inspect` branch in `src/cli.ts`; direct TSX, frame, storyboard, render, preview, effects and packages retain their existing routes.

This service reuses `buildProject`, its TypeScript/TVG/resource/plugin gates, `installedPackages`, `Renderer`, existing preview policy, `Diagnostic`/`EngineError`, and the existing streaming file hash helper. It does not implement a compiler, animation evaluator, module registry, package installer or autonomous editor. Its image server serves only inspection image bytes, not project files.

## Public commands

From the workspace root, invoke `node --import tsx src/cli.ts` (or `npm run frameweave --`) followed by:

```text
inspect video.tsx --json
inspect video.tsx --frames 12,0,6,0 --storyboard --output artifacts/check-1 --json
inspect video.tsx --time 0.5 --stage visual --width 640 --mode preview --json
inspect compare --before artifacts/check-1 --after artifacts/check-2 --output artifacts/diff --json
inspect image artifacts/check-1 --id frame-000-12 --json
inspect serve artifacts/check-1
inspect iterate video.tsx --session artifacts/repair-session --max-iterations 3 --frames 0,6,12 --storyboard --json
```

All inspection adapter responses use JSON on stdout. Machine clients should invoke the Node CLI directly or use `npm run --silent frameweave -- …`, since npm itself may otherwise prepend a banner. Human progress does not enter the CLI JSON channel; evaluated project logs stay in the existing compiler subprocess. A failed check/comparison/request exits with code 1, successful checks with 0. An explicit visual difference also exits 1; it is a review candidate, not a claim of a programming bug. Serve prints one JSON message and remains alive until SIGINT/SIGTERM.

Frame selectors `--frame`, `--frames`, `--time`, `--times` are mutually exclusive. Seconds round to the nearest composition frame using the engine's existing convention. Order and duplicates are preserved; the request index is distinct from its frame number. `--storyboard` without a selector chooses 5 positions spanning the composition, and failed frames stay as failed records rather than fabricated screenshots.

Other render flags: `--height`, `--stage`, `--mode accurate|preview`, `--timeout` (per build/render operation, milliseconds), `--browser`, `--no-cache`, `--allow-wasm`. WASM stays denied by default. A declared resource or capability is reported as evidence, not treated as proof it has executed. Inspection never enables authorization on the caller's behalf.

## Shared TypeScript API

```ts
import {
  inspectProject, compareInspections, readInspectionImage, inspectIteration
} from '@frameweave/engine/node';

const report = await inspectProject({project:'video.tsx', frames:[12,0,6,0], storyboard:true});
const image = await readInspectionImage(report.reportFile.replace(/[\\/]inspection.json$/, ''), report.frames[0].image!.id);
// image.content is a real {type:'image', mimeType:'image/png', data:<base64>} block.
// A future MCP adapter can emit that block to a visual consumer instead of only returning a path.
```

`compareImageBuffers` provides independently testable decoding/metrics/PNG buffers. `compareImageFiles` accepts explicitly selected still files. `compareInspections` compares two inspection directories, pairs by frame + Stage + duplicate occurrence (independent of request ordering), and saves its own image allowlist. `serveInspectionImages` returns an ephemeral loopback URL per image and an explicit `close()` method. See [PROTOCOL.md](PROTOCOL.md) for result fields and comparison semantics.

## A bounded repair workflow

1. Inspect selected frames or call `inspectIteration` with a new session. Read actual diagnostics and open the delivered images.
2. The caller edits its own project using its normal authorized editing tool. No inspection function rewrites source, installs modules, changes locks, or retries edits automatically.
3. Call the same session again, supplying the affected frames explicitly. It rebuilds with the real compiler and renderer, records the next revision, and compares available previous frame pixels.
4. Review the diff/alpha previews and recovered/missing frame candidates. `iteration.ok` describes the new inspection; its comparison can legitimately be `different` after a desired repair. No baseline is accepted automatically.

Sessions default to 3 checks, allow at most 5, persist the consumed count, reject budget increases and concurrent ownership, and consume a turn even when compilation/rendering fails. A new deliberate session is required after exhaustion. An automatically inferred affected-frame dependency analysis is not implemented.

## Viewing images and local boundaries

An `ImageReference` is an available artifact, **not proof that a model saw it**. The Agent must invoke a visual tool with the bytes returned by `readInspectionImage` / `inspect image`, or open the token URL returned by the image server. The tests include an independent consumer that actually decodes the returned PNG.

Only `inspection.json` allowlisted image IDs may be read. Each delivery verifies the real path stays inside that inspection directory, PNG signature, byte length/SHA-256, dimensions and raw RGBA hash. Traversal, symbolic escapes, changed bytes, unknown IDs and unknown report versions fail. Serve binds only 127.0.0.1, requires a random per-session token, and has no arbitrary file, report, asset or source route. It adds no network access to Stage code and changes no existing CSP.

An output directory must be new/empty. Builds use separate worktree-local scratch directories. As with existing FrameWeave build/preview, project TSX is **trusted executable local code**; this is not a new sandbox for untrusted projects. The inspection implementation performs no source edits, but cannot promise that user-authored build-time code has no side effects. No full TVG, source corpus, binary Surface outputs or unbounded logs are returned.

## Render policies and limits

- `accurate`: existing export renderer, SwiftShader policy, PNG, normal visual diagnostics.
- `preview`: existing Renderer preview/GPU-auto policy and capture optimization, still requesting PNG for inspection rather than lossy display JPEG. Default width is capped at 640.
- Preview keeps the existing reduced diagnostic coverage (including omission of the export compositor's blank/black-frame heuristics). Use accurate mode when those technical warnings are needed.
- Reported policy is not a hardware probe. One-shot browser version is `not-exposed`; explicit render sessions record the actual browser version. Physical GPU remains `not-probed`; custom adapter availability is only proven by actual frame execution. A Stage's `backend` output is labeled as Stage-reported evidence.
- `cache.stageHits` counts reused Stage results. `finalImageReused` is false: final composition/capture still runs. Repeated-frame equality is checked via decoded pixels, independently of compressed PNG bytes.
- Limits: 50 frames/check, 16,777,216 pixels/image, 67,108,864 total requested pixels/check, 64 MiB/image input, 2 MiB/loaded report, 64 top-level diagnostics, 128 entries per summary category. Summaries record omitted counts. Timeouts follow the existing compiler/Web renderer; trusted custom adapters retain their existing contracts.

For multiple requests in one process, `modules/render-session/index.ts` provides an explicit, lazy project lifetime that injects build and Renderer ownership into this same inspection service. Each request still writes a separate ordinary inspection report and allowlist. One-shot CLI semantics remain unchanged; see [DX-1C](../../docs/DX_1C_RENDER_SESSIONS.md).

## ACL-1 / ACL-2 integration

No ACL-1/2-specific protocol was present in this synchronized baseline. The common envelope uses `schemaVersion`, namespaced `kind`, `ok`, existing diagnostic fields and `suggestedActions`. `InspectionDiagnostic` extends `Diagnostic` with `source`, optional `path` and known source `location`; the core Error ABI is unchanged. Package summaries reuse exact R1 references, content integrity and local-authority identities. Requirements distinguish declared evidence from possible use; no uninstalled capability is claimed available.

Other adapters should call this module's TypeScript functions, including the same image resolver, rather than shell out and parse CLI logs. A full MCP server is not implemented. The common integration points are the single CLI routing line and `src/node.ts` exports; future merges should compose these with the other ACL routes, then deliberately review SDK-only example locks against the combined SDK fingerprint.

## Verification

Run the independent suite before the real browser suite:

```powershell
node --import tsx --test tests/render-inspection.test.ts
node --import tsx --test tests/render-inspection-e2e.test.ts
```

Real repair fixtures are `examples/render-inspection/before.tsx` and `after.tsx`. The middle-frame error and clipped red marker are deliberate. Test evidence, actual inspection reports, PNGs, difference/alpha previews and a decoded fixed MP4 are saved under `artifacts/render-inspection/`; `latest-example.json` identifies the latest complete example. [REPORT.md](REPORT.md) records exact commands, outcomes, audited lock updates and unverified scope.
