# FrameWeave Shared Graphics Data Contracts v1

Status: stable pure library `@frameweave/graphics-contracts@1.0.0`. Source entry: `index.ts`; distributed ESM entry: `dist/index.js`. See [PUBLIC_API_V1.md](PUBLIC_API_V1.md) for packaging, runtime boundaries and compatibility. This is neither a TVG revision nor a P4 ABI revision. Each record is ordinary JSON carried by an existing `json` port or a declared `file` Resource. No root exports, registry, package manager, Stage port definitions, runtime locks or compiler changes are required.

## Audit and reuse

Audited synchronized base `9dbf886` on `agents/agent-3`:

| Existing contract | Reused boundary |
| --- | --- |
| `src/core/types.ts`: Json, ResourceSpec, PortRef, StageSpec, Surface | Existing JSON/file transport; PNG Surface is a transferable image, not a GPU object. |
| `src/core/graph.ts`: assertJson, port checks | Existing JSON gate rejects nonfinite numbers, cycles, functions and nonplain objects. A bounded preflight runs first. |
| `src/plugins/sdk.ts`, `parameters-v2.ts`, `plan.ts`, `runtime.ts`, `native.ts` | Parameter v2 validates closed recursive authored structures. Existing recursive animation evaluation precedes resolved parameter validation. Shared wire geometry is static **resolved data**, not Signal ASTs. |
| `src/core/time.ts`, `animation.ts` | Stage-local `context.time` is seconds derived from explicit offset/rate/FPS. No new keyframe or expression system. |
| `src/compiler/build.ts`, `runtime-lock.ts`, `src/packages/*` | Declared assets, project boundary checks, SDK and package hashes remain authoritative. Shared file refs add exact-byte verification at the consumer. SVG/glTF rewriting means source bytes may differ from served bytes; v1 examples use verbatim JSON/raw RGBA. |
| `examples/future-motion/world.ts`, `native-ui.tsx` | Three meshes and Pixi Graphics live inside their Stage. No existing persistent shared Path/Mask/Mesh/Skeleton/TextLayout DTO was found. |
| `src/web/declarative.ts`, render server/compositor | Font IDs resolve to declared font Resources; browser performs layout. Renderer forces sRGB. No persistent shaped glyph contract existed. Surface does not itself declare premultiplication; no existing Surface semantics are changed. |
| `track-types.ts`, `track.ts`, and frozen MVP/C3 result deliveries | Graphics Contracts now owns the unchanged Track types, strict validator and the one original query implementation. The old prototype path is a compatibility re-export. |

Keyword catalog search `effects search "vector mask path" --mode keyword` returned no matches in the isolated library. Converters use native Canvas Path2D; no plugin was reimplemented or registered globally. These are contract helpers and experiment Stages, not new catalog effects.

## Common rules

New records have `schema`, numeric `version: 1`, and stable `id`. The five independent IDs are `frameweave.path`, `frameweave.mask`, `frameweave.mesh`, `frameweave.skeleton`, `frameweave.text-layout`. **Track retains its existing `schemaVersion: "analysis.track/1"`**, cache key, provenance and segment IDs. Do not wrap or relabel a Track file to pretend its timestamps are animation frames.

Validators take `unknown` only at the boundary and return detached concrete typed records. They reject unknown fields, missing required fields, unsupported literal variants, nonfinite values, sparse/decorated arrays, accessors, symbols, cycles, live objects and unknown versions. Defaults are not silently inserted into interchange records. Module diagnostics use EngineError with `details.path` and codes `E_GRAPHICS_DATA`, `E_GRAPHICS_SCHEMA`, `E_GRAPHICS_VERSION`, `E_GRAPHICS_SPACE`, `E_GRAPHICS_LIMIT`, `E_GRAPHICS_RESOURCE`, `E_GRAPHICS_INTEGRITY`. The reused core JSON gate can also report its existing `E_SERIALIZE` with the offending path in the message.

Stable IDs identify the same logical object only within the record/producer's declared domain. Array order is not identity. IDs must be unique in each relevant collection; rebuilding topology requires the producer to preserve or deliberately replace IDs. A point ID is not a promise to interpolate an entire path or align different topologies.

