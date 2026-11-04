# Native roto and paint authoring

Twenty concrete GPU methods plus an explicit CPU geometry adapter. See frozen
evidence for actual device, formats, comparison gates and unverified scope.
This directory does not add a renderer, GPU owner, registry, state scheduler or
generic model execution host.

## Entry points

The pure paint/geometry entry is index.ts. It works with the existing Native
scope without requiring neural inference. createNativePaintEffects supplies
paintStroke, airbrushStroke, bristleStroke, dryBrushStroke, scatterStroke,
cloneStroke, healStroke, smudgeStroke, wetMixStroke, eraseStroke, dodgeBurnStroke,
brushHeight, paintRelief, traceContours, contourStroke and autoScribble.

The separate index.neural.ts requires Agent-1 Native inference v1:
createInference, runInference, releaseInference. This worktree baseline does
not contain that Core delivery. It was tested through a read-only isolated
bd188034faf758dab2a1eec7198993323240fd7e SDK fixture and a locally built matching
owner, using the reviewed d59123d2 DirectML runtime delivery. Nothing was
merged or synchronized into this branch's Core, no locks/trust were refreshed,
and the public installed SDK/R1 package is not declared upgraded/available.

createNativeRotoEffects adds segmentRoto, propagateRoto, refineRoto and
rotoEdgeOverlay. Models initialize in the existing Stage init; dispose drains
the recipe then retires the two model declarations. Actual runtime verification
comes from completed frame tickets and inference execution receipts, not from
constructing the effect or parsing a model descriptor.

~~~ts
const effects = await createNativeRotoEffects(init, parseRotoBundle(bundle));
return effects.processImage(image, async (source, fx) => {
  const tracked = await fx.propagateRoto(source, explicitReference, [
    {id:'subject', position:[340.5,250.5], label:'foreground'}
  ], {id:'subject-mask'});
  const refined = await fx.refineRoto(source, tracked);
  const contours = await fx.traceContours(tracked.image);
  return fx.contourStroke(refined, contours, {width:1.5});
}, {context});
~~~

project.tsx is the editable neural example. prepare-model.py explicitly derives
the pinned ONNX weights into a chosen project-local model directory. Rendering
never downloads models or runtime DLLs. The optional QA photograph has separate
provenance and unconfirmed individual redistribution terms; it is not a library
asset. Point/box collection, UI, automatic upstream sampling and a new C3 job
system are not implemented here.

## Contracts and algorithms

* Brush strokes have explicit stable stroke/point IDs and physical pixel-centre
  positions, pressure and existing Signal leaves. Arclength-spaced dabs,
  elliptic tips, hardness and multiplicative flow/opacity deposition adapt the
  pinned EffectCraft paint.rs equations. HDR signed RGB is never clamped.
  New stochastic modes use explicit deterministic seed/control values.
* Clone samples a separate explicit image. Heal replaces low-frequency colour
  while retaining donor detail. Smudge and wet pigment are ordered GPU buffer
  operations; they have no cross-frame hidden history. They clone resident
  storage per dab and update only the actual tip rectangle, with no JS pixel
  readback. Very long strokes remain bandwidth/command heavy; no transparent
  tiling or real fluid simulation is claimed.
* Height is a typed scalar data field, not a coloured image. Relief is a local
  normal/Blinn-light approximation; it is not a physical paint-volume solver.
* Marching squares uses asymptotic saddle decisions, oriented segments,
  canonical shared-edge intersections and stable grid-edge IDs. Contour stroke
  consumes the GPU field directly. contoursToPathData converts explicitly
  exported typed arrays into the existing strictly validated PathData v1.
  Grid IDs describe this topology; they are not cross-frame point matching.
  Existing PathData dimension/command limits still apply to JSON export;
  they do not cap GPU trace resolution. No TVG/P4/Graphics Schema was changed.
* autoScribble is deterministic mask-bounded wavy hatching, with continuous
  angle/phase/width/spacing controls; it is not a new path animation language.
* SlimSAM 77 uniform is an Apache-2.0 trained segmentation model. Fixed revision,
  original SHA/lengths and offline derivation are recorded. Learned operators
  and weights are retained; positive shapes are frozen and a F32-label to Int64
  Cast adapts the existing F32 inference IO contract. Model-specific point
  capacity is part of the derived immutable identity, not an image-size cap.
  Labels are foreground/background points; a full box/video-memory model is
  not claimed.
* The trained encoder consumes explicitly clipped SDR sRGB analysis data.
  Original scene-linear HDR/signed RGB is preserved for final PM masking.
  Internal model tensors are F32 even for F16 source/output. Mask postprocessing
  preserves the 256->1024, crop, original-size interpolation order. Neural
  accumulation gates are declared separately in NUMERICS.json; Pixel/Compute
  F32 3e-6 and F16 6e-4 gates were not widened.
* Propagation starts from an explicit reference and stable prompts on every
  request. It uses existing robust forward/backward GPU flow and confidence,
  inverts current->reference motion for prompt placement, then performs fresh
  model inference. Missing prompts/observations produce validity zero and
  transparent output by default, never an invented cross-occlusion trajectory.
  This is conservative stateless propagation, not a learned video-memory tracker.
* Refinement uses original signed linear colour guidance plus explicit choke
  and feather. Diagnostic overlay distinguishes edges, uncertainty and missing
  observations. Alpha0 PM emission follows existing clipping semantics.
* Inspection is an explicit GPU-publication callback. It does not permit Stage
  filesystem/network/CPU tensor access. Inference output clones enter existing
  recipe ownership, and original SDK-owned outputs retire after consumers.

## Execution, precision and integration

Existing NativeGpuScope/recipe lifecycle, automatic hardware backend selection,
Stage isolation, Source/Resource admission and cancellation are retained. No
qualified hardware means an explicit failure, with no software/Web/CPU pixel
fallback. The verified NN path uses the existing Vulkan owner plus one auxiliary
same-adapter D3D12/DirectML device; it is GPU resident with GPU interop copies,
not a claim of one API device or zero-copy.

Inputs/outputs distinguish scene-linear PM images, colourless tensors, coverage
and validity, scalar height and geometric segments. CPU arrays appear only at
explicit inspection/geometry/media boundaries or independent reference tests.
No handle enters persistent JSON/TVG. All recipe-local fields expire after the
recipe/frame. The only shared follow-up fixes image-estimation's final blend
to honor image amount; default amount=1 behavior is retained and covered through
real smudge/wet-mix GPU comparisons.

Model/backend availability, numerical/reference execution and public package
integration are separate states. Main owns SDK/public entry/version/immutable
R1 identity and final portability/security/cross-module acceptance. No formal
R1 version was overwritten.

## Reproduce

Use this worktree's own FRAMEWEAVE_HOME, reviewed Native/SpiderMonkey deliveries
and explicit FRAMEWEAVE_MEDIA_PYTHON. Neural tests additionally require the
copied, reviewed FRAMEWEAVE_INFERENCE_RUNTIME and isolated frozen SDK fixture.
validate.mjs records one cumulative <420 second campaign, including failed
attempts and builds. It checks all 20 method bodies exist before any validation.
The code and original failures, real outputs, commands, device and provenance
are kept in machine evidence. Models, runtime binaries and the QA photo are
external declared inputs, not silently installed library contents.

Untested: other GPUs/OS/providers, arbitrary photographs/occlusion sequences,
all parameter combinations, actual film/hair ground truth, learned video memory,
public installation and full repository release acceptance. Conservative
missing-data behavior and finite quality controls do not promise proprietary
AE/Keylight/Roto Brush bit-level or perceptual equivalence.
