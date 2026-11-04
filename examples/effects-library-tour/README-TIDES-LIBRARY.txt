TIDES / LIBRARY EDITION
======================
Entry: tides-library-1080p-2997.tsx
1920 x 1080 / 30000:1001 FPS / 1798 frames / 59.9932666667 s.
Original synthesized 48 kHz stereo score is included through Audio Stage + Layer.
The previous tides-1080p-2997.tsx is preserved for comparison.

This variant delegates the main moving images to existing libraries. Its only
custom WGSL is the original monoline typography, editorial rules and final fade.
Ribbon control geometry, shot layout and soundtrack remain editable TS code.
No Servo, external fonts, downloaded pictures, sampled music or network loads.

Visual sequence
---------------
TIDES: gold ribbon rings with jade echoes, shaped by subtle twist and waves.
DRIFT: vertex-corresponding Morph opens the rings into long bending ribbons.
ORBIT: inclined, rotating rings; particles spiral through the composition.
BLOOM: a petal Morph target with ripple, warm material and a particle burst.
CURRENT: wider flowing ribbons, waves, taper and a staggered three-card transition.
STILL: smaller geometry, sparse light, a slow final fade with the score.
Native fBm/domain-warped mist, a restrained grade and coherent particles connect
the shots. Two silhouettes are rendered only during transition windows.

Existing functions actually called in the source
-----------------------------------------------
Spatial source entry (modules/spatial-effects/native.ts):
  createNativeNoiseTextureRenderer + render:
    OpenSimplex2, 4-octave fBm, 2-octave progressive domain warp, time-domain motion.
  createFeedbackParticles + sample:
    seeded births, vortex/attraction/drag, bursts, trails, bounded checkpoints.
  createNativeParticleRenderer + render:
    per-life opacity, radius and color curves, same-Stage background composition.

Mesh-deformation source entry (modules/mesh-deformation/index.ts):
  morphPositions, twistPositions, bendPositions, wavePositions, ripplePositions,
  taperPositions, transformPositions.
  Ring/stream/petal targets have identical vertex order and index topology.

Animation source entry (modules/pro-animation/src/native-transitions/index.ts):
  crossDissolve, irisWipe, lightWipe, cardFlipWipe (mesh), rippleTransition.
  Each is used at a different chapter boundary, with explicit progress.

Installed R1 native-image-effects@0.4.0:
  processImage recipes:
    fourColorGradient, gradientMap, radialGradient, lighten, reliefLighting,
    brightnessContrast, colorBalance, vibrance, photoFilter, vignette, filmGrain.
  processRaster recipes:
    screen, over, flattenBlack, exposure.
  processPa recipes:
    displacement (bilinear), blur (Gaussian), glow.

Thirty distinct named processing methods above, plus the noise and particle
systems. This is a count of calls/contracts, not thirty independent algorithms
or thirty newly implemented functions. Creation/lifecycle wrappers are not added
to that count. Ordinary mesh rasterization uses the existing Native GPU owner.
Three.js is used for camera matrices, not a second rendering backend.

Commands (run from the frameweave-engine repository root)
------------------------------------------------------
If the sibling R1 store has not been prepared yet:
  node --import tsx examples/effects-library-tour/prepare.mjs

Visual preview:
  npm run frameweave -- examples/effects-library-tour/tides-library-1080p-2997.tsx --memory-mib 4096

Complete MP4 with AAC soundtrack:
  npm run frameweave -- render examples/effects-library-tour/tides-library-1080p-2997.tsx --memory-mib 4096 --max-concurrency 1 --output artifacts/tides-library/Tides-Library-1080p-2997.mp4

Optional single frame:
  npm run frameweave -- frame examples/effects-library-tour/tides-library-1080p-2997.tsx --frame 1050 --memory-mib 4096 --output artifacts/tides-library/bloom.png

Optional six-shot storyboard:
  npm run frameweave -- storyboard examples/effects-library-tour/tides-library-1080p-2997.tsx --frames 150,450,750,1050,1350,1650 --memory-mib 4096 --output artifacts/tides-library/storyboard.png

Run commands for this same entry sequentially to avoid the existing Main
same-entry compiler-directory race. Preview does not currently play Audio Stage
output to a sound device; listen to the exported MP4 in a media player.

Editing and boundaries
----------------------
ART controls output dimensions, key palette accents and Glow.
SOUND controls the score, with its master volume on the ordinary audio Layer.
shots controls each silhouette; cards controls typography; harmony/motifs controls
the score. Background colors and processing recipes are explicit in renderAt.
Pixel-valued processing radii scale with output height relative to 1080p.
All image processing remains scene-linear F32; the ordinary MP4 delivery is SDR.
No claim of HDR10 delivery or real-time preview performance is made.
Particle simulation uses the existing fixed-step replay/checkpoint contract;
noise, geometry and audio use absolute time/sample coordinates. Recording promises
are not GPU fences. Per-frame owned resources use the existing resource arena.

The image package is the existing exact R1 version and sibling lock. Other Native
libraries are explicit repository source imports: they are not represented as
newly installed managed exports of older Web-only package versions. This TSX is
editable in this checkout; it is not an already bundled portable export.

Delivery status
---------------
At the user's request, no tests, TypeScript check, shader compile, preview,
render, listening, numerical comparison or performance measurement was run.
Only source inspection and file authoring were performed. The resulting visual
quality, resource admission and runtime behavior are therefore unverified.
No engine code, package manifests/locks, Runtime Pins or other worktrees changed.
