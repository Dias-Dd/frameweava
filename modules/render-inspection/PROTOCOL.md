# Render Inspection JSON v1

Runtime types are in `types.ts`. This is a tool-result version, not a new TVG/P4/data schema. Core EngineError codes are retained. Expected failures return `ok:false`; independent pixel helpers throw existing-style EngineError for invalid inputs, and the CLI converts them to the common diagnostic envelope.

## Check result

```json
{
  "schemaVersion": 1,
  "kind": "frameweave.render-inspection",
  "ok": false,
  "project": "<absolute entry path>",
  "diagnostics": [{"code":"E_RESOURCE_MISSING","severity":"error","source":"resource","message":"...","path":"<actual resource path>"}],
  "suggestedActions": ["Check the declared Resource path relative to the project entry and restore the missing local file."],
  "frames": [],
  "images": [],
  "rendered": false,
  "reportFile": "<new inspection directory>/inspection.json"
}
```

The actual result also contains `policy`, `anomalies` and, only after compilation/validation succeeds, `summary`. Inspection `ok` means no error diagnostics; warnings do not fail it. `rendered:true` records an attempted frame-execution phase; only individual successful records have images. Build-only inspection is not a proof of rendered correctness or backend availability. A failed build can short-circuit later checks; it is not an exhaustive diagnosis of every bad file.

`summary` contains the build hash, existing TVG schema version, composition dimensions/FPS/duration, Stage engines/edges/output names, resource/module/plugin summaries and capability evidence. It omits node trees, Stage props, source text and live runtime objects. Resource SHA-256/bytes describe the **built, served asset bytes**, while `source` attributes the declared input; SVG/glTF processing can change bytes from their source file. Module identity is the existing R1 exact reference, `sha256-…` integrity and trusted-source record.

Diagnostics preserve code, severity, message, Stage ID, frame and hint when present. Known TypeScript/esbuild locations are retained; runtime locations fall back to an existing Stage entry or project file. Virtual engine entries are not invented as filesystem paths. Details/Surface buffers/logs are not dumped. Suggested actions come from reviewed code-specific rules or existing hints; no generic auto-fix command is fabricated.

Each frame record contains request `index`, resolved composition `frame` and seconds `time`, optional Stage ID, `ok`, diagnostics, cache evidence, optional image and Stage-reported backends. `backend` records the actual Renderer service, composition versus Stage-surface capture, requested GPU policy, and engine labels of Stages whose outputs were returned for that frame. It does not claim a probed GPU device. Failed requests have no image. Successful frames have an allowlisted `ImageReference`:

```json
{"id":"frame-000-12","uri":"inspection-image:frame-000-12","file":"images/frame-000-12.png","mime":"image/png","sha256":"<64 lowercase hex>","rgbaSha256":"<64 lowercase hex>","bytes":1234,"width":160,"height":90}
```

The URI is resolved **within a chosen inspection directory**, not a global resource registry. The resolver returns actual PNG bytes and a multimodal image-content block. File names, hashes and successful fetches alone do not establish that a model visually inspected the image.

## Comparisons

`frameweave.inspection-comparison` contains `before`, `after`, `pairs`, generated `images`, `anomalies`, diagnostics, actions and report path. `status` is `match`, `different`, `needs-review` or `invalid`. Missing requests, failed renders and recovered baseline errors are explicit; missing baseline pixels are never replaced with invented black images. Duplicate occurrences are paired deterministically by frame/Stage/occurrence.

Each available pair contains a `frameweave.image-comparison`:

- Decode to orientation-corrected sRGB RGBA8; compare **decoded channels**, not PNG bytes.
- Different dimensions produce `dimension-mismatch`, without implicit resize or fabricated metrics.
- `maxChannelDifference`: maximum absolute channel error, 0..255. `mae`: sum of RGBA absolute differences divided by 4×pixel count.
- `changedPixels`: any nonzero channel difference. `outsideTolerancePixels`: any channel exceeds `maxChannelDifference` tolerance.
- `alpha`: changed pixel count, maximum difference and MAE over Alpha only.
- `black` / `white`: RGB comparison after straight-alpha compositing on each background. Fully transparent RGB can differ while both composites remain equal.
- Default PNG tolerances are all zero. All of maximum RGBA difference, RGBA MAE and maximum Alpha difference must satisfy their individual thresholds. CLI flags: `--max-diff`, `--mae`, `--alpha-diff`.
- Heatmap red is maximum RGBA error; blue is Alpha error; opaque black means no difference. Four additional actual PNGs show before/after on black/white. Colors are technical differences, not aesthetic grades.

Different recorded policies require `allowPolicyDifference:true` **and an explicit tolerance** to produce a pass. GPU-auto comparisons require an explicit tolerance even if policy records are equal, because the device is not probed. Otherwise metrics remain available with `needs-review` and warning `W_COMPARE_POLICY`; backend float differences are not automatically called severe bugs. Cache on/off does not itself change the visual-policy key.

JPEG inputs require `allowLossy:true` plus explicit tolerance, use `lossy-decoded-rgba8-srgb` and retain their real source format. MP4 is not accepted as a still/PNG baseline; use the existing `probe` command to validate video and explicitly extract a still before image comparison. No JPEG/MP4 compressed-byte equality is asserted. The real example separately encodes and fully decodes its MP4.

## Iterations, errors and adapter boundary

`frameweave.inspection-iteration` contains the next inspection, optional comparison, iteration/remaining budget and diagnostics. Its `ok` describes the newest inspection, not automatic acceptance of changed pixels. Each call performs one check; source edits happen outside the service. Persistent session state is versioned, scoped to one project, locked during use, and limited to 1..5 checks. An exhausted/raised budget fails with `E_INSPECTION_BUDGET`.

CLI parsing/unsupported media/resource-delivery errors use `frameweave.inspection-error` with the same `schemaVersion`, `ok:false`, diagnostics and suggested actions. Existing codes are reused where possible; tool-specific codes use `E_INSPECTION_*`, comparison-media misuse uses `E_COMPARE_MEDIA`. Image-response kind is `frameweave.inspection-image`, with its reference and standard `{type:"image", mimeType:"image/png", data:"<base64>"}` content. The HTTP adapter has no HTML or arbitrary filesystem route.

This protocol defines no Module Registry, AnalysisTask format, MCP permission system or automatic source-writing capability. ACL-1/2 and future MCP adapters can retain the common envelope and existing Diagnostic fields, call the shared service directly, and deliver image blocks through their own authorized transport.
