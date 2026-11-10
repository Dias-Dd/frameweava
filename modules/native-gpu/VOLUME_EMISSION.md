# Native volume emission v1

`SceneVolume.emission` is an optional Native scene extension. It adds no P4
port, TVG node, device, execution host or runtime permission. Missing emission
retains the previous 16-word volume table and generated path shader exactly.
An opt-in scene uses private volume-table version 3 (28 words/record); the SDK
and its generated shader carry that layout together. SDK identity checks remain
mandatory; existing exported projects and historical locks are not refreshed.

```ts
const plume: SceneVolume = {
  bounds: {min: [-2, -2, 0], max: [2, 2, 12]},
  extinction: 0, albedo: [0, 0, 0],
  emission: {
    coefficient: [3, 8, 18],
    density: {version: 1, dimensions: [32, 32, 96], maximum: 1, gpu: plumeField},
    samples: 16,
  },
};
```

`coefficient` is isotropic **scene-linear Rec.709 radiance per world meter**,
nominally W m^-3 sr^-1 under the renderer's exposure convention. It is the
source term j, independently authored; it is not a surface radiance or an
absorption-normalized Le. Nonnegative finite F32 HDR channels are accepted.
Zero extinction is valid and does not extinguish the emission.

The emission density is a separate dimensionless multiplier, default one. It
does not implicitly multiply the scattering/extinction density. Both reuse
`SceneDensityGrid` v1: complete static or same-owner GPU scalar fields, explicit
maximum, existing frame arena and disposal. A factory shared by either role or
several volumes runs once per scene sample. Producer shape/ownership failures
propagate through existing exceptions/cleanup. Out-of-range dynamic numeric
values use the existing invalid-medium shader marker, without introducing a
CPU validation readback or a new host wait.

Homogeneous emission uses an exact segment integral. Gridded emission uses the
requested stratified samples (default 8); this is a configurable quality/cost
choice, not an engine-wide work ceiling. Counts must fit u32; complete tables
and fields must fit caller/device addressing and byte budgets.

The integrator adds the source only up to the first surface or real medium
collision. The existing free-flight survival already estimates participating
medium transmittance; applying a second medium-beam factor would attenuate it
twice. Absorption inside solid dielectrics remains a separate Beer factor along
each emission sample. Primary visible emission enters Emission AOV; paths that
have scattered retain their existing Diffuse/Specular/Transmission/Volume
partition. Volume emission does not invent geometric Depth/Normal/Motion guides.

Media can illuminate/reflect in actual geometry through the existing BSDF paths.
There is currently **no dedicated volume-light importance sampler**; small bright
sources may converge slowly. This is RGB transport, not a combustion solver,
thermal-equilibrium assumption, spectral plasma or full atmospheric simulation.

The derivation follows the radiative-transfer source integral described in
[PBRT](https://www.pbr-book.org/4ed/Light_Transport_II_Volume_Rendering/The_Equation_of_Transfer).
The independent j unit convention is consistent with the
[MaterialX physical model](https://github.com/AcademySoftwareFoundation/MaterialX/blob/main/documents/Specification/MaterialX.PBRSpec.md).
Implementation and tests are original; no upstream implementation is copied.

`tests/native-scene-emission.test.ts` checks pure emission, HDR, absorption,
independent static/GPU grids, opaque occlusion, overlapping media, solid-glass
attenuation, real mirror reflection, independent cosine-hemisphere diffuse GI,
raw AOV sums, explicit-zero compatibility and repeated/random frame identity.
Hardware verification currently covers Windows x64 / Vulkan / RTX 5070 Laptop.
