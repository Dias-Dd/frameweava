# Explicit GPU display preview

`scope.present(image,{profile:'aces2-sdr100-v1',clip:true})` is an opt-in display
path on the existing resident scope. It accepts same-size scene-linear ACEScg
images and returns the existing owner's Canvas2D and a versioned display report.
It does NOT return an HDR Surface, replace `readback`, change an existing scene's
default output, choose another color profile or authorize anything new.

```ts
const display = await scope.present(finalResidentImage, {
  profile: 'aces2-sdr100-v1', clip: true,
});
display.canvas.style.display = 'block';
init.container.replaceChildren(display.canvas);
// End the source lease explicitly when no longer needed.
await scope.release(finalResidentImage);
```

`examples/resident-preview.tsx` and `resident-preview-stage.ts` demonstrate an
entire source→Blur→Glow→Over→ACES2 display on one GPU owner. The matching accurate
professional example remains `examples/resident-accurate.tsx`. Ordinary professional
rendering, EXR/HDR output and all prior policies remain unchanged. Installed
module authors still declare normal R1 hardware requirements and choose explicit
preview versus accurate output; this native example uses the existing hardware
preview policy and does not manufacture a trusted package or Final permission.

## Precision and provenance

This is **approximate RGBA8 sRGB display**, not a professional transform or an
exact numerical substitute for CPU OCIO. The fixed transform is ACEScg→
`sRGB - Display` / `ACES 2.0 - SDR 100 nits (Rec.709)`, exported with OCIO2.5.2,
built-in `cg-config-v4.0.0_aces-v2.0_ocio-v2.5`, config SHA256
`24ec81841048fc5db160a7bad882263246183385c5d49d0e86e11464917ead15`.
The manual WGSL port retains original matrix column ordering and fixed table
words. Original GLSL SHA256
`7547de1d204d9388e4c56c455d81a8ba506e7b1046d693452969e1b537fcf606`.
Derived shader/tables carry BSD-3-Clause attribution in
`PIXEL_DISPLAY_LICENSE.txt`; the Frameweave project license does not change.
Evidence includes the original emitted GLSL and export manifest. No downloaded
compiler/transpiler/runtime shader source, dynamic imports, file access or network.

All professional image arithmetic and storage before display stays F32 and is
not mutated. Display unpremultiplication, clipping, byte quantization and browser
Canvas premultiplication are separately qualified against CPU OCIO. Fixed gates:
visible premultiplied contribution error≤2 byte codes; Alpha≤1; opaque RGB≤1.
Those display gates never become professional/HDR arithmetic tolerances.

Qualification uses729 RGB triples from9 HDR/negative values per component,
straight/PM Alpha0,2^-24,.125,.5,1 (8,019 actual samples total), plus full1080p
frame comparisons. Color differences and worst-case errors are reported. This
sample qualification is not a proof for every possible color/device.

Domain is deliberately restricted: finite RGB magnitude≤65504; nonzero RGB
magnitude≥2^-100; Alpha0 or≥2^-24 and≤1, with the usual opaque requirement.
Out-of-domain inputs fail explicitly (`E_GPU_PIXEL_DISPLAY_DOMAIN`), rather than
silently clipping scene values or presenting nonfinite math. Other colors,
sizes and transforms fail preflight (`E_GPU_PIXEL_DISPLAY_POLICY`). Use the
accurate path when the input/profile is outside this display qualification.
After GPU submission, failure latches/invalidates the scope: never automatically
replay changed GPU state on CPU. Dispose/rebuild with existing lifecycle rules.

## Execution, ownership and accounting

Pending producer publications first complete with their existing checks. The
professional image remains GPU resident; only flags cross that barrier. Domain
admission, fixed ACES2 transform and display byte packing run on the SAME device.
A16-byte status ledger is read back before presentation. Invalid producers,
domain/math failures and cancellation cannot publish a new display. Subsequent
Canvas rendering reuses the owner's configured target; its Canvas2D bridge
prevents leaking a WebGPU device through `getConfiguration()`.

The Canvas is borrowed and reused on the next presentation; snapshot bytes if
longer retention is needed. It is not a cross-Stage capability. Do not resize or
reconfigure it; changed dimensions/configuration reject before drawing. Existing
scope byte budgets also include display view16B/px, packed4B/px, tables, uniforms,
status/readback16B. Other image pools and Core storage remain part of the owner
budget. Physical VRAM and system peak remain unknown.

`presentations` counts successful displays. `readbacks`/`readbackBytes` continue
to count professional-image readback only; `validationReadbackBytes` includes
the display ledger. This path reads NO professional float image into CPU.
Existing `timings()` reports recorded pixel/compute passes, not the internal
display transform/presentation; measure the returned operation's host span or
full Renderer request separately. Completion `gpu-ready-only` is not a promise
that the OS has shown a frame. Canvas capture/PNG/composition can still dominate.

## Verification

```
npm run typecheck
node --import tsx --test tests/gpu-pixel-display.test.ts tests/gpu-pixel-display-gpu.test.ts
node --import tsx scripts/performance/gpu-display-metrics.ts <actual-display-test-directory>
node --import tsx scripts/performance/gpu-resident-preview.ts --width 1920 --height 1080 --frames 7 --output artifacts/gpu-resident/preview-<unique-run>
```

Use the existing explicit reviewed `FRAMEWEAVE_MEDIA_PYTHON` environment for CPU
OCIO references. Benchmark uses ABBA accurate/fast/fast/accurate and fresh numbered
frames with caching disabled. It times full PNG completion, records nested host
phases, RSS and power policy, and checks every decoded component after timing.
Do not add nested spans or call query time/full repeated-cache time preview FPS.
Windows/NVIDIA/Chromium tested; other hardware/platforms remain unverified.
