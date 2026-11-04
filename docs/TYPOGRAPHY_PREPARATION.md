# Typography preparation SDK

The public Node entry is @frameweave/engine/typography/node. Its createTypography function connects the frozen font-color, contextual text-lines and pathops Kits to the existing layoutParagraph/createParagraphIndex/prepareParagraphMeshes algorithms. It starts no GPU or browser. The Stage-safe entry @frameweave/engine/typography exposes the existing paragraph renderer and related low-level adapters/types.

```ts
import {createTypography} from '@frameweave/engine/typography/node';
const provider = await createTypography({
  allowWasm: true,
  coordinates: {spaceId:'caption', unit:'px', origin:'top-left', x:'right', y:'down', width:1920, height:1080},
  fonts: [{id:'body', path:'./assets/font.ttf', faceIndex:0}]
});
try {
  const geometry = await provider.prepareParagraph('Your text', {
    font:'body', width:1760, fontSize:64, x:80, baseline:960,
    wrap:'word', overflow:'error', missingGlyph:'error'
  });
  // Persist geometry as JSON or retain it for the caller's cue/asset cache.
} finally {
  await provider.dispose();
}
```

Font input is either an explicit local path (optional expected SHA256), byte data plus an exact font ResourceReference (SHA256/byte count), or an explicitly borrowed InspectedFont. Paths do not trigger OS font lookup or downloads. Byte sources/coordinates/variations are snapshotted before initialization. Actual source identity, face and normalized instance metadata remain in the prepared data. With several fonts choose font explicitly; fontForRun maps the original TextItem to a declared ID, and scriptForRun retains the original paragraph contract. There is no guessed multilingual font fallback.

prepareParagraph retains the existing paragraph fields, including lineHeight, align/baseDirection, language/features, wrap/overflow, tabs, soft breaks and signal; tolerance/gridSize are the original tessellation controls. Full source layout/index/meshes are returned without inventing a new TVG or image format. The high-level preparation call is horizontal outline paragraph preparation. Existing color, embedded bitmap/SVG and vertical-specific workflows retain their own original contracts; this convenience call does not automatically paint or rewrite those formats. Existing variable-font numerical qualifications remain unchanged.

Calls on one provider are serial; concurrent preparation reports E_TYPOGRAPHY_BUSY. Each owned font and the itemizer/path client initializes once. The provider has no unbounded implicit cue cache; reuse results in the creator's explicit asset/cue cache. dispose is idempotent and drains pending work before closing all owned clients. Borrowed fonts/providers must not be closed by the borrower. Active cancellation latches failed clients and requires reopening; an already-aborted request before work starts publishes nothing.

## Trust and packaging

WASM requires explicit allowWasm:true. These are fixed SDK Kits, not arbitrary executable plugin roots: every code/resource byte is checked against the SDK Kit lock, whose digest is compiled into the loader. Execution uses captured verified JS bytes and the original wasm-bindgen data profile/ModuleLoader contract with worker:false. The loader accepts no WASI/host imports or selectable private Kit directories. This is trusted SDK code, not a sandbox for arbitrary executable code or a promise of hostile-font fuzz qualification. Native/Audio Stage bundles continue rejecting Node IO imports. Existing R1 trust/lock/permission checks remain in place.

Kits and their original notices/licenses ship under modules/pro-animation/typography-kits. They are included by the existing engine distribution source/data traversal; no ignored .frameweave cache or tests/helpers is needed at runtime. New Native managed function/type exports are in immutable pro-animation-native@0.2.3; the failed intermediate0.2.2 snapshot is retained rather than overwritten. SDK Runtime Pin changes are intentional; no historical project lock is automatically rewritten.

A separate frozen @frameweave/typography-preparation@0.1.1 ESM/types/Kit delivery is available for downstream isolated preparation validation. It contains the same Node implementation, has no engine CLI/Renderer, and must not replace a complete engine installation. The complete engine npm release remains a separate qualification pending the matching owner release checkpoint.

## Reproduction

node scripts/verify-typography-provider.mjs build / drop / quick / real / portable / finish / audit. Keep the cumulative artifacts/main-typography-provider/campaign.json ledger; do not erase failures to reset its419-second budget. The Node consumer uses a fresh npm install outside the repo, with Main filesystem access/Worker/child-process creation denied during preparation. Its type validation and Kit/lock tamper rejections are separate checks. See examples/typography and docs/main-typography-provider for actual evidence and remaining limits.
