# AE/source coverage audit

This directory is an offline, read-only source audit except for its own generated
JSON. It is not a module registry, runtime eligibility API or installed-capability
claim. It does not modify package identity, locks, trust, source projects or GPU
behavior.

Run from this worktree:

```sh
node --import tsx modules/native-effects/coverage/parameter-index.ts
node --import tsx modules/native-effects/coverage/update-crosswalk.ts
```

`adobe-effects.json` contains factual names/categories from the official
[effect table](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/effects-and-animation-presets/effect-list.html),
with source lines and retrieval metadata. The 2026-11-03 correction distinguishes
the Immersive Video category from its first effect, VR Blur. Adobe's GPU/depth
support columns are not evidence about Frameweave.

`PARAMETER_INDEX.json` uses the existing TypeScript checker to list declared
methods, named functions and typed callable exports, including inherited option
fields, resolved generic options and source hashes/locations. Counts include
factories, pure control helpers and duplicate declarations; they are **not effect
counts**. This index does not infer defaults, numeric ranges, color/Alpha behavior,
algorithm quality or Adobe parameter equivalence from a type signature.

`AE_CROSSWALK.json` retains every official row. It includes the actual professional
foundation library and Native time/motion/transitions, which the first scan
missed. Standing ownership is explicit: Agent-2 owns time/text/animation; Agent-4
owns simulation/Puppet/spatial systems; Agent-3 owns image/filter/optics/color/matte/
keying/compositing. This ownership does not imply those other modules passed any
new qualification here. Proprietary format import and automatic upstream temporal
sampling remain the user's existing exclusions.

Candidate matches are **navigation hints**. For example, having an envelope warp
does not prove every AE Warp preset, a light generator does not prove all Advanced
Lightning controls, and ordinary blur does not implement spherical VR filtering.
Likewise, compiled factories do not prove installed R1/portable availability.
Every row remains unproven until behavior, controls and corresponding real
execution evidence have been reviewed. Missing candidates are source-index gaps,
not an automatic count of missing algorithms; alternate compositions and other
owners must be checked.

The final acceptance status stays in `../COMPLETION.json`. Public integration
requirements in `PUBLIC_INTEGRATION.json` target Main-owned files and are proposals
only; this audit never executes their generator or refreshes immutable versions.