Unknown fields fail rather than disappear. Future readers can add optional fields while continuing to accept old records; upgraded producers must omit new fields for an older consumer. Do not send such fields blindly under v1. Incompatible semantics require a new version/schema; consumers explicitly advertise accepted schema/version pairs at their module boundary. Modules can continue emitting v1 independently; no global simultaneous upgrade is required. This module does not implement a discovery/negotiation service.

Limits (see `LIMITS`): depth 24; 500,000 nodes; 100,000 array entries; 32 object fields; field names ≤128 code units; strings ≤65,536 UTF-16 units; paths ≤8,192 commands; meshes ≤16,384 vertices; text ≤16,384 glyphs; MVP tracks ≤600 samples; masks ≤4,194,304 pixels; dimensions ≤16,384; resource bytes and aggregate verification ≤64 MiB; JSON files ≤8 MiB. Most geometric numbers are finite in ±1e9; timestamps/indices are safe integers with narrower field-specific limits. Protocol limits are deliberate, not lossy truncation.

## Coordinates, time, color and resources

2D coordinates explicitly contain `{spaceId, unit: "px" | "normalized", origin: "top-left", x: "right", y: "down", width, height}`. Width/height always describe the square-pixel display extent in pixels, including normalized data. Normalized `(1,1)` maps to the right/bottom **edge**, not the last pixel center. Pixel centers are `(i+.5,j+.5)`. Native device pixel ratio is not a geometry unit. `convertPathUnits` preserves extent, space and IDs; arbitrary inter-space transforms require a separate explicit adapter. This version has no implicit Y flip, clip or auto fit.

3D mesh/skeleton coordinates use a named local, right-handed space: meters, +X right, +Y up, +Z toward the viewer. This convention does not imply a particular camera pose. Foreign engines must explicitly convert units/axes. Mesh and skeleton coordinate metadata must match exactly.

No static Path/Mesh/Text record carries a meaningless timebase. MVP time is integer absolute source-media microseconds with `[startUs,endUs)` range and the original FFmpeg sampling description. `frameIndex` is the analysis sample ordinal, **not** a composition frame or exact original-video PTS. `queryStageTrack` maps `sourceStartSeconds + context.time * rate` explicitly, allows fractional times, reverse and frozen rate, and delegates to the original query. No frame-grid snapping is introduced beyond the MVP's existing microsecond rounding.

Color is explicit `{space:"srgb", alpha:"straight", rgba:[r,g,b,a]}`, each channel 0..1. It describes encoded sRGB RGB plus straight alpha. Mask coverage is a linear scalar in 0..1, not a color. Raster RGBA8 is row-major, top-left, R/G/B/A byte order, straight alpha, encoded sRGB. Luma uses sRGB decoding followed by Rec.709 weights `.2126/.7152/.0722`, multiplied by alpha. This is the module's defined mask convention, not a claim that every external engine uses the same luma formula.

`ResourceReference = {resourceId, kind, sha256, bytes}` references an **existing declared** Resource, never a URL or path. IDs obey existing TVG Resource spelling `[A-Za-z0-9_-]+`; kind is file/image/font. SHA-256 is lowercase hex of the **exact served file bytes**. File SHA is not a digital signature or proof of a trusted author; project/package trust remains the existing R1 responsibility. `verifyResources` takes an explicit caller-provided byte resolver, rejects absent/hash/size/conflicting-ID records, and deduplicates identical refs. It grants no filesystem/network/process authority. `readJsonResource` verifies bytes before parsing/semantic validation. References alone cannot prove bytes exist: callers must perform verification before use.

## PathData

`{schema:"frameweave.path", version:1, id, coordinates, fillRule, commands, label?}`.

