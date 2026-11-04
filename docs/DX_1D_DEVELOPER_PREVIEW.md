# Frameweave developer preview: actual baseline and onboarding

This guide targets the ACL-1/2/3-integrated baseline at `33b7b95959d8b6ef8cd84f2d6c72ca9792278373`. DX-1 packaging, Analysis performance and Renderer lifecycle changes owned by Agents 1/2/3 are not assumed integrated. Use the accompanying DX-1D acceptance report for what was actually run.

## Installation status

**There is not yet a verified standalone developer-preview CLI package on this baseline.** Its package is `@frameweave/engine@0.1.0`, `private:true`, with no `bin`. We successfully packed and independently installed it, but did not bypass the missing public entry by executing installed private `src/cli.ts`. `frameweave` with no arguments does not yet select this REPL. Agent-1 must provide the public entry, distribution files, runtime dependencies and installed-package acceptance before claiming npm onboarding works.

Current tested source-checkout prerequisites: Node 22.19.0 (package declares >=22), npm, an independently installed root dependency tree, Chromium/Chrome/Edge, and the existing FFmpeg binary. For a fresh assigned checkout:

```powershell
npm ci --prefer-offline --no-audit --no-fund
node --version
npm run typecheck
```

This repository uses standard TS/TSX with a custom Frameweave JSX runtime for scenes. Native React Stages retain React's own pragma/runtime. Node executes project build code: use only reviewed local projects and dependencies. This is not a security sandbox.

## First editable scene and outputs

Save the following as `hello.tsx` in your own directory. It needs no plugin install, model, network access or WASM:

```tsx
import {Composition, Stage, Rect, keyframes} from '@frameweave/engine';
export default <Composition width={320} height={180} fps={12}
  durationInFrames={13} background="#102035">
  <Stage id="hello">
    <Rect x={keyframes([{frame:0,value:12},{frame:12,value:244}])}
      y={60} width={48} height={48} fill="#62efca"/>
  </Stage>
</Composition>;
```

The checked-in equivalent is `examples/developer-preview/hello.tsx`. Current public source-checkout commands (run at repository root; use absolute project/output paths from another directory):

```powershell
npm run --silent frameweave -- frame examples/developer-preview/hello.tsx --frame 6 --output artifacts/dx-1d/hello.png --json
npm run --silent frameweave -- storyboard examples/developer-preview/hello.tsx --frames 0,6,12 --output artifacts/dx-1d/hello-board.png --json
npm run --silent frameweave -- render examples/developer-preview/hello.tsx --no-cache --output artifacts/dx-1d/hello.mp4 --json
npm run --silent frameweave -- probe artifacts/dx-1d/hello.mp4
```

`probe` fully decodes the video; a successful build is not image/video validation. H.264/yuv420p is lossy and does not preserve transparency. Source PNG comparisons must be separated from codec error. Keep logical frame/time deterministic; do not animate with wall clocks or independent timers inside `renderAt`.

## Interactive preview and local REPL

Direct TSX invocation is the existing interactive preview entry. `--no-open` avoids launching a visible browser window, but the explicitly requested render preview still uses Chromium. No daemon is started on ordinary CLI/module import.

```powershell
npm run --silent frameweave -- examples/developer-preview/hello.tsx --no-open --accurate --width 320
```

The public response announces a tokenized local preview URL. Use its `/state`, `/frame?...&frame=6&format=png` and POST `/close` routes as demonstrated by the black-box consumer; preserve the token. `preview <project> --output clip.mp4` is the older video-preview command, not this interactive entry. Accurate mode uses the default software/capture policy; the normal interactive policy can select hardware and is not a promise of identical pixels across backends.

DX-1D component launch:

```powershell
node --import tsx scripts/frameweave-repl.ts
```

