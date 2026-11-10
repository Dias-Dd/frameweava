# Graphics Contracts public API 1.1.0

`@frameweave/graphics-contracts@1.1.0` is a standard ESM library. Its data protocol remains Graphics Schema v1 and `analysis.track/1`. Library version, data version and FrameWeave engine release version are separate identities.

The public API is generated from `index.ts`. The built package contains self-contained ESM and TypeScript declarations, plus a license and schema documentation. It has no runtime npm dependencies, engine imports, prototype imports, Stage factory, task scheduler, registry, install hook or automatic IO. Importing it does not create a browser, start analysis, load a model or acquire a runtime handle.

| Exports | Purpose and requirements |
| --- | --- |
| `PathData`, `MaskData`, `MeshData`, `SkeletonData`, `TextLayoutData`, related types | Static JSON wire contracts. |
| `TrackData`, `TrackSample`, `TrackQuery` | The unchanged `analysis.track/1` wire shape. Stable definitions live in `track-types.ts`; no prototype type dependency. |
| `validatePathData`, `validateMaskData`, `validateMeshData`, `validateSkeletonData`, `validateTextLayoutData` | Strict validation producing detached typed values. Skeleton validation requires its explicit mesh. |
| `validateTrackData(value)` | Formal strict Track validator; returns a detached complete TrackData. |
| `assertTrackData(value)` | Assertion form using the same validator. Does not rewrite caller data. |
| `queryTrack(data, sourceMediaSeconds, options?)` | One canonical query algorithm, moved from the old Reader without algorithm changes. Input must already be valid TrackData. Returns copied geometry. |
| `createTrackReader(value)` | Validates/copies once, then exposes stateless `query`. Validates query options without creating a new interpolation system. |
| `queryStageTrack(reader, localSeconds, {sourceStartSeconds,rate}, target)` | Explicit seconds/space projection helper. It accepts numbers and JSON metadata; it does not import or require a Stage. Node tools and AnalysisTask modules may use the same mapping. |
| `sha256`, `verifyResource`, `verifyResources`, `resourceReferences`, `readJsonResource` | Exact-byte integrity and explicit resolver helpers. WebCrypto is required for SHA-256. JSON/RGBA decoders use an owned verified byte snapshot. |
| `pathCommands`, `pathToMask`, `convertPathUnits`, `decodeRasterMask`, `sampleCoverage` | Data transformations and coverage operations, with no Stage dependency. |
| `rasterizeVectorMask` | Optional v1 browser Canvas adapter. Requires `document`/Canvas/Path2D **when invoked**; does not access them at import time. Kept in the existing public export set for compatibility. |
| `createTextLayoutGeometry`, `assertHorizontalTextLayout`, `TextWritingMode`, `TextBaselineAxis`, `TextGlyphOrientation` | Explicit vertical geometry interpretation and horizontal-consumer guard; no shaping or automatic orientation selection. |
| `LIMITS` | Deprecated addressability compatibility fields (u32/JS array lengths and safe integer accounting); no authored-data budgets. |

Node 22+, a browser Stage, a trusted AnalysisTask algorithm and a future Agent Capability adapter can all import the same library. Browser/Node APIs are used only by explicitly invoked helpers. A worker without DOM can use contracts/Reader/hash helpers; it cannot call the DOM rasterizer without its own adapter. Demo Stage factories stay in `experiments/` and are not published as library code.

```ts
import {validateTrackData, createTrackReader, queryTrack} from '@frameweave/graphics-contracts';

// IO belongs to the caller. The library neither finds files nor starts a task.
const track = validateTrackData(parsedResult);
const reader = createTrackReader(track);
const at = reader.query(0.3125); // source-media seconds
if (at.valid) console.log(at.trackId, at.anchor.x, at.anchor.y);
const nearest = queryTrack(track, 0.3125, {mode:'nearest'});
```

## Track compatibility

The `queryTrack` body is the original implementation. Microsecond rounding, `[startUs,endUs)`, same-segment/gap constraints, exact missing samples, nearest ties, last-point behavior and absence reasons remain unchanged. A fixed **810-query** digest captured before migration tests the real C3 delivery; it does not compare two aliases of the same new function as historical proof.

