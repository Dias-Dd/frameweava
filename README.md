# Frameweave

Frameweave is a TypeScript/TSX engine for building editable motion graphics, procedural scenes, and video. Projects declare a composition, timed layers, and isolated Stages. The CLI previews source projects, captures frames and storyboards, and renders audio and video.

## Source checkout

For the self-contained Windows installer, included runtimes/models, and the
current public-binary release gate, see [Full installation](docs/FULL_INSTALLATION.md).

Use Node.js 22 or later and npm. Windows x64 is the validated target for the native runtime. Install JavaScript dependencies from the lockfile.

```powershell
npm ci
npm run typecheck
npm run frameweave -- init my-scene
npm run frameweave -- capabilities search "水晶" --kind preset
npm run frameweave -- create examples/creation/audio.tsx --output tone.wav
```

Visual rendering requires the matching Native GPU and SpiderMonkey binaries. A source checkout uses the [native GPU build instructions](modules/native-gpu/README.md#build-and-run) and the [SpiderMonkey source setup](modules/spidermonkey-host/README.md). With both binaries available, preview and render the starter project.

```powershell
npm run frameweave -- my-scene/project.tsx
npm run frameweave -- frame my-scene/project.tsx --frame 0 --output frame.png
npm run frameweave -- render my-scene/project.tsx --encoder libx264 --output scene.mp4
```

## Official libraries

The engine and official libraries are developed in this repository. Pro Animation is an R1 suite that resolves versioned shared libraries for animation, typography, transitions, image effects, and spatial creation. Named package installation downloads immutable snapshots from the official GitHub development registry. Missing dependencies are fetched automatically; only lightweight discovery metadata is bundled.

```powershell
npm run frameweave -- packages install pro-animation@1.1.0 --trust local:frameweave.pro --trust local:frameweave.gpu-images --trust local:frameweave.native-2d --trust local:frameweave.spatial
```

See [remote packages and space reclamation](docs/REMOTE_PACKAGES.md). packages uninstall --all removes the program library while retaining the engine and discovery metadata. Local catalogs remain an explicit development option.

Use the [managed package guide](docs/MANAGED_TYPESCRIPT_MODULES.md) for installation, source approval, locks, and typed imports. The [Pro Animation example](modules/pro-animation/examples/suite.tsx) shows a project that uses the suite.

## Learn and contribute

- [Agent authoring guide](docs/authoring/AGENTS.md)
- [Capability search and presets](docs/ACL_1.md)
- [Native runtime and optional components](docs/NATIVE_ONLY_MIGRATION.md)
- [Distribution build](docs/CLI_DISTRIBUTION.md)
- [Security boundary](docs/SECURITY.md)

This source snapshot includes editable examples, test code, and selected input fixtures. Historical render campaigns and machine-specific evidence stay in the development archive. Some development checks also require separately prepared runtimes, fixtures, or toolchains. See the corresponding module documentation before running a hardware-specific or historical reproduction script.

Original Frameweave code in this source release is available under the [MIT License](LICENSE). Separately licensed components and previously versioned packages retain their applicable licenses. See [Notices](NOTICE).
