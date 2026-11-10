# Sample-matched path denoise features v1

`createNativePathTracer(init, scene, {aovs:true, denoiseFeatures:true})`
additionally publishes `path-denoise-features`. This is opt-in and does not
filter or change Beauty. Existing `path-guide`, depth, IDs and motion remain
center-primary, with their existing layout and meaning.

The new publication uses the existing Native data-export contract:

- `f32`, dimensions `[width,height,2]`, three components, generic data.
- Plane 0: pixel-major RGB albedo in scene-linear Rec.709, offset 0.
- Plane 1: pixel-major XYZ world shading normal, offset `width*height*3` words.
- Metadata profile `path-denoise-features-v1`; sample count and sampling policy
  are explicit. Byte length is `width*height*6*4`.
- Both planes average the exact first camera geometry queries used by Beauty, including
  jitter, thin lens, shutter pose, alpha-coverage decisions, UVs, vertex color,
  normal maps and current object transforms. Averaged normals are not
  renormalized. Misses contribute zero.
- These describe the first solid geometry intersection, not a volume
  scattering event or a recursively reflected/refracted feature layer.
- Feature reflectance is bounded to `[0,1]`. Refractive/transmissive surfaces
  use a white first-hit fallback, as do pure emissive surfaces. This feature
  representation does **not** clamp radiance, signed RGB, HDR, Alpha or AOVs.
  It does not recursively estimate reflection/refraction feature layers.

Storage belongs to the existing frame arena/device owner. The ordinary
publication/readback/retirement rules apply; no new device, Host, memory pointer
or cross-Stage handle is exposed. Extra allocation and dispatch occur only when
requested. It does not alter P4, TVG, Stage ordering or permissions. Existing
SDK locks continue to require explicit reviewed rebinding after integration.

The shot's optional OIDN adapter converts albedo to the same ACEScg space as
its Beauty. Raw Monte Carlo guides use `cleanAux=false`; the final shot profile
prefilters the two auxiliaries with OIDN before using `cleanAux=true`.
Beauty-only remains the default of that adapter. The feature profile extends
image edges before filtering; it preserves the original dimensions and Alpha.
OIDN is an external, explicitly pinned finishing dependency, not an implicit
engine-wide denoiser. Its required feature ranges and camera-sample averaging
follow [OIDN's RT documentation](https://www.openimagedenoise.org/documentation.html#rt).

`tests/native-path-denoise-features.test.ts` compares feature RGB with raw
unlit Beauty and independently counted Cryptomatte camera coverage for jitter,
lens, shutter and their combination. It also exercises both atlas storage
representations, normal maps, emissive/glass fallbacks, signed/HDR radiance and
random/repeated access. The optional computation must preserve every Beauty
byte. Qualified hardware is Windows x64, Vulkan, RTX 5070 Laptop; no Linux,
macOS, AMD or Intel validation is implied.
