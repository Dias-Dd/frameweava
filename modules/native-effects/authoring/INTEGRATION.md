# Main integration points (proposal, not applied)

- Independent source entry: `modules/native-effects/authoring/index.ts`.
  `node.ts` is an explicit Node-only asset service and is deliberately absent
  from the Stage entry's exports/dependency graph.
- Reuse `native-image-effects`' existing package builder and transitive source
  carrying. Choose a **new immutable version**; do not overwrite 0.7.0. No
  Manifest/public.ts/api.d.ts/domains.ts/bindings.ts/SDK/lock/trust edits were made.
- Review explicit named pure authoring exports and their source-stage runtime
  lifecycle through the existing R1 loader. Avoid blindly adding another GPU
  registry or blindly marking pure constructors as eager GPU calls. Existing
  `defineLut`/`cubeLut` names must retain one shared implementation/validation
  identity; do not introduce ambiguous `export *` duplicates.
- Add a separate supported Node entry for `prepareImageAsset`, following the
  existing distribution rules. Do not carry Node filesystem/codec code into the
  Native Stage entry. Source examples use ordinary relative named imports now;
  they are not claims about an already published package/subpath.
- Main's installed/trusted borrowed-scope and portable/export tests remain
  required before a formal release. Keep factory cleanup and each Stage's
  isolated scope; no root GPU owner/device is disposed by this convenience API.
- Keep the functions in the image library's own supported entry; do not replace
  similarly named core EffectSpec constructors in `@frameweave/engine`. Carry
  recommended `project.tsx`/`photo.tsx`/`half.tsx` examples and their sealed `.f32`
  assets. Negative/transient reproduction fixtures are not default entry points.

Core follow-ups are separate from this delivery:

1. Pre-sync `266d2648` transient `surface-v2` resource + original six-operation color chain: sequence
   `[0,6,11,3,0,6]` yields 176/224 non-finite channels on final two requests,
   identically in original and convenient code. First index18224/16276.
   Authoritative raw data: `9-inspectFull/` in the frozen evidence. The symptom
   has not been inferred for synchronized `50a323bb`. No claim is
   made that the unrelated seedScope fix repairs this. The qualified immutable
   source helper isolates this boundary; it does not repair it in Core.
2. The current declared image import requires exact source dimensions and lacks
   a Stage-safe read-only metadata query. For automatic PNG/JPEG sizing, a minimal
   future host query should return verified declared-resource dimensions/color
   metadata without granting arbitrary file access. This branch uses the Node
   preparation result's `native` metadata and the existing GPU `resize()` path.
3. The prior frozen SpiderMonkey host lacked AbortSignal globals. Real Node renderer
   cancellation is used/tested. No host polyfill, permission or ABI was changed.

All algorithms/shaders and upstream notices remain with their original modules.
The only new source image kernel is the existing qualified immutable F32 input
adapter lifted from `video-roto/stage.ts` (Frameweave Apache-2.0), not an effect or
another renderer. Existing EffectCraft/MIT and other domain notices are retained
by the existing package builder when those dependencies are carried.


Advanced source checkpoint adds `advanced.ts`, `workflows.ts`, and auxiliary
source metadata/preparation to the same authoring entry. `ImageFrame.input`
resolves declared sources; `withImageSources` carries them through ordinary
custom functions. This does not require a TVG/P4/owner ABI change. Keep the
standalone ordinary pure-constructor entry decision separate from `gpuExports`:
the current managed compiler blocks whole-package project evaluation with
`E_MANAGED_SCOPE`. Main is reviewing the appropriate ordinary authoring/Node
bindings before selecting a new immutable package version. Source-backed
execution evidence does not qualify installed/portable loading by itself.


Depth/temporal source checkpoint adds typed `ImageAsset<T>` preparation,
`withImageAssets`/`frame.asset` and composition metadata in the same Stage-local
coordinator. It is not a TVG/P4/port/owner ABI or registry change. `depthMap`
initializes an original metre-z field; the domain consumer retains its WeakSet
and owner checks. Temporal observation declarations retain exact Rational times,
explicit missing records and original domain algorithms. `trackPoint` delegates
to the unchanged Graphics Contracts reader; JSON input is strictly validated.
No model inference, new shader, global permission, lock, SDK or Manifest change.

