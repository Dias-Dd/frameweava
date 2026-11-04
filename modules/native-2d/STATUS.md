# Native 2D integration status

Baseline: `f897527f4f4b50d78556bbab2364037609e00528`, `agents/agent-4`. Worktree: `D:/frameweave-worktrees/agent-4`. This module is under development; names below are proposals until backed by executable evidence.

| Area | Actual baseline | Action |
| --- | --- | --- |
| Stage, time, professional output, ownership | Existing Native/SpiderMonkey, FrameContext/Signal, creationStage and GPU resource arena | Reuse; no new runtime or Stage per object |
| Paths, winding, fill, stroke | PA createPathAuthoring, preparePathFillMesh, prepareSolidPathStroke/prepareStrokeMesh; Clipper2 + Earcut | Adapt prepared geometry into shared batches; no second solver |
| Text shaping, measurement and glyph meshes | PA font-execution, text-layout, typography and live-text exports are present | Reuse actual owned services; no character-count measurement |
| Native raster | drawMesh source-over with F32 hardware blending; same owner texture/data inputs | Batch geometry/paint, isolate groups only when required |
| Old creator layouts | layout.ts arranges rendered child canvases; one source/quad/over per child | Reuse ownership/placement semantics; adapt object-level layout |
| Service assets | No local pa3-pathops/font/text-lines built kits found; old Kit initialize explicitly throws E_WEB_REMOVED | Frozen Native module resources/build entry requested from Agent-1; no alternate Worker/host |
| Existing constraints | Pixel ABI max4 images / max4 data, combined6; Graphics-v1 path8192 commands, text16384 glyphs; Schema-v2 bounded arrays | Treat as real baseline constraints, never invent an unconstrained support claim; request minimal owner changes with failures/measurement if needed |
| Browser semantics | Full HTML/CSS/DOM and unsupported SVG remain Servo work | Explicit choice; no hidden precision fallback |

Planned order: shared object/paint/geometry descriptions and a real Stage → Canvas recording → layout → SVG/text integration. Each stage gets one bounded validation campaign, editable examples, raw logs/media, and a frozen checkpoint. This status is not a completed-feature report.

## Frozen phase 1 evidence

- Native tree/paint/primitive/image/clip/group-isolation path actually executed on SpiderMonkey + RTX5070 Laptop Vulkan596.49. 13 L0 tests and strict types passed. No Core/owner/shared source changed.
- Independent F64 oracle: F32 max RGB1.9259750843048096e-6, Alpha8.940696716308594e-7; F16 max RGB0.00048828125, Alpha0. Black/white composites compared separately. Random/repeat/reopened instances passed; pre-cancel, edit-while-recording, controlled failure, close twice passed.
- PNG0/12/23, inspected source/decoded storyboards, all24 decoded MP4 frames (1second). Numeric float comparison is distinct from lossy H264.
- 1024 objects share one final mesh batch at1080p and4K. Transform/style edits keep static geometry seeds; geometry edit prepares one changed object and rebuilds the shared upload. This is not a claim that every layout or dirty edit is incremental.
- Directory and editable TSX capsule re-render exactly with original source directory hidden and empty private package home. Same reviewed SDK/runtime; independent installation/OS validation remains Main L3.
- Cumulative campaign188042.1202ms, including initial type/assertion failures and an ICC Python-path failure. Actual local pyvips is reused via an explicit private Python path; no download or implicit fallback. GPU execution timestamps, physical peak memory and realtime editing performance are not established.
- Candidate native-2d-candidate@0.1.0; source/binary/license hashes in validation/phase1/evidence/source-receipt.json. No Runtime Pin, trust policy or WASM grant changed.

At the phase1 frozen source checkpoint, reproduce with matching reviewed runtime binaries and the existing local ICC/OCIO Python packages: `node modules/native-2d/validation/phase1/run.mjs fresh-tag`. This fresh immutable candidate, private package home, raw logs, actual PNG/video, numerical, scale and export tests are one campaign. Set CREATION_PHASE only to resume a phase; every attempt remains charged to the same420s ledger. Do not erase that ledger to reset the budget.

Canvas recording, layout, SVG and path/font-service asset integration remain incomplete. The fixture is a resource/lifecycle regression, not a finished typography/art-direction showcase.

## Frozen phase 2 — drawing and layout

Canvas recording and automatic object layout are now implemented on the same object/GPU pipeline; see README and examples/dashboard.tsx. 26 L0 tests and strict types pass. The independent package consumer uses carried declarations (including intentional type failures); source-only type checks did not suffice and caught real packaging defects, all retained in the campaign. Final candidate native-2d-candidate@0.2.4 carries original Three MIT, Potpack ISC, d3-path/d3-shape/Earcut ISC, Flexily MIT and PA notices. Flexily0.8.3 fixed source adaptations are hash-recorded: disable optional logger imports; retain floating logical coordinates instead of terminal pixel snapping.

Real SpiderMonkey/Vulkan GPU: old HDR/clip/group oracle passes; new Canvas transformed-paint/globalAlpha/declared-image and flow-layout oracle passes for F32/F16, random/repeat and fresh instances. F32 maxRGB: Canvas1.8887221813201904e-6, layout9.5367431640625e-7; Alpha/black/white also compared. Actual PNG0/12/23, inspected storyboards and complete24-frame1-second MP4 decode pass. The final declaration/license-only package repair has byte-identical public.js/bindings.js to the numerically/video-tested0.2.1; exact proof is retained. 1024-object1080p/4K batching regression passes. Directory/capsule exports from a NEW project installed with the FINAL0.2.4 pass exact PNG with that source folder hidden and an empty package home. Earlier export evidence used0.2.1 and is not relabelled.

