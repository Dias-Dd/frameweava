# Deep Image v1 (candidate)

This optional module adds typed Deep EXR asset I/O and same-owner GPU surface-point flattening. It does not replace the Renderer, Stage DAG, P4/R1, Surface color/Alpha contracts or animation system. Candidate package identity `deep-image@0.1.0` is for Main review, not a published catalog entry.

## Build and use

```powershell
python modules/deep-exr/prepare-sources.py
node modules/deep-exr/build-native.mjs
node modules/deep-exr/build.mjs
frameweave packages install .frameweave/deep-exr/package --project <project> --add deep-image@0.1.0 --trust local:frameweave.native-media
```

Preparation downloads only three fixed official source archives and verifies their pinned SHA-256 values. The build verifies every extracted source file against those archives. CMake uses supplied source directories with FetchContent fully disconnected; it builds OpenEXRCore3.4.4, Imath3.2.2 and OpenJPH0.24.5, with pinned vendored libdeflate. No tool or library downloads occur at runtime. The Windows build uses an existing Visual Studio/CMake installation; set `FRAMEWEAVE_CMAKE` for another reviewed installation. The helper links the MSVC runtime statically. Full upstream licenses are retained. The helper executable and source input hashes have a `deep-build.json` receipt; runtime admission rejects a mismatch.

`FRAMEWEAVE_DEEP_EXR` selects the reviewed helper. Development defaults to this worktree's `.frameweave/deep-exr/build/Release/frameweave-deep-exr.exe`. Typed writeback uses the existing explicit `FRAMEWEAVE_MEDIA_PYTHON` with reviewed OpenEXR3.4.4/NumPy. Linux/macOS and packaged-engine distribution are not qualified by this Windows checkpoint. Optional runtime files must be packaged/reviewed by Main rather than inferred from package installation.

Inside the existing Native Stage initialization / managed initializer:

```ts
const image = await createDeep(deepImageSource(declaration));
// During renderAt, reusing the admitted asset:
const surface = await image.flatten({window: 'data', format: 'rgba32float'});
const ids = await image.extractChannel('objectId', {representation: 'bits'});
// Consume ids.buffer through the existing GPU compute/mesh/pixel interfaces.
await image.releaseChannel(ids);
// During Stage disposal:
await image.dispose();
```

`declaration` is plain data: exact existing Resource ID, original byte length, selected part, exact data/display windows, total samples and original channel names/types, plus explicit decode budgets. `deepImageSource()` validates JSON data into the generated public type. `api.d.ts` is extracted from the real TypeScript interfaces; no parallel parameter system or capability registry is created. An editable direct-source example is `examples/native-deep-exr/project.tsx`; the tests execute an actual installed managed named import. R1 trust/installation and SDK Runtime Pin remain existing engine responsibilities.

Use `Resource kind="file"`. A Deep file is structured sample data rather than an already flattened RGBA image. Admission requires the existing compiled build/resource seal and exact declared byte count. Original bytes remain unchanged. Core creates one private derived raw lease with a versioned header, counts, offsets, optional stable depth-sorted indices and original channel bit planes. The raw native import remains read-only under existing Naga/owner checks. Identity includes source seal/hash, codec/layout version, selected part, exact layout, budgets and interpretation. No per-frame file hash, decode, numeric scan, sort, CPU pixel roundtrip or upload is added. Admission does perform CPU file I/O, decode/index construction and one GPU upload.

## Typed data and media contracts

`modules/deep-exr/io.ts` provides `readDeepExr()` and `writeDeepExr()`. Reading uses a private snapshot and the fixed native decoder. It supports deep scanline and single-level deep tiled parts, all three lossless Deep codecs (None/RLE/ZIPS), multipart selection, cropped/negative-origin data windows and independent display windows. Counts are Uint32; CPU offsets are BigUint64; each channel retains its exact Half bits, Float32 or UInt32 values. UInt IDs, depth, normals and other AOVs are data; they do not receive OCIO/Alpha processing. Empty pixels and all-empty typed channels are supported.

