VESPER / THE QUIET BETWEEN
=========================
Editable source: vesper-servo-1080p.tsx
1920×1080 / 30000:1001 FPS / 300 frames / 10.01 seconds, with original stereo audio.

One ordinary Servo module produces Canvas2D artwork and HTML/CSS typography.
It uses the same Native Stage owner and image contract as the existing effects:
  Servo → PA displacement → PA Glow → contrast/vignette/filmGrain → Layer.
No separate browser Stage, rendering framework, GPU owner or special compositor.
An Audio Stage produces 48 kHz PCM; an ordinary audio Layer places the score.
Servo artwork is explicitly SDR8 internally, followed by scene-linear F32 effects.
The delivered H.264/AAC MP4 is SDR, not a claim of lossless HDR typography.

Direction
---------
Deep petrol ink, ivory serif typography, warm gold and restrained jade reflections.
The flower opens while the title enters, the words recede during the close view,
then a second title appears as the form contracts. Seeded dust, irregular notes,
slow metallic reflections and a final fade connect the motion.
Text uses actual local Georgia/Times New Roman fonts, not hand-written glyphs.
All artwork and audio are generated locally; no external images, music or fonts.

Run from the repository root
----------------------------
Preview:
  ./examples/effects-library-tour/run-vesper.ps1
Export:
  ./examples/effects-library-tour/run-vesper.ps1 -Render

The helper uses an already configured FRAMEWEAVE_SERVO_RUNTIME, or the local
reviewed bundle in outputs/main-deliveries. It does not install or download DLLs.
If the sibling image-package store is missing, prepare the existing exact R1 package:
  node --import tsx examples/effects-library-tour/prepare.mjs

Equivalent command after configuring FRAMEWEAVE_SERVO_RUNTIME:
  npm run frameweave -- render examples/effects-library-tour/vesper-servo-1080p.tsx --memory-mib 4096 --max-concurrency 1 --output artifacts/vesper/Vesper-1080p-2997.mp4

Native preview does not play the Audio Stage through a sound device. Listen to
the exported MP4 in a media player. Commands for this same entry must run
sequentially because this Main baseline shares a same-entry compiler directory.

Evidence and scope
------------------
artifacts/vesper/verification.json records final media metadata, decoding and
audio measurements. The storyboard comes from the encoded video.
The first 600-frame/two-instance attempt and the following 300-frame attempt hit
their respective 280 s / 105 s deadlines. Their records are retained separately.
These are deadline cancellations, not proof of a Servo/Layer defect. The initial
description of a first-frame stall was a provisional diagnosis, not established.
The final source uses one instance, 300 frames and ordinary Layer opacity.
No whole-repository suite, library-wide audit, portable export or cross-platform
font identity test is included. No Core changes or worktree synchronization.

Final delivery: PASS for this clip
---------------------------------
Actual H.264 MP4: 1920×1080, 30000/1001 FPS, 300 frames, 10.01 seconds.
Actual AAC track: stereo, 48 kHz; generated PCM has exactly 480480 samples.
The entire video/audio decode completed; decoded PCM is finite, peak 0.214855,
RMS 0.024208. AAC adds a bounded final codec block; decoded count is 481280.
Decoded video frames 60/120/190/255 were extracted and visually inspected.
No claim of listening-based sound review is made.
Final export: 158.992 s with an existing compiled build.
All recorded execution including earlier failed exports and frame builds:
576.922 s; this is not presented as a single all-green test run or a fast suite.
Source SHA256: b4a41fd955c3f340871684e11e221740c93ce8c72eaf655eae9a4867087298de
