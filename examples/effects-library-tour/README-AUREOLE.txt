AUREOLE / ORBITAL ENGINE
=======================
Real 3D animation: 1920×1080, 30000/1001 FPS, 240 frames, 8.008 seconds.
Actual H.264 MP4 with 48 kHz stereo AAC audio has been rendered and fully decoded.

Editable project
----------------
aureole-3d-1080p.tsx : geometry, GPU animation/lighting, camera, effects and Layer.
aureole-score.ts    : isolated deterministic Audio Stage and original score.
run-aureole.ps1     : local-runtime configuration and source CLI entry.

In the repository root:
  ./examples/effects-library-tour/run-aureole.ps1
  ./examples/effects-library-tour/run-aureole.ps1 -Render

Equivalent render command after configuring FRAMEWEAVE_SERVO_RUNTIME:
  npm run frameweave -- render examples/effects-library-tour/aureole-3d-1080p.tsx --memory-mib 4096 --max-concurrency 1 --output artifacts/aureole-3d/Aureole-3D-1080p.mp4

If the example-local exact R1 package store has not been prepared:
  node --import tsx examples/effects-library-tour/prepare.mjs

Scene and implementation
------------------------
185 geometry components / 16116 triangles / 48348 non-indexed vertices:
  1 deforming torus knot, 4 independently precessing rings, 48 orbital markers,
  14 orbiting satellites, 64 luminous 3D particles, a two-level pedestal and rim,
  a ground surface and 50 actual 3D grid strips.
All are combined into one Native mesh draw, sharing the same hardware depth
buffer. Satellites, rings, knot and platform therefore occlude one another.
The perspective camera orbits approximately 78 degrees, with elevation/distance motion.
The center deforms on GPU; its twist and wave normals use the deformation Jacobian.
Vertex lighting uses world normals, directional diffuse/fill, view-dependent
specular and rim terms sampled through a small scene-linear floating color atlas.
This is deliberately stylized lighting, not a PBR environment/reflection,
ray-tracing, shadow-map or physical simulation claim.

Three.js provides primitive geometry and camera/matrix mathematics. The existing
Native GPU owner does all compute, mesh rasterization and image processing.
This does not claim that Three.js WebGLRenderer is integrated into Servo.
One ordinary Servo effect module generates only the transparent typography.
Existing R1 native-image-effects@0.4.0 supplies Gaussian softening, Glow,
brightness/contrast, vignette and compositing on the same Stage image contract.
No external models, images, downloaded fonts or sampled music are required.

Editing
-------
Main ART sets output dimensions, FPS, duration and seed. Native renderAt controls
the camera. Geometry constructors control ring dimensions, satellites and parts.
The compute kernel controls motion and lighting; the color-atlas kernel controls
materials. These are editable shot code, not modifications of the engine.
Main SOUND.volume is the audio Layer master gain. Other sound levels and notes
are configured in aureole-score.ts; update that file's duration metadata if you
change the composition length. Native preview currently plays no audio device;
listen to the exported MP4 in a media player.

Verification and limits
-----------------------
Evidence: artifacts/aureole-3d/verification.json, geometry-inventory.json,
ffprobe.json, render-result.json and storyboard.png (decoded MP4 frames).
Final video: 240 frames at 1920×1080, 30000/1001 FPS, 8.008 s.
Audio: 384384 generated samples; AAC decode has 385024 including codec padding.
Decoded PCM is finite, peak 0.169091, RMS 0.022276; no listening-review claim.
Encoded frames 20/70/130/205 were opened and visually inspected for motion states,
composition, depth overlaps and platform boundaries.

The first mixed-source export was rejected during audio evaluation with
E_AUDIO_CLOCK. Its original record is retained as render-attempt-1.json.
Moving the score into an explicit independent Audio Stage entry fixed this
project's export without relaxing clock/permission protections or changing Core.
Initial visual frame: 17.415 s; failed export including compilation: 16.724 s;
final export including compilation: 24.810 s; final decode/extraction: 2.238 s.
Driver-measured total including failure is approximately 61.2 s; metadata inventory
takes a further fraction of a second. No full-repository/portable/cross-platform
qualification was run. Only Windows/NVIDIA/local Servo runtime was exercised.
The video is SDR; F32 intermediate processing is not a claim of HDR10 delivery.
No engine sources, package locks, SDK pins or other worktrees were modified.
