# Creating with Frameweave

Treat this directory as an editable TS/TSX production. Start from the requested story, composition, motion, and sound. Choose the few tools that serve the shot, and keep scene-specific decisions in the project.

## Find the right entry point

Inspect the project's composition, frame rate, duration, resources, Stage ports, and locked dependencies before editing. Commands below assume `project.tsx` is the entry. Use `frameweave` from an installation or replace it with `npm run frameweave --` in the engine checkout.

- **Motion and compositing** use `Composition`, `Layer`, keyframes, easing, and expressions. Use explicit layer ranges to place shots and sounds on the timeline.
- **Titles and 2D design** use typography, text/image/shape objects, or 2D drawing tools. Use `servoStage` for HTML/CSS/SVG/Canvas layout when the Servo component is available. Use the typography SDK for prepared text and declare the fonts the project needs.
- **Image finishing** starts with `imageStage` and `compose`. Look up the high-level operator for grading, glow, masks, or distortion. Group consecutive image operations inside one Stage when their input and output contracts allow it.
- **3D and spatial effects** can start with the spatial creation library for geometry, materials, lighting, cameras, particles, and motion. Use `spatialVfxStage` for procedural scenes or effects such as `crystalSanctum`, `flameVolume`, and `heightFog`. Some presets require an upstream image.
- **Editing and sound** use the editing SDK for clips, timing, transitions, and captions. Use an Audio Stage and a Layer for generated or declared sound, then verify the audible result against the picture.

Before implementing a reusable visual algorithm, search by the intended outcome. Try related terms if the first query gives a narrow result, and search separate aspects of a shot independently.

```powershell
frameweave packages list
frameweave capabilities search "水晶" --kind preset --project project.tsx --json
frameweave capabilities search "文字入场" --project project.tsx --json
```

Read the named import, type signature, input/output contract, availability, and example. In JSON, check `entrypoints` for authoring wrappers, `presets` for named options, `functions` and `sdkReferences` for callable exports, and `apiGroups` for methods on an object or callback. Follow the returned `nextOffset` when you need more results. Use `--include-low-level` for advanced interfaces. Keyword search works with the local catalog. For a P4 descriptor, use `capabilities inspect <id@version>` or `capabilities examples <id@version>`.

## Build a shot

1. Prototype the hardest shot first. Set its duration and composition, place a few representative elements, and decide what must stay editable. Establish a readable visual hierarchy and a consistent palette before adding detail.
2. Prefer an existing typed constructor, preset, or ordinary TS helper before writing shader or resource-management code. Expose the useful shot controls near their call site, such as title timing, camera framing, palette, and effect strength.
3. Use ordinary TS/TSX for composition. Keep Stage inputs and outputs explicit, connect them with `ref()`, and declare project assets as resources. Prepare host-side assets before the Stage runs. Use the supplied frame, time, and seed for reproducible animation and keep GPU resources within their owning Stage.
4. Check the actual engine, package version, resources, and optional runtime required by each choice. Review install proposals and source approval before adding a dependency. Keep reviewed package locks and permission checks in effect. Use the appropriate diagnostics when a dependency or capability is missing.
5. If the available effects cannot express a shot, add a project-local helper or Stage. For a genuinely reusable effect, use `effects create` and `effects validate`, declare its inputs, parameters, resources, and cleanup, then register it with `effects install <directory> --project project.tsx`. Use `effects lock --project project.tsx` after reviewing the new version. Promote to a shared library only when the task calls for it.

## Verify the actual picture and sound

```powershell
frameweave project.tsx
frameweave frame project.tsx --frame 0 --output artifacts/frame-0.png
frameweave storyboard project.tsx --frames 0,12,24 --output artifacts/storyboard.png
```

Choose frame numbers that exist in the project. Inspect the opening, important transitions and a later frame. Test random-access frames when deterministic seeking matters. Render a short clip before committing to a long export, and listen to the audio if timing or sound is part of the brief. Check readable text, framing, color, motion, and the actual start and end of the output. Follow the user's requested validation scope.

Deliver the editable source, asset provenance, exact run commands, and the requested media. Record any missing component or visual issue that affects the result. When portability is requested, use the supported `export` mode and rerun the carried project from a separate directory.
