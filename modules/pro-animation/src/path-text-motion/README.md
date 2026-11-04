# Actual-time path text

`preparePathTextAt(options, services, context)` recomputes the canonical baseline,
original kurbo metrics/inversion and whole shaped-cluster layout at the supplied
Stage context. `path` may be canonical PathData or an async pure context function,
including the original `interpolateSmartMorph` call. Distance-changing selectors,
offset/tracking and path geometry are resolved again; no integer-frame table or
straight tangent extrapolation is used.

```ts
// Existing admitted direct Kit loaders. No new WASM permission or worker host.
const morph = await createSmartMorphEngineFromKernel(await morphKernel());
const plan = await prepareSmartMorph(morph, from, to, {linear: true});
const painter = createNativePathTextMotion(init, paragraphRenderer, handle, {
  curveKernelFactory,
});
// Inside renderAt(c), or an explicit stateless isolated-seek-v1 sampleAt(c):
return painter.draw({
  line,
  path: c => interpolateSmartMorph(morph, plan, progressSignal, c),
  layout: {offset: offsetSignal, tracking: .5},
  draw: {ink: [-.15, 1.5, 2.8, .85], format: 'rgba32float'},
}, c);
```

`createNativePathTextMotion(environment, renderer, handle, services)` borrows the
original Native paragraph renderer, prepared handle and curve factory. It owns
only its in-flight curve preparation and last diagnostic layout. `draw` returns a
new caller-owned Native F16/F32 image. `geometry()` returns the last successfully
published layout. `dispose()` rejects new work and awaits preparation/recording;
it releases a just-produced image if closing raced publication. It does not
dispose the borrowed renderer, glyph handle, source Morph engine or GPU owner.
GPU completion remains the existing Renderer ticket's responsibility.

Prepare the canonical paragraph/glyph meshes once with existing font/shaping APIs.
This adapter animates baseline/path positions and rigid cluster transforms; it
does not reshape fonts per time, bend glyph outlines, invent vertical support or
change existing cluster/ligature/mark mappings. Existing `path-text` clipping,
orientation, fitting and coordinate rules remain authoritative. Use one top-level
host cancellation signal. The two existing curve factory alternatives are
mutually exclusive. Direct kernels use cooperative cleanup; they do not claim
forced in-flight WASM interruption. Device rendering requires the same admitted
Native GPU environment and original glyph renderer, with no CPU/browser pixels.

`createSmartMorphEngineFromKernel(kernel, options)` adopts a reviewed already
loaded kernel and uses the same existing Morph session/Rust algorithm as the
worker factory. It needs no browser AbortController, retains all original
correspondence and result-reset semantics, and disposes an unadopted kernel when
initial admission is cancelled. The worker factory retains its termination path.
`stroke-motion` now also awaits an async canonical path callback, so the same
original Morph can drive a variable-width stroke at a real fractional context.

The source API itself grants no upstream authority. The real integration uses
Core's existing declared surface input and explicit `isolated-seek-v1` hook in a
separate source instance. Only stateless functions are reused for that hook;
history/simulations must use the existing runner/seek contract. Package admission,
WASM permission, context/finite-range validation and output ownership stay in Core.
Main owns root exports, typed R1 routing/version/catalog/pins and portable L3.