`prototypes/analysis-job-mvp/track.ts` is only a deprecated re-export. It contains no query algorithm, types or independent Validator. Concrete MediaPipe producer/demo/browser consumers now import the formal module directly. The producer's implementation identity includes the moved contract source hashes, so future analysis execution cannot silently reuse a cache identity that only hashes the old shim. Existing published result bytes remain readable without rerunning MediaPipe.

The old prototype assertion checked only part of the payload. Its compatibility export now uses the already established strict Graphics validator. Complete historical MVP and C3 results pass unchanged. Incomplete objects formerly cast to TrackData in synthetic tests were corrected to include required metadata; malformed partial payloads are not a supported compatibility promise.

Structured module failures expose `code`, message/path and, for module semantic errors, `details.path`. Use these fields across package boundaries rather than `instanceof` a class from another bundle. The existing Stage bridge wraps arbitrary graphics failures as `E_STAGE_RENDER`, with the original `[E_GRAPHICS_…]` and path in its message. This release does not change that engine diagnostic ABI.

## Build and management

From the worktree root:

```powershell
node --import tsx modules/graphics-contracts/scripts/build-package.ts
```

The default independent package directory is `artifacts/graphics-stabilization/package`. The builder refuses to overwrite an existing directory; supply another fresh path under `artifacts/graphics-stabilization` for another build. Build tooling uses this workspace's TypeScript/esbuild, but generated library code has no runtime dependency on them. Install/pack the **built directory**, not the source workspace module whose `dist` does not yet exist.

Two identities describe the same built library:

- Standard ESM/npm identity: `@frameweave/graphics-contracts@1.1.0` with `dist/index.js` and `dist/index.d.ts` exports.
- Existing R1 identity: `frameweave.graphics-contracts@1.1.0`, trusted local authority `frameweave.foundation`, JavaScript module `main`, platforms Web+Node, no capabilities or host permissions, **no effect manifest**. R1 `compatible:"0.1.0"` records the integration host tested here; the ESM library itself has no engine runtime dependency.

Use existing `installPackages`, `verifyPackages`, `installedPackages` and `restorePackages` in the **preparation layer**, then import the verified immutable snapshot via standard ESM. Do not put a package manager or default filesystem/network access inside the contracts library. Standard offline npm pack/install is another supported route, independent of R1.

## Existing R1 limits and minimal future proposal

R1 already manages no-effect JS/TS packages, so no package format/Loader change is needed for this release. Its project lock/resolver currently targets Web, despite Manifest allowing Web+Node. The Stage module Loader requires an effect owner and is not a generic Node import service; this library does not fake such an owner.

Ordinary library imports are not automatically verified against the R1 lock by a compiler build that has no PluginStage. A preparation tool must call `verifyPackages` explicitly. Portable project export can carry explicitly imported library **code** through normal source capture, but the existing effect-oriented package-root collection does not automatically preserve the pure library's R1 identity/config/lock. The distribution tests distinguish these two properties.

Actual export tests found an additional existing limitation: the default `.frameweave/packages` import loses its leading `./` during source-tree/capsule export and fails with `E_COMPILE`. This release records both failures explicitly. With the existing R1 config `store:"./vendor/packages"`, both export modes carry the explicit library code and render identically after the author project is unavailable. The test performs a normal installation first, changes only `config.store`, then calls frozen `restorePackages` with the original lock to populate the new managed store. It neither copies an unlocked substitute nor changes package hashes. An already-created config requires its matching lock in current R1; do not bootstrap a custom store with a config-only file.

A separate future proposal may add explicit used-library dependency metadata to project preparation/export and a platform-selectable R1 resolver. It should consume the existing package identity and standard module entry; it must not add effect/Stage requirements to Graphics Contracts. This release makes no public package format, Loader ABI, TVG, P4 or C3 scheduling changes.

## C3 boundary

C3 remains generic over its output/Artifact types and does not import TrackData. The MediaPipe module emits the existing Track format. The stable Reader reads the published file after its declared length/hash is checked, and Stage adapters project it to ordinary JSON/number outputs. Analysis runs before publication, never inside `renderAt()`.

Current evidence uses the checked-in successful C3 publication's Manifest and Track file: 64 samples, 7 absent observations, Track SHA-256 `7e286a2915347b3c04602157939bc6be0c6e3b1f859decc0dbca81dbd47018b2`. Its metadata/cache identity and available output bytes are checked. Missing original PNG files and `complete.json` are not reconstructed; this is not a claim that the unavailable full Artifact cache directory was revalidated.