- Commands: absolute `M`/`L` with `point`, `Q` with `control` and `point`, `C` with `control1`, `control2`, `point`, or `Z` alone. Every point/control is `{id,x,y}` with unique ID within the path.
- Every subpath starts with M. Z closes to its M position and must be followed by a new M before further drawing. Endpoint duplication is unnecessary; use Z.
- Open paths stay open as geometry; **fill** implicitly closes them using the standard fill behavior. No stroke, tangent, arc or spline shorthand is included.
- `fillRule` is `nonzero` or `evenodd`; contour order/orientation is preserved verbatim. No winding correction is performed. In the declared Y-down plane, positive shoelace signed area corresponds to clockwise order. Self-intersections follow the selected fill rule, not a separate boolean solver.
- `label` is optional human text only. Styling, topology matching, morphing, path boolean operations and Puppet control semantics belong to professional modules.

See `examples/path.json`. `pathToMask` returns a validated vector mask; `pathCommands` lowers numeric commands to a Canvas/SVG compatible absolute path string.

## MaskData

Common fields: header, coordinates, `sampling: "nearest" | "linear"`, `boundary: "zero" | "clamp"`, `feather:{radius:0,unit:"px"}`.

- `kind:"vector"` includes an independently versioned PathData. Coordinates must match; fill rule comes from PathData. Canvas rasterizer emits white RGB plus straight alpha coverage, with antialiasing determined by the tested Chromium backend.
- `kind:"raster"` includes `source`, `format:"rgba8"`, `channel:"alpha" | "luma"`, `colorSpace:"srgb"`, `alpha:"straight"`. Source is a file and exact length is width×height×4. External PNG/JPEG/WebP must be decoded explicitly to this representation; v1 does not disguise encoded files as raw pixels.
- `decodeRasterMask` verifies bytes then yields a **Stage-local Float32Array**. `sampleCoverage` samples pixel coordinates with centers at half-integers; linear sampling applies boundary behavior separately at each tap. These buffers never enter persistent TVG.
- Sampling/boundary metadata governs subsequent coverage reads, not Path2D's primary fill antialiasing. Pixel extents/units must already match before rasterization; no implicit resize is performed.
- Nonzero feather, arbitrary color spaces, signed-distance fields, animation/frame-sequence references and temporal masks are deferred. Unsupported requests fail. A future sequence format must define its own source-time basis and hashed frame table rather than reinterpret Stage frame numbers.

## MeshData and SkeletonData

Mesh v1 is a triangle **rest mesh**: stable `vertexIds`, matching `restPositions` XYZ triples, indexed triangle triples, optional per-vertex `uv` pairs and `uvOrigin:"top-left"`. UVs are finite and may tile outside 0..1. Repeated indices within a triangle are rejected; collinearity, manifoldness, self-intersection and artistic mesh validity are not certified. Optional `controls` reference explicit vertex IDs. Optional material has straight-sRGB `baseColor` and/or a hashed image texture reference. No shader/PBR graph or live texture is embedded. Current deformed positions, normals, tangents, morph targets, arbitrary control attachments and solver state are module-private or future separate contracts; rest coordinates must not be overwritten with a moving pose.

Skeleton v1 explicitly names `meshId`, uses identical space metadata, and must be validated with that mesh. Bones have stable IDs, existing acyclic parents or null, and affine 4×4 **column-major, column-vector, global mesh-space** `bindMatrix` and `inverseBindMatrix`. Product must be identity within absolute 1e-6. These are not parent-local transforms. Each mesh vertex has exactly one weights record; 1–4 unique bone influences, positive weights summing to 1 within 1e-6. No implicit renormalization or missing-weight repair. Bone animation, IK limits, retargeting and skinning kernels remain private. No glTF import/export compatibility is claimed merely because these conventions resemble glTF.

## TextLayoutData

Static **already shaped** glyph exchange, not a shaper. It includes original `text`; `layout:{engine,version,clusterUnit:"utf16"}`; stable fonts with hashed font Resource + `faceIndex`; styles with font ID, positive font size and explicit color; logical paragraph ranges with ltr/rtl; line ranges/paragraph IDs/baselines; glyphs in visual draw order.