Optional future interface request: FrameContext carries a floating fractional
local frame without the exact Stage rate/offset. An existing-Core-approved exact
local rational timestamp or read-only time mapping would allow `imageTime` to
automatically map fractional-rate Stages. Current helpers require an explicit
rational time/callback for that case and never reconstruct a guessed fraction.
This is a recorded proposal, not implemented or a condition for integer-rate
workflows. Larger binary depth admission and persistent prepared analysis/profile
assets also remain with existing admitted resource/cache paths; no private ABI
extension or fake cross-frame state was introduced here.


The family/procedural checkpoint keeps that same independent source entry and
adds typed async processor preparation, generator sources and named style,
composite, raster, warp, grading, finishing and OCIO image adapters. Main/public
bindings are unchanged. `ImageFrame.process` accepts either the prior synchronous
factory or a declared `ImageAsset<ImageProcessor<F>>`, with both tracked by the
same frame coordinator. It does not change the native owner/P4 ABI. `apply` keeps
its original 3-argument overload and has a typed frame-enrichment overload for
imageStage, so primary and auxiliary sources share one invocation cache without
losing Stage inputs/props. This resolves the earlier recorded separate-cache
limitation. Generated sources use independent processor leases per prepared
source identity and share the admitted Stage device.

Node-only additions: exclusive/budgeted/hashed `prepareCubeLut` and the existing
explicit `prepareOcio` re-export. Neither enters the Stage graph or acquires
permission. The Stage `lutDefinition`/`ocioDefinition` data boundaries delegate
to the original complete validators; OCIO content seals are still verified at
original Stage initialization. Do not count schema eligibility or installed data
as trust/runtime verification. Display-referred OCIO output remains the original
explicit typed terminal rather than a relabeled scene-linear image.

Verification retained an actual RG fixture admission failure and resumed only
unverified paths after correcting that fixture's Alpha declaration. The original
opaque/linear/working-encoding checks and numerical thresholds were not relaxed.
Source-backed exact Rgba/media evidence is not formal installed/portable proof.


The typed-data/estimation/paint checkpoint adds five static data constructors and
semantic TypeScript brands over ORIGINAL GpuDataBuffer/MotionField values. All
business metadata/value checks remain explicit. They are Stage-local assets,
not TVG/Graphics/port/file schemas. No GPU owner, data ABI, package lock or public
entry changed. Internal `closure-asset.ts` shares the original async color/filter
processor declaration across color and field constructors, once per Stage.

Estimation and paint compounds create/consume original temporary fields within
one recipe. `spectrumOverlay`/`waveformOverlay` also keep generator + source-over
in one recipe so an original processor cannot release a backdrop before the
composite consumes it. Raw generator semantics stay intact. Sequential smudge/
wet mix still reject stencils; convenience types now expose that actual original
restriction rather than promising unsupported input. No clone/retain API or
private protocol extension was introduced to solve composition.

Raw original-smudge fixture failure, the first complete-media failure exposing
waveform replacement, selective remaining/new-path GPU validation and successful
media rerun are all retained in native-image-field-authoring-evidence. Exact
u32 identity, Float32 data/headroom and F16/F32 RGBA are checked against original
entry paths. Numeric buffer exports are intentional readbacks. No physical seed-
upload count or new persistent analysis/geometry cache claim is made. Formal
pure/managed bindings and portable/trusted installed verification remain required.


Neural convenience adds only original SlimSAM declarations, four recipe helpers,
and Node-only explicit local model-data preparation. Stage dependencies are the
existing create/run/release inference scope, exact model/file Resource seals and
operator-provided reviewed F32 DirectML runtime. No inference download, model
registry, trust grant, new ABI or temporal state system is introduced. A stable
rotoModel identity is prepared once by the existing Stage asset cache. Refinement
and edge overlay stay inside the original recipe lifetime. Existing-Stage and
optional imageStage examples share the same implementation. Main must retain the
pure declaration / Node preparation / Stage execution separation when publishing
an immutable package; source-backed tests are not installed/portable proof.


Real integration failure retained: the default three-frame native MP4 export
starts `nativeLogic.close()` (Renderer line480), whose Resource cleanup unlinks
ONNX files, concurrently with `nativeClient.close()` (line483). Windows/ORT can
still map the model; resource-images.ts line112 then throws EBUSY and the export
fails. Core ownership must separate Stage disposal from final file retirement
and await actual accepted work/model release before deleting resources. This
checkpoint changes none of those files. Explicit public maxConcurrency:1 MP4
passed, including close and independent lossy pixel comparison; that result does
not qualify default multi-slot cleanup. Both evidence paths and raw errors are
in native-image-neural-authoring-evidence. No native process remained after the
failed run; its blocked lease-file cleanup remains a known Core issue.


