# Text controls

Ordinary TypeScript parameter functions over the existing glyph/source mapping and Stage-local context. Public root exports, immutable R1 identity/version and full distribution qualification remain Main-owned.

```ts
const domain = createTextSelectorDomain(layout.layout.text, units, {
  basedOn: 'characters-excluding-spaces'
});
const range = textRangeInfluence(domain, {
  start: 0, end: 100, units: 'percent', shape: 'smooth',
  smoothness: .5, easeHigh: .3, easeLow: -.2,
  amount: -1.5, randomOrderSeed: 7
});
const wiggly = textWigglyInfluence({
  seed: 17, min: -.7, max: 1.7, wigglesPerSecond: 1.75,
  correlation: .25, temporalPhase: 45, spatialPhase: -180,
  lockDimensions: false
});
const selection = combineGlyphInfluences([range, wiggly]);
const move = glyphTranslateDimensions(wiggly, {x: 10, y: 6, z: 4});
// Use move/selection with the existing createNativeTextEffects or Native glyph renderer.
const character = characterRangeOffset(expr.mod(expr.frame, 3), {
  range: 'preserve-groups'
});
```

`createTextSelectorDomain` accepts existing complete shaped units. Based On supports characters, characters excluding spaces, words and lines. A ligature/cluster gets the mean influence over its original source units, preserving its geometry and UTF16 identity. Spaces excluded by the domain receive zero. A different source/line mapping requires a new domain. Unicode/word segmentation uses the existing platform segmenter; preserve prepared mappings when exact cross-runtime boundaries matter.

`createRangeSelectorSampler` reuses the original Range point formulas, with explicit fraction/index/percent units, Start/End/Offset, six shapes, Smoothness, Ease High/Low, Amount and seeded random order. It is a lazy scalar interface with no inherited 4096-unit artistic array cap; a requested permutation allocates its actual unit count and remains subject to process resource accounting. The old bounded array API remains compatible. Amount can be signed or greater than one; all coefficients must remain finite.

`glyphInfluence`, scale/offset/invert/map/clamp/normalize/quantize/gate/retime/stagger functions explicitly opt into extended influence. Old plain GlyphSelector callbacks still require [0,1]. Combination modes preserve the reviewed selector algebra, including a lone Subtract starting from one; new combinations do not implicitly clamp extended results. Use `limit` for an explicit final bound. Opacity, blur and stroke width obey their physical ranges after influence; RGB, translation/rotation/scale are not silently limited to normalized weights. Same-endpoint Alpha is preserved exactly. No second clock/evaluator is created.

Wiggly reuses the original fixed EffectCraft algorithm with deterministic seed, correlation, phases, Min/Max and dimension lock. The callable defaults to dimension zero; `.dimension(i)` returns a pure selector. Translate/scale/rotate-dimension helpers compose existing 3D functions. Outputs depend only on the supplied context/unit/parameters, never call order or wall clock.

`characterGroupInfo`/`characterFromGroup`, preserving Offset/Value and range-mode functions use compact pinned Unicode16 lookup. Roman case, digit sets, symbols, Katakana and other supported blocks remain in their own declared groups. Combining marks, separators and formatting are preserved. Value maps the candidate's group rank into the original group; this policy is documented instead of guessing Adobe's internal table. Full Unicode mode delegates to existing Character Offset/Value. Newly substituted characters still require actual font coverage/shaping; no fallback glyphs are invented. The general grouping table is independent of host ICU versions.

Only scalar control, layout/source mapping and geometry math run on CPU. All pixel draw/Alpha/blur/compositing in the demonstrated chain uses the admitted Native GPU with linear HDR/negative RGB, F16/F32 and caller-owned image lifetime. This module does not provide a renderer, timeline, scheduler, package manager or permission bypass. Ordinary browser/Servo authoring remains separate from this explicit professional Native typography module.

The small-sigma regression in the existing glyph Gaussian path is fixed by transporting tiny positive coefficients as a normal mantissa pair plus a binary exponent. GPU scaling follows sample multiplication, retaining HDR contributions that a direct subnormal coefficient would lose. Normal coefficients retain the old pair and operation order. Gaussian sampling/normalization, GPU compensated accumulation and output precision are unchanged; no new CPU pixel path is introduced. Final arithmetic/storage remains subject to the existing qualified Native F32/F16 profile.

The old data-carrier math reference tests now verify original Rust/Cargo/runtime/API/component hashes and call the same reviewed direct Kit data client. They do not activate retired Web manifests or grant plugin permissions. The separate real Native private packet is installed and loaded through unchanged R1 trust/permission/ModuleLoader checks. Source/format tampering remains a hard error.