See `modules/repl/README.md` for real syntax, safety boundaries and Agent-1 wiring. It supports basic single-line TS expressions/variables and explicit dot commands. `.open --trusted-local-code` builds a reviewed local project; `.params 6` reads the last build snapshot; `.frame 6` explicitly invokes Inspection and closes its Renderer. It does not automatically start Chromium, authorize Stage WASM, load a project, install modules or create a second runtime. Top-level await, JSX expressions, semantic type checking, multi-line TS editing and universal async cancellation are not supported by this minimal optional REPL.

## Discover, inspect and use modules

```powershell
npm run --silent frameweave -- capabilities search "glow" --mode keyword --project hello.tsx --json
npm run --silent frameweave -- capabilities inspect fw.glow@1.0.0 --project hello.tsx --json
npm run --silent frameweave -- capabilities examples fw.glow@1.0.0 --project hello.tsx --json
```

On this baseline the last command correctly fails with `E_CAPABILITY_EXAMPLES_MISSING`: there is no authored version-matched Glow example. Do not use synthesized examples as evidence. An actual local R1 Kit with authored examples can be queried with explicit `--catalog <directory>`. The independent acceptance fixture uses the checked-in `examples/rust-bindgen/lyon` catalog after **explicitly approving** only `local:frameweave.examples`.

Capability search/inspect is read-only. `availability.installed` is not trust, `eligible` is static eligibility, and `runtimeVerified:false` remains false after a query. Record actual render evidence separately. Keep exact references and returned integrity; do not infer current GPU/Worker availability from capability text. Semantic/hybrid search needs the preprovisioned pinned model; keyword is an explicit alternative, not a semantic fallback.

For a reviewed module, use the existing returned `commands.install` argv only after reviewing its source authority, exact identity and dependencies. The existing operations are:

```text
packages install <reviewed-local-package> --project <entry> --trust local:<approved-authority>
effects lock --project <entry>
packages verify --project <entry>
```

These are existing CLI argument forms, not automatic approval instructions. New-project lock creation is explicit. Never silently refresh old SDK locks, immutable module versions or resources to hide a mismatch. For built-ins, compose `PluginStage`/`plugin` with valid explicit image inputs (e.g. particles → glow) and lock that new project deliberately.

## AnalysisTask and real TrackData

```powershell
npm run --silent frameweave -- analyze list --project <project-directory> --json
npm run --silent frameweave -- analyze run image-brightness --input <project-directory>/pixels.ppm --project <project-directory> --json
```

Image brightness takes a real P6 RGB `.ppm` and requires no model/browser. It is a C3 AnalysisTask with a persistent verified Artifact, **not TrackData**. `analyze inspect <artifactId> --project <directory>` reads its actual result. Artifact IDs are content keys from the returned data, not file paths.

Real face TrackData currently requires the registered first-party MediaPipe adapter, preprovisioned fixed model and video. Fresh checkouts/packages do not automatically contain them. The source-checkout preparation used for this acceptance was:

```powershell
# Explicit setup of an already reviewed first-party adapter; not automatic REPL behavior.
Push-Location prototypes/analysis-job-mvp
npm ci --ignore-scripts --no-audit --no-fund
node prepare-assets.mjs
Pop-Location
```

