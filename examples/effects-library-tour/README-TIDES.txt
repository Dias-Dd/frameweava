TIDES / A STUDY IN LIGHT
=======================
Editable entry: tides-1080p-2997.tsx
1920 x 1080, exact rational FPS 30000/1001, 1798 frames.
Media duration: 59.9932666667 seconds, the closest whole-frame length to one minute.
Original synthesized stereo ambient score, 48 kHz Float32 PCM from an Audio Stage.
Scene-linear RGBA32F working images; the normal MP4 command exports SDR + AAC audio.

Six movements, approximately ten seconds each:
00:00  TIDES    A luminous seed and dust. Centered, widely spaced title.
00:10  DRIFT    Fine jade/gold silk. Left-aligned composition and quiet typography.
00:20  ORBIT    Inclined orbital lines and traveling points of light.
00:30  BLOOM    Coral/gold petal contours. A warmer, denser visual climax.
00:40  CURRENT Layered currents, fine ivory/jade lines, slow phase differences.
00:50  STILL    Reduced scale, more negative space, a gentle fade to black.

Run all commands from the frameweave-engine repository root.
These are commands for the user to run; none were executed for this delivery.

1. If the effects-library-tour package store has not already been prepared:
   node --import tsx examples/effects-library-tour/prepare.mjs

2. Visual preview (native window; full 1080p, no Servo runtime needed):
   npm run frameweave -- examples/effects-library-tour/tides-1080p-2997.tsx --memory-mib 2048
   This native preview path does not play the Audio Stage through a sound device.
   Export the MP4 and open it in a media player to hear the soundtrack.

3. Render the complete film, including the automatically mixed audio track:
   npm run frameweave -- render examples/effects-library-tour/tides-1080p-2997.tsx --memory-mib 2048 --max-concurrency 1 --output artifacts/tides/Tides-1080p-2997.mp4

4. Optional still and storyboard:
   npm run frameweave -- frame examples/effects-library-tour/tides-1080p-2997.tsx --frame 1000 --memory-mib 2048 --output artifacts/tides/bloom.png
   npm run frameweave -- storyboard examples/effects-library-tour/tides-1080p-2997.tsx --frames 150,450,750,1050,1350,1650 --memory-mib 2048 --output artifacts/tides/storyboard.png

Run commands for this entry sequentially: this Main baseline has a known shared
same-entry compile-directory race if separate CLI compilations overlap.

Editing
-------
ART controls palette, resolution, seed metadata and the reused Glow settings.
SOUND controls Layer volume and the pad, bass, bells, air and transition levels.
The soundtrack uses six overlapping chords, sparse bell motifs, analytical echoes
and gentle noise swells. Its notes follow the six visual movements. It fades in
and out and needs no external audio files. Audio is generated in requested sample
blocks; no full-minute waveform or playback history is kept in memory.
Its exact PCM endpoint uses frameToSample at 30000/1001 fps, not a rounded 29.97.
Set SOUND.volume to 0 to mute it. Change harmony/motifs inside soundtrack to re-score.
The six cards control titles, captions, size, spacing and placement.
WGSL scene functions control shot geometry; stage props provide native exposure
keyframes. Geometry and dust use absolute time; there is no simulation-history cache.
The embedded original monoline letterforms need no installed or bundled fonts.
The relative resource-arena import deliberately targets this repository checkout.
native-image-effects@0.4.0 uses the existing sibling package manifest and lock;
this file is not claimed to be a separately portable, already bundled export.

Status
------
Written only, at the user's explicit request. No TypeScript check, shader compile,
preview, frame render, video export, listening or visual verification was performed.
Art direction, sound balance and output quality remain unverified until the user runs it.
No core code, package locks, runtime pins or other worktrees were changed.