Cumulative phase2 validation 238815.0221ms, including failures/build/install/types/export. No GPU timestamp/physical-peak or new speedup claim. Reproduce the consolidated profile with `node modules/native-2d/validation/phase2/run.mjs fresh-tag` using matching reviewed Native/SpiderMonkey and explicit ICC/OCIO Python paths; do not reset the420s ledger. Existing source/Runtime Pin remains Main review.

Human steering: font and text usability belong to Agent-2. Do not implement or qualify font integration until its work completes and the user synchronizes this workspace. Local adapter contracts remain unverified for actual fonts. Complex path/stroke assets remain pending; no fake services/retired Kit replacement. SVG entrance is next; this checkpoint does not claim all Native2D work complete.

## Frozen phase 3 — SVG source adapter (font work deferred)

Final candidate native-2d-candidate@0.3.2 adds svg2D into the same object tree: local groups/transforms/viewBox, primitive fills, linear/radial gradients, explicit declared image mapping, rectangle clips and viewport cropping. Original Three0.186.1 SVG parse routines + actual xmldom0.8.15 XML parser + original PA arc lowering are reused (MIT). No loader, browser DOM global, Canvas raster/material/mesh/stroke alternative, external resource access or new host is introduced. General canonical paths/clips and exact curved bounds delegate to existing PA services and explicitly diagnose missing runtime assets.

39 L0 tests/strict source types/carried-declaration consumer pass. Real final0.3.2 SpiderMonkey/Vulkan F32/F16 independent RGBA/Alpha/black/white comparisons pass for random/repeated/reopened frames, declared float images, clipping, HDR overrides and isolated opacity. SVG default sRGB-straight and explicit linearRGB-straight gradients preserve transparent stop colors; native linear-PM default is separately compared. Initial0.3.0 native-linear SVG results are retained under superseded-0.3.0 and are not treated as final SVG semantics. W3C semantics and Core signed transfer equations are documented in README.

Final0.3.2 PNG0/12/23, manually inspected source/decoded storyboards, full24-frame1-second MP4 decode, and directory/capsule source-hidden/empty-home exact PNG pass. 1024-object1080p/4K regression is on0.3.1;0.3.2 only hardens unsupported attributes/empty shapes. Field errors and all prior validation attempts remain in the same ledger. Cumulative validation390880.3261ms including failures/build/install/exports, strictly below420s. No further broad tests are authorized by this checkpoint.

Editable entry: examples/svg-scene.tsx; consolidated replay: `node modules/native-2d/validation/phase3/run.mjs fresh-tag` from the frozen source with matching reviewed local Native/SpiderMonkey and the explicit ICC/OCIO Python paths. Do not erase/reset an existing campaign ledger. Raw commands/results/source and binary hashes/licenses/media: validation/phase3/evidence, especially qualification.json and source-receipt.json.

Human instruction remains active: font/text usability belongs to Agent-2; only reconnect/qualify after it completes and the user synchronizes this workspace. Existing optional service contracts are not actual font qualification. Public Core/owner/ABI/shared modules, SDK pin, other worktrees and trust/WASM policy were not changed. Main owns formal SDK/R1 identity/catalog (include SVG discovery metadata), Runtime Pin and L3. The independent profile is not full browser SVG/CSS/Canvas compliance or all Native2D font/path-service completion. Stop further expansion at this checkpoint.


## Default font/path checkpoint (2026-11-04)

Original PA font/itemizer/Clipper2 clients load lazily through existing R1 admitted modules. Default Noto Sans SC(wght400,zh-Hans/Hani,OFL), actual metrics/wrapping, fill/stroke and unwrapped tracking render in existing Native float output. scene.canvas(actualFrameContext) shares defaults; measureText/fillText must be awaited. Explicit providers stay borrowed. Core, GPU owner, pro-animation authoring, permissions and locks are unchanged.

Types and43 L0 tests pass. Candidate0.4.6 real SpiderMonkey/WASM/Vulkan passes F32/F16 signed HDR/partial Alpha,100→0→12→23→100, fresh instances, controlled failure/retry, WASM denial, real Canvas repeat/cancel/dispose, public PNG0/12/23 and24f/1s libx264 complete decode. Original public-provider geometry matches exactly; scoped cancellation listeners/reason/native preference pass. RTX5070 Laptop/Vulkan596.49. See validation/fonts/evidence/qualification.json, results-20.json and results-21.json.

Single cumulative campaign419528.0403ms<420s includes failed attempts/build/install. Attempt21 hit the remaining deadline during portable export/render; font portability is NOT VERIFIED. Original hidden source restored; operational inventory found no owned runtime processes. No further tests/builds after the deadline. Final source guide only corrects historical pending fields; candidate0.4.6 carries the prior guide, with unchanged runtime implementation. Main must rebuild formal package/review Runtime Pin; no quiet lock refresh.

Actual command receipts: types-19-time.json, unit-19-time.json, build-19-time.json, real-20-time.json and real-21-time.json. README gives explicit project-local packages install, frame --allow-wasm, render --encoder libx264 --allow-wasm. FONT_REFERENCE_TAG selects an existing PNG for focused portable replay; do not reset this exhausted ledger. Editable entry examples/fonts.tsx. No full SVG text/browser typography, OS fallback or automatic permission grant; curveFactory/morph remain explicit.