Glyph fields are stable ID, line ID, style ID, font-specific integer glyphId, logical UTF-16 cluster range, final x/y origin and advanceX/Y. Every cluster lies within its line and cannot split a surrogate pair. Multiple glyphs may share a cluster. Glyph positions and advances use the enclosing coordinate unit. No implicit font substitution, shaping or bidi reorder occurs at consumption. The validator checks ranges, references, hashes and finite positions; it does **not** parse font tables, prove a glyph ID exists in a specific face, validate shaping correctness, or guarantee browser text fallback/raster equivalence. Library1.1.0 adds optional vertical writing metadata below. Variable-font axes, script/language runs, shaping/paragraph style engines, line breaking and live font objects remain outside the wire contract.

### Vertical writing extension (library1.1.0, data schema still1)

- Paragraph `writingMode?: horizontal-tb | vertical-rl | vertical-lr` describes block flow. Omission means horizontal interpretation. `direction: ltr | rtl` remains Bidi-only; do not put ttb/btt there.
- Line `baselineAxis?: x | y` identifies the coordinate held constant by `baseline`: horizontal uses y; vertical uses x. Omission is interpreted from the parent mode. An explicit inconsistent axis is rejected. Vertical-rl columns progress toward decreasing x; vertical-lr toward increasing x. Already-shaped glyph origins/advances remain authoritative, including zero advances.
- Glyph `orientation?: upright | sideways-right | sideways-left` applies to ink only. Missing/upright does not rotate. Sideways requires a vertical paragraph: +90/-90 degrees around the final glyph origin(x,y), clockwise/counterclockwise in y-down coordinates. All path controls rotate too. Do not rotate advances, clusters, font identities or already-oriented geometry again.
- Optional fields are emitted only when present. Existing horizontal normalized JSON, field order and content hashes are unchanged. Unknown fields/enums, inconsistent references, split UTF16 surrogate pairs and non-finite numbers still reject.
- `createTextLayoutGeometry(layout)` validates/copies once and returns `lineAxes(id)`, `glyphAnchor(index)`, and `orientGlyphPath(index,path)`. The latter consumes positioned, not-yet-oriented canonical outlines. It does not shape, reorder, break lines or infer Unicode orientation. The producer must choose orientation using its reviewed shaping/layout implementation.
- `assertHorizontalTextLayout(layout,consumer)` guards existing horizontal-only consumers with E_GRAPHICS_WRITING_MODE. Generic glyph animation/Bidi extraction/Native mesh preparation are vertical-aware; paragraph hit testing, typography edits and path-text layout still reject vertical input through that guard.

This is an additive contract on schema1, released as a new immutable library version1.1.0. Old1.0.0 validators deliberately reject the new fields. Existing stored snapshots/locks are not overwritten. The integration host SDK Pin changes with source bytes; consumers must review upgrades. Full vertical paragraph layout, mixed-script orientation selection and fonts without vertical metrics remain producer qualification work.

## TrackData and Reader

The original MVP payload and query semantics are normative. This module formally owns its types and the unchanged query implementation, and validates the complete frozen metadata/sample structure and producer configuration (integer sampleRate 1..30, even analysisWidth 128..1280, at most 20 seconds/600 samples), before passing values to `queryTrack`. The prototype no longer owns an independent implementation. MVP confidence remains **null** (not exposed by the SDK); `valid` controls observation validity. Coordinates may lie outside the normalized viewport; they are not silently clamped. Segment IDs describe contiguous visible-face segments, not person identity or re-identification.

Default linear lookup only interpolates adjacent valid samples with the same segment ID and gap ≤`2/sampleRate`; missing detection, different identity, excessive gap, missing brackets or outside-range time produce the original explicit failure reasons. Exact missing timestamps remain missing. Nearest mode retains the original behavior, including nearest endpoint within its permitted gap; it is opt-in and does not synthesize observations. The Stage experiment uses the default linear mode.

`createTrackReader` copies once, validates once, and provides stateless queries. `queryStageTrack` returns a **private demo projection** `{visible,x,y,...}` for an existing Stage consumer. It is not a second public Track schema or a new animation AST. Absent results have `visible:false` plus the original reason, without invented x/y. The marker adapter clears its surface on absence. Original frame/media/model hashes remain provenance; their files are not needed for querying. MVP frame refs lack byte lengths, so this module does not invent complete ResourceReferences or claim to have verified absent source media/model/PNG bytes.