The decoder reads/checks counts before allocating pixel planes. Both the OpenEXRCore allocations and sample/chunk buffers use the explicit tracked allocation budget; source/chunk geometry, counts, byte sizes and second-pass count consistency are checked. This is not a claim that the entire OS process RSS is capped: libraries, C++ metadata, Node copies and Python writer objects add overhead. Physical child/GPU peak is reported unknown. Cancellation/timeout kills the fixed process and waits for close before removing private files.

Writeback preserves selected typed sample data, part names, data/display windows, channel linearity and supported typed attributes. Compression/storage may be explicitly selected. Unsupported original attributes are listed and reject writeback unless the caller explicitly requests `unsupportedAttributes:'drop'`. Double metadata is currently readable but cannot be written through the Python binding without an explicit drop; it is never silently converted to FLOAT. This is not a bit-identical whole-file archive rewriter. Unrecognized/flat/tiled-mip profiles reject explicitly rather than silently flattening/selecting another level. No original-output overwrite is implicit.

GPU extraction supports `representation:'bits'` (exact UInt32 / Half16 bits / Float32 bits in u32 storage) and `'numeric'` (Float32 conversion for Half, original float or uint). The output descriptor retains source type and representation. Zero logical samples return `buffer:null`. Results are lease-owned; foreign results reject and release/dispose are idempotent. Image working storage follows the existing F32 allocation contract even for explicit RGBA16F publication.

GPU flatten v1 requires an explicit **surface-point** mapping of RGB, Alpha and front depth, with scene-linear color and straight/premultiplied Alpha. Original RGB may be negative/HDR; Alpha must be finite [0,1]. Stable front-to-back order is computed once at admission. Straight RGB is multiplied by Alpha on the GPU; source-over retains HDR/negative values without a display transform. Embedded Frameweave color/Alpha and chromaticities cannot be contradicted by the declaration. A supplied/standard ZBack must equal Z. Finite depth intervals require a future volume-aware Deep compositing contract and explicitly reject here. Raw I/O still preserves those interval channels.

`window:'data'` creates the cropped pixel image; `'display'` places it at its true offset in the display window, with transparent pixels outside the data window. When scaling a small data-window image into a larger composition, declare the Stage's logical width/height to match that image; the compositor deliberately respects logical Stage dimensions. Output format is an explicit RGBA16F/32F choice. Multi-image depth interleaving, volume/holdout semantics and mip deep tiles are not implemented by this surface-point checkpoint.

## Validation

`node modules/deep-exr/run.mjs <name> <Node arguments...>` records the single campaign, including all failed attempts/builds/install checks. Independent official OpenEXR/NumPy fixtures cover mixed channel types (including exact high UInt IDs and Half NaN payload bits), None/RLE/ZIPS, scanline/tile/multipart, negative/cropped windows, empty samples, typed writeback, malformed files, budgets and cancellation. Real TSX/R1 tests cover F16/F32, display placement, random/repeated frames, GPU extraction, resource/package tampering, restore from an explicit copied local catalog, and Capsule/directory execution after original source/project/catalog paths are unavailable. Real PNG/FLOAT EXR/decoded MP4 are retained; video additionally requires visible non-black content.

The measured workload `deep-two-samples-v1` uses an actual 1080p Deep file with 4,147,200 samples, varying real Layer opacity and new frame IDs. Timing runs from submission to GPU completion through JS/Node, flatten and compositor. It excludes scanout, materialization and encoding; the numerical readback occurs afterwards. The first frame includes asset admission/upload. Exact raw timings and environment are in validation evidence; no repeated-frame cache hit is advertised as new-frame FPS. It is not a 4K/volume benchmark or an AE comparison. Main owns final catalog identity/SDK Pin, whole-repository and independent installed-engine verification.
