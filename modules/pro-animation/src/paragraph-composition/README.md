# Paragraph composition

Independent entry: `paragraph-composition/index.ts`. Main owns public `pro-animation`
exports, typed R1 routes, immutable package identity and portable L3 qualification.
This entry borrows existing fonts, contextual itemizer and geometry services.

```ts
const paint = createNativeComposedText(init, {font, itemizer, pathOperations});
const image = await paint.draw({
  text: 'Frameweave balances clear professional text.',
  fontSize: expr.add(24, expr.mul(2, expr.time)),
  width: 300, x: 20, baseline: 38, lineHeight: 34,
  align: 'justify', minimumLastLineFill: .25,
  spacing: {
    word: {min: .8, preferred: 1, max: 1.5},
    letterEm: {min: -.025, preferred: 0, max: .06},
    glyphScale: {min: .98, preferred: 1, max: 1.02}
  },
  draw: {ink: [3, -.15, .7, .7], format: 'rgba32float'}
}, context);
// image is caller-owned. Await draw; dispose paint before borrowed services.
```

`composeParagraph(source, {font, itemizer, ...})` returns existing `ShapedBidiText`,
`ParagraphFlow`, and local `composition` metadata. The formal Paragraph Reader,
hit tests, selection/caret mapping, tessellation and Native renderer consume it
directly. It creates no new wire schema, timeline, GPU owner, font registry or graph.
Fonts must already be loaded/admitted. `fontForRun`/`scriptForRun` are borrowed pure
callbacks; changes between probes and publication fail `E_PA_COMPOSE_UNSTABLE`.

`optimizeParagraphBreaks` performs global dynamic programming over measured lines,
including fitness transitions and consecutive-hyphen costs. A candidate reshapes
the whole line in its original paragraph's UAX9 context; widths are not the sum of
independently shaped words. Default wrapping first seeks a complete UAX14 solution.
Only if none exists does `overflow:'grapheme'` expand the same DP to protected UAX29
boundaries. Hard/forced lines remain hard. Optimality is exact for these declared
boundaries and measured costs, not for every possible font-specific transformation.

`solveJustification` uses an active-set bounded diagonal quadratic solution. Word
factors, whole-cluster letter gaps, CJK gaps and horizontal glyph scale are solved
jointly, with caller min/preferred/max/weight controls. It never inserts a gap inside
an original ligature or mark cluster. `glyphScale` is an explicit affine change to
unhinted geometry/advances; it is not a fabricated variable-font wdth instance.
The source font instance remains explicit. Changing actual font instances is still
available through existing shapers/variable-font controls and `fontForRun`.

`minimumLastLineFill` is a SOFT target controlled by `shortLastLinePenalty`, not a
promise to violate spacing bounds to reach a minimum. Set either to zero to disable
it. Last lines otherwise retain their preferred natural width. Each line reports
`fitStatus:'exact'|'ragged'|'residual'`, requested/logical/full width, controls and
overhang. A ragged last line's positive residual is intentional. `overflow:'error'`
rejects an infeasible full paragraph; `'allow'` preserves bounded under/overfull lines
with diagnostics. No glyph clipping or unannounced extra scaling completes a fit.

CJK policies use original UAX14 opportunities plus configurable kinsoku sets.
Punctuation compression removes measured empty bearings, bounded by an authoring
`maxCompressionEm`; it does not erase ink. `hangingEndEm` explicitly permits closing
punctuation advance past the logical right edge. Full advances and paths remain
available to the Reader. Whitespace source is retained; optional line-edge collapse
applies only to original zero-ink spaces. NBSP is not a stretchable ordinary space.

Arabic/cursive words never receive disconnected inter-character gaps. Optional
`arabic:{kashidaCounts:[0,1,2]}` evaluates real, balanced font-shaped elongation
candidates. Counts are authoring choices with no permanent artistic ceiling; existing
source/resource admission still applies. `shapeKashidaRun` also accepts explicit
`{at,count}` entries. `kashidaOpportunities` requires Unicode16 joining types,
grapheme boundaries and complete original glyph-cluster boundaries, protecting
lam-alef and other ligature interiors. The actual font shapes Tatweel and new
joining forms. Unsupported/missing glyphs fail; no stretched rectangle substitutes.
Original UTF16 attribution remains canonical; `elongation`/`composition.elongations`
retain actual expanded input, insertions and font identity. This is local provenance,
not a second professional text schema or a claim of universal linguistic selection.

Shaping/layout is CPU/WASM mathematics. Pixels use only the existing admitted Native
GPU mesh/coverage/composition path, with explicit F16/F32 scene-linear PM output and
existing negative RGB/HDR/Alpha checks. The Native wrapper accepts existing per-unit
transforms/ink and explicit frame context. No browser or CPU pixel fallback is used.
Random access has no history dependency. Cancellation is checked between async probes
and before publication; borrowed font/worker lifetime remains the caller's responsibility.

Worst-case candidate measurement is quadratic in permitted boundaries, with real
shaping cost per candidate. `budget.maxMeasurements` is optional; `cacheEntries`
defaults to 256 and is caller-configurable, including zero. Cache summaries contain no
pixels and live only for this invocation. Admission does not turn this cache budget
into a total text/line limit. `measurements` includes all candidate probes; `measuredEdges`
reports successful selected-search passes. Pipeline timings are not shader-only latency.

The new joint compositor rejects tabs rather than moving existing tab anchors. Use
the existing tab-stop compositor for that policy. Dictionary hyphenation and JSTF
are not newly implemented here; visible soft-hyphen markers reuse the original line
service (default actual ASCII hyphen, caller-overridable). Vertical composition uses
the separate vertical producer. No all-CSS/all-font/language or cross-platform claim.