## Ownership and transport

| Safe exchange | Owner and boundary |
| --- | --- |
| Small Path, vector Mask, rest mesh, shaped layout, Track samples | Existing json ports with consumer validators; Stage isolation unchanged. |
| Large geometry/layout/track files; raw RGBA; fonts and textures | Declared file/image/font Resources plus content refs; read/verify explicitly. Caps still apply; v1 has no binary mesh accessor container. |
| Signals authored in Stage.props/P4 parameters | Existing evaluator first, then professional module validates the **resolved** record. Passing an AST as a Path coordinate fails the shared validator. C2 cannot express a full discriminated Path command union; shared semantic validators are still necessary after generic parameter validation. |
| GPUTexture, WebGL handles, Three Object3D/BufferGeometry, Pixi Graphics, Path2D, DOM, WASM Memory, typed pixel buffers | Stage-local runtime objects. Never persistent TVG or JSON ports. Serialize a DTO or hashed file, recreate privately, dispose privately. |
| Algorithms and private details | Mask feather kernels, glyph shaping, Puppet IDs/solvers, 3D materials, Vision models and analysis job handles remain namespaced private module schemas. |

Only schema identity/version, stable IDs, relevant units/axes/time, alpha/color rules and content refs are shared. No universal mega-object, capabilities registry or hidden global scene is introduced.

## Interoperation experiments and reproduction

`experiments/vector-producer.ts` generates PathData. `mask-consumer.ts` imports only shared contracts, accepts it across a real isolated json port, rasterizes with Path2D, and publishes a regular Surface plus MaskData. A separate file consumer verifies `path.json` before use. Tests compare evenodd/nonzero center pixels, fractional curve alpha, normalized-vs-pixel output, implicit closure, repeated seeks and tampered resources.

`experiments/track-reader-stage.ts` reads the byte-identical frozen real MVP output `examples/track-mvp.json` (SHA-256 `7a8b35155ed646379b9e9de7d3e6a6fe9557d5cbb7bc6dcc5522a571edb728b2`). `marker-consumer.ts` has no analysis dependencies: it receives projected values through an existing json port. Source is the checked-in MVP validation delivery, not synthetic face motion; no MediaPipe/inference is rerun. `examples/identities.json` records exact bytes and hashes. `prepare-examples.ts` deliberately regenerates only these local examples; it does not refresh any engine/plugin lock.

From the assigned worktree:

```powershell
node node_modules/typescript/bin/tsc --noEmit -p modules/graphics-contracts/tsconfig.json
node --import tsx --test modules/graphics-contracts/tests/*.test.ts
node --import tsx src/cli.ts frame modules/graphics-contracts/examples/project.tsx --frame 64 --output artifacts/graphics-contracts/manual-frame.png
```

Tests render source frames 0/middle/final/missing/fractional-sample times, repeat out-of-order seeks, compare a fresh uncached Renderer with RGBA tolerance zero, encode all 128 frames at 16 FPS, and fully decode the resulting MP4. Evidence is under `artifacts/graphics-contracts/`. Same-browser pixel determinism was verified; cross-browser, different GPU/font platforms and lossy-video pixel equality are not claimed.

## References and proposal

Path commands and implicit fill closure follow the [W3C SVG paths](https://www.w3.org/TR/SVG2/paths.html) and [fill rules](https://www.w3.org/TR/SVG2/painting.html#FillRuleProperty). Mesh/skeleton conventions were checked against the [Khronos glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#skins); text cluster design was informed by [HarfBuzz buffer/glyph definitions](https://harfbuzz.github.io/harfbuzz-hb-buffer.html#hb-glyph-info-t). These are deliberate small conventions, not implementation of those full standards.

**No TVG/P4/port change is necessary for the demonstrated exchanges.** The standard ESM package and existing no-effect R1 management identity are documented in [PUBLIC_API_V1.md](PUBLIC_API_V1.md). C3 remains generic; its completed real MediaPipe Track Artifact is tested through this Reader and existing Stages. Future library-dependency export metadata, capability search, binary accessors and sequence schemas require separate review. The library does not require a Stage or AnalysisTask to be used.
