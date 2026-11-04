# Sparse scalar volume v1 (candidate)

This optional module reads a single uncompressed, breadth-first NanoVDB32.8.0 Float raw grid, preserving its original tree and all scalar bits. It supports explicit level-set and fog-volume interpretation. It is not a general `.vdb`/compressed `.nvdb` reader, writable sparse simulation, dense conversion, ray integrator or complete fluid engine. SDF and density are distinct; no colour/Alpha metadata or OCIO is applied to these scalar data fields.

## Use and build

```
node modules/sparse-volume/build.mjs
frameweave packages install .frameweave/sparse-volume/package --project <project-directory> --add sparse-volume@0.1.0 --trust local:frameweave.native-media
```

The ID/version/authority are a candidate for Main review, not an installed global catalog entry. Tests use a different fixture identity. Install and trust are the existing R1 operations; discovering a package does not authorize it. Generated `api.d.ts`, extracted from the actual source interfaces, is the public type contract. There is no additional capability registry or invented ACL metadata protocol; ACL discovery/examples qualification remains Main's integration task.

```
import {createVolume} from 'sparse-volume';
// Inside a defineNativeStage initialization, with a declared Resource id="volume":
const volume = await createVolume({
  version: 1, resource: 'volume', bytes: 2452256,
  gridClass: 'level-set', maxRootTiles: 128,
  worldSpace: 'world', worldUnits: 'meter', valueUnits: 'meter'
});
// XYZ field uses i32 / volume.info.indexSpace / voxel, or f32 / world / meter.
const samples = await volume.sampleWorldNearest(worldXYZ);
// Consume samples.values and samples.metadata through existing GPU compute/pixel APIs.
await volume.releaseSamples(samples); // after recording all GPU consumers
await volume.dispose();
```

Editable slice demonstration: `examples/native-sparse-volume/project.tsx`. It generates XYZ and shades entirely on the GPU using the same native owner. Its local-source import is for development; the R1 test uses the installed managed named import and never constructs an additional Host. The sample is a slice, not volumetric light transport.

`sampleIndex` consumes i32 XYZ. `sampleWorldNearest` consumes f32 XYZ, applies the raw grid's F32 inverse affine map, then `floor(index+.5)` (ties toward positive infinity). F32 coordinate precision is inherent; large world coordinates and positions near voxel boundaries can differ from a double-precision query. CPU acceptance uses the actual upstream F32 map for this API. Coordinate space/units must match the volume explicitly. Values keep the scalar Float type and user-declared units. Metadata has u32 channels active / tree-level / root-probes / status: levels0/1/2/3/4 mean leaf/lower/upper/root/background; status0 is valid,1 invalid world coordinate,2 invalid exhausted index search. Missing sparse data is valid background with active0; it is distinct from an invalid query. Fog Float values are preserved, including negative/HDR values; interpreting them physically is the caller's choice.

## Admission and memory

The fixed Resource profile is `nanovdb-float-indexed-v1`; only the existing Node Resource adapter chooses this reviewed codec, never an authored callback. Exact declared Resource identity and compiled seal authorize bytes. An original snapshot is verified once. The parser validates version/type/class, full 64-bit relative pointer ranges/alignment/node arrays/counts/layers/reachability, finite scalar values and affine map/inverse consistency, with bounded node reads. It preserves original NanoVDB checksum bytes; it does not pretend to implement every upstream checksum/statistics validator. Reference fixtures separately pass upstream Full validation. Blind payloads, non-breadth-first layouts, other grid types and container/compression are explicitly rejected.

A deterministic sparse Root hash index is appended after the unchanged original bytes; the GPU probes that index and then traverses the original upper/lower/leaf. Full keys and original tile references are stored, so legal key0, negative coordinates, constant tiles, background and active masks remain distinct. Collisions are handled by linear probing; search terminates on a real empty slot or actual capacity, and exhaustion is an error status rather than silent background. This is expected/measured hash behavior, not a worst-case O(1) guarantee. CPU construction periodically yields for cancellation; GPU work uses existing owner cancellation/completion, not kernel preemption.

`maxRootTiles` is a caller-adjustable planning budget, not a permanent format/device capacity. This first profile reserves `capacity=nextPow2(2*maxRootTiles)` entries, each16bytes, plus32bytes of header after 32-byte alignment. Reported `sourceBytes`/true original `byteLength` differ from derived `storageByteLength`. Metadata reports actual used/unused entry bytes, planned parser workspace and successful probe distributions. The fresh SDF reference reserves4128 index bytes for8 roots; the forced-collision fog reference uses19 roots and exercises17 probes. A future layout can compact to actual count under a new explicit layout version. All arithmetic is checked wide before allocation; u32-address overflow and actual owner storage/binding/budget limits reject explicitly. Today's GPU limits are not hardcoded as future engine limits.

The derived identity includes build seal/source hash, original length/whole-grid selection, codec/layout version, class and root budget. Its private raw lease describes actual derived bytes; the original raw-bytes-v1 snapshot stays separate and unchanged. Read-only binding checks remain native-owner enforced; R1 borrowed scope tracks the returned buffer and cannot release another lease's allocation. No per-frame file hash, format scan, numeric readback, CPU sampling or root-index reconstruction is added. Admission does use file I/O, CPU parsing/index construction and one GPU upload, not zero-copy. Explicit numerical exports are separately counted readbacks.

Call `releaseSamples` after recording consumers, and `dispose` on the volume at Stage disposal. Repeated release/dispose is safe; foreign sample results are rejected. Compiled kernels belong to the existing Stage cache. Owner/Stage cleanup retains in-flight commands to completion and closes private snapshots. Module initialization/disposal uses existing managed R1 lifecycle and a borrowed GPU scope.

## Evidence and limits

Fresh strict-float C++ upstream fixtures: SDF9261 points and fog68 points, with constant tiles at every level, negative coordinates, key0, background/active distinctions, nonuniform reflected/sheared world transform and forced collisions. Actual GPU index/world values and active states match the independent accessor exactly on these fixtures. World NaN/out-of-range and valid i32-min background are tested separately. R1 installation/exact locking/cross-project restore, source catalog absent, random/repeated TSX frames, original-unavailable Capsule and installed-byte tamper rejection are covered. PNG/F32 EXR/decodable MP4 preserve the expected negative/HDR/Alpha values. Raw-binary regression remains separate.

Fixed authored slice performance-v1 (RTX5070 Laptop, Windows11, driver596.49, production-feature debug owner; new frame IDs, GPU XYZ+world lookup+shade+composite+completion): 1080p24 samples median35.278ms/P9538.103ms; 4K16 samples median45.991ms/P9551.399ms. This includes JS/Node coordination and excludes scanout/materialization/encoding. It is not10ms, an AE comparison or a claim about all effect workloads. Summary definition2 corrects the initial upper-middle reporting for even N using the same original raw samples, without changing workload-v1 or timings. Logical GPU allocations are in the logs; physical peak/vendor overhead are unknown. Do not compare this new workload to old unrelated frame benchmarks.

Main owns final identity/catalog, SDK Runtime Pin, independent packaged-engine installation and remaining export combinations. Other GPUs/OS, arbitrary production VDBs/large-asset throughput, hostile-input fuzzing and general EXR/Deep integration are not qualified by this checkpoint. No NVIDIA SDK binary is shipped. Apache-2.0 provenance and notice are included.