The existing preparation tool downloads the pinned official face model (SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`) and pinned OpenCV David validation video (`4bbe69b7d097379af4d7ad128f02692820dc57a6d8275ea2b9e7eef4399a3e61`), with provenance. The footage is an internal validation fixture, not a stock-media license grant. Models and adapter dependencies are not ordinary R1 execution permissions and are not promised in the initial installed package.

Copy reviewed input video into the chosen project, then use:

```text
analyze run face-tracking --input <project>/face.webm --start 0 --end 2 --fps 4 --width 320 --project <project> --events --json
analyze inspect <returned-artifactId> --project <project> --json
analyze sample <returned-artifactId> --from 0 --to 2 --limit 8 --project <project> --json
analyze preview <returned-artifactId> --time 1 --output track-preview.png --project <project> --json
```

These were exercised with real inference. Inspect the returned sample `result.valid`, observation, microsecond/source-media time and coordinate metadata. Missing observations are real missing data, not zeros or invented interpolation. Track IDs are visible segments, not person identity; confidence can be null. Progress is stderr JSONL for `--events`; stdout holds the terminal result. Foreground run owns cancellation; cross-process status is a terminal receipt, not a daemon or live-control guarantee.

## Inspection, diagnosis and repair

```text
inspect <project.tsx> --json
inspect <project.tsx> --frames 0,6,12 --storyboard --output <new-directory> --json
inspect image <inspection-directory> --id <returned-image-id> --json
inspect compare --before <png-or-inspection-directory> --after <same-kind> --json
```

No selected frames means build/structure inspection without Chromium. Selected frames invoke real rendering. Image `file` fields can be relative to the inspection directory; use the public `inspect image` entry and its actual PNG content instead of guessing paths. Diagnostics preserve Stage/frame and source locations when available. Services do not edit project source; the caller fixes it and inspects again. A deterministic failing frame is not a syntax-error simulation.

Common failures:

| Code / symptom | Action |
| --- | --- |
| `E_TYPECHECK` | Fix real TS diagnostics at reported file/line/column. |
| `E_RESOURCE_MISSING` | Supply a declared resource inside the allowed project scope. |
| `E_PLUGIN_LOCK` | Review code/version/resource/runtime identity; never silently rewrite. |
| `E_CAPABILITY_EXAMPLES_MISSING` | No authored example exists; use an explicit reviewed example or write project code. |
| `E_SEARCH_MODEL` | Prepare the pinned semantic model explicitly or choose keyword mode honestly; Windows native loaders may require an extended/short path in this same worktree. |
| `E_INSPECTION_WASM_AUTH` | Stage WASM is denied by default; use `--allow-wasm` only for reviewed code, per invocation. |
| Browser executable / FFmpeg unavailable | Provision those dependencies explicitly; a package install is not proof of runtime readiness. |

Current transport limitation: capabilities uses Agent Tool Result v1, while existing analyze/inspect and legacy commands preserve their current response forms. Some legacy expected errors emit JSON on **stderr** with empty stdout. The acceptance script records this as a gap; it does not relabel it as unified v1 success. Agent-1 should review public CLI normalization without breaking existing contracts. Always inspect exit code, operation status, diagnostics and exact stream separately.

## Agent workflow and independent acceptance

1. Review project and module trust; use exact references. Query capabilities and actual availability.
2. Make project-local edits. Generate/review a new lock explicitly; never change shared runtime policy.
3. Inspect without frames, then render first/middle/final and random/repeated frames. Read real image content and structured diagnostics.
4. Fix deterministic failures in the caller's project, inspect again, compare lossless images separately from lossy video.
5. Decode the actual MP4 and examine the storyboard/decoded frames. Keep raw command stdout/stderr/exit codes and backend/cache context.
6. Check foreground ownership and observed browser cleanup, including abnormal exit. Do not claim an OS process snapshot proves all unobserved descendants were cleaned.

Independent scripts in `scripts/dx-1d/` import Node built-ins only and receive public launchers. They never import engine internal code. `install-consumer.mjs` tests a real tarball and refuses private-entry fallback. `blackbox.mjs` supports `--mode baseline|installed`; changing that label does not prove installation—pair it with the installation audit and its actual public bin. `preview-lifecycle.mjs` tests direct public preview and owned-process cleanup. `repl-process-audit.mjs` checks this component's default startup without a project. Raw results and exact invocation are in the DX-1D report.

Developer Preview readiness must remain **not yet accepted for independent installation** until Agent-1's final artifact and public launcher pass this same workflow in a clean consumer. The baseline/source workflows and optional REPL can be reviewed independently. No Analysis performance or Renderer optimization from other Agents is claimed here.