Video-source convenience is confined to video-source.ts, the authoring export,
and isolated examples/tests. It emits the existing NativeVideoResource contract
and existing timestamped ImageObservation values. No Stage port/DAG/ABI, decoder,
permissions, cache or clock changes. The declared source can be used directly
with createImageTools in an existing Stage. CPU media decoding is explicit and
separate from GPU-only pixel algorithms; hardware admission is merely forwarded,
not newly qualified. Main still owns formal public pure/Node/Stage bindings,
immutable module identity, SDK/locks, installation and portable tests.


Video Roto convenience adds pure videoRotoModel declarations, ordinary
trackVideoRoto recipes/explicit readers and Node-only prepareVideoRotoAssets.
It uses the original SAM2 profile and original replay/continuation code unchanged.
No owner/ABI/state protocol or root video-roto/model assets changed. The local QA
uses its own exact standard v10 cache/derived descriptor, never mismatched files
from the old fixture directory. The first v11 basic-optimized fixture was rejected
by the existing standard-ONNX admission gate; all three v10 original graphs pass
that unchanged gate. The original failure and v11 descriptor are retained. No
file, lock, hash or security policy was edited to make those v11 files pass.
Model temporal/projection constants are byte-value equal across the two bundles. Animated numeric controls reuse core evaluate; source
frame mapping stays explicit and integral. RotoPrompt, BrushStroke and StrokePoint
are type-only re-exports of original contracts for normal named type imports.
Public bindings/immutable package/portable integration remain Main-owned.

Main notified this chat that cf214adb3c0453dcba6af828c8456363e682f31c fixes the
ORT lease cleanup race and passes a true3slot original-model Core-only reduction.
That commit has NOT been synchronized here and does not replace this worktree's
original617 failed-neural evidence or qualify every effect scene. This worktree
uses explicit single-slot model media validation on its actual baseline.


## Usability acceptance boundary

| Original requirement | Owned implementation/evidence | Remaining integration |
| --- | --- | --- |
| Less setup/defaults | Plain constructors, prepared images/LUT/OCIO, source/field/model declarations; frozen authoring/advanced/data/family/field/neural/video/SAM2 campaigns | Official package binding |
| Full professional controls | Original typed option objects and factories through withEffects/withPreparedEffects/ImageFrame; exact original-entry comparisons | Main must preserve complete types in public exports |
| Ordinary TS/async/composition | Named source exports, ordinary callbacks and async readers, createImageTools in existing Stage; optional imageStage only | Ordinary pure/Node/Stage managed binding, not eager GPU constructors |
| Existing animation/time | Existing Signal/evaluate, FrameContext, exact source seconds, explicit frame mapping and missing semantics | No automatic upstream sampling promised |
| Lifecycle | Once-per-Stage identities, frame-local scratch and explicit cleanup/cancel checks; no second owner | SAM2 MP4 hits old-Core EBUSY; cf214adb must be integrated and actual scene requalified |
| Precision/permissions | Real Native GPU F16/F32/HDR/negative/Alpha tests; original resource/model seals and no trust/ABI/lock edits | Other devices/providers and publication/portable gates remain |
| Types/errors/discovery | Original-derived option types/named data types, indexed EngineErrors, editable examples and source/public status in README | Catalog/API discovery must follow actually published immutable version |

Experimental spherical sources remain explicitly unqualified under their own
README and paused original campaign. They are not exposed or counted as a newly
verified professional convenience family. This table does not turn source
candidates or generic adapter availability into installed/runtime-qualified
capabilities. The assigned source work has reached its integration boundary;
the complete user-facing goal is not claimed achieved while the above gates remain.


Post-sync qualification: after new explicit human authorization, Main backported
only cf214adb's Renderer/LogicHost close ordering at local commit0e527142. The
same actual SAM2 scene now completes the existing single-slot native MP4 service,
three frames independently decode, RGB byte MAE0.542 is below the predeclared8
budget, and close succeeds. Prior EBUSY and v11-admission failures remain intact.
See native-image-sam2-authoring-evidence/completion.json for the authoritative
follow-up; earlier blocked fields describe the original freeze, not current
single-slot status. Runtime binaries, third-party locks/trust, other Main work
and the pre-existing spherical drafts were not synchronized or changed. This
one-time synchronization authorization is fulfilled. The complete public-module
entry, immutable identity, ordinary installed imports and portable validation
still belong to Main and are not claimed qualified by source-only tests.
