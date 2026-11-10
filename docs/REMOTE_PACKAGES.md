# Official remote packages

`packages install <name>` reads the configured official GitHub registry, solves
the existing R1 dependency graph and downloads only missing package snapshots.
The development channel is `Dias-Dd/frameweava`, branch `dev`; registry metadata
is in `registry/index.json`, immutable archives are GitHub prerelease assets.
`frameweave.registry.json` selects the channel. Local paths and `--catalog`
remain explicit ways to use private packages. Runtime components are separate.

```powershell
frameweave packages install pro-animation@1.1.0 --trust local:frameweave.pro --trust local:frameweave.gpu-images --trust local:frameweave.native-2d --trust local:frameweave.spatial
frameweave packages list
frameweave packages uninstall deep-image sparse-volume
frameweave packages uninstall --all
frameweave packages install pro-animation@1.1.0
```

Without `--project`, the library belongs to the program and all projects can
use it. Installation preserves publisher approval, exact content and module
hashes, dependency locks and immutable versions. Import/installation does not
grant WASM, Ray Query, filesystem, process or network access inside Stages.
The manifest's historical `local:authority` names identify approved publishers;
they do not specify the new download transport. No install scripts are run.

Archives are verified before extraction; extracted packages are verified again
before R1 publishes the installed state. Downloads and extracted temporary
copies are discarded after success or failure. Only the small discovery index
is cached, so uninstalled functions remain searchable without keeping their
implementations on disk. Installation reports downloaded IDs and transfer bytes.

Uninstall removes selected direct requirements atomically from the graph,
retains shared dependencies still needed by other roots, and refuses to remove
a library that is still required. It then collects unreferenced immutable Store
snapshots, including prior upgrade versions, and reports `freedBytes`. Collection
verifies paths, ordinary files, identities and content first. It does not delete
project sources, exported projects, user-created plugins, models/runtime components,
the source checkout's build catalog or the small search metadata cache. The byte
counter measures file contents; filesystem free-space changes can also reflect
unrelated activity and allocation-unit rounding.

The distribution builder carries registry metadata instead of every library.
Build/publish a registry with `scripts/build-package-registry.ts`: pass an existing
reviewed frozen catalog, a fresh archive directory, and an immutable GitHub release
download base. Keep all advertised archives available. Changed content requires
a new package version; never replace assets for an already published identity.
