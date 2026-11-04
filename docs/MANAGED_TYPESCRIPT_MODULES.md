# Managed TypeScript modules

R1 remains the authority for installation, immutable versions, declared dependencies, source trust and content hashes. Import syntax does not grant filesystem, process, network, WASM or GPU permissions.

## Authoring

The npm distribution includes a read-only local catalog. Install the current
Native animation suite in a fresh project and approve its reviewed authorities:

```sh
frameweave packages install pro-animation@1.0.0 --project project.tsx --trust local:frameweave.pro --trust local:frameweave.gpu-images --trust local:frameweave.native-2d --trust local:frameweave.spatial
frameweave frame project.tsx --frame 2 --output frame.png
frameweave export project.tsx --single-file --layout capsule --output my-animation.tsx
```

After approval in that project, `frameweave packages install pro-animation` reuses
the exact existing version. Use the explicit new version when migrating a legacy
project. `--project` selects the project and defaults to the current directory.
For a source checkout, run `node --import tsx modules/pro-animation/scripts/build-catalog.ts`
and pass its printed directory as `--catalog <directory>` to
`node --import tsx src/cli.ts packages install ...`. The
[editable suite example](../modules/pro-animation/examples/suite.tsx) imports
all its library functions from one package.

The suite pins `frameweave.motion`, `frameweave.vector`, `frameweave.typography`,
`frameweave.transitions`, `native-image-effects`, `native-2d`, and `spatial-creation`.
Its public callable entries cover the existing Native motion, paths, typography,
transitions, image effects, drawing and spatial creation surfaces. If two providers
use the same name, the later provider receives a domain prefix in the suite.
Editing uses the same transition implementation through
`modules/creation-capabilities/transitions.ts`.

R1 locks all seven providers as dependencies of one direct installation. A Stage
initializes the providers selected by its imports, once per provider, using the
provider's existing resources, permissions and GPU lease. Large assets remain
subject to the provider's usual explicit admission. The drawing version in the
suite uses explicit typography services for text or complex paths. Deep EXR,
NanoVDB and separate runtime/model provisioning remain specialist workflows.

A named installation can create a missing minimal Effect lock for its reviewed binding dependencies. It never updates an existing Effect lock. Added dependencies or changed SDK versions still require explicit lock review. Path-based installation keeps its existing `effects lock` workflow.

The engine's checker reads installed declarations automatically. For external editor/tsc paths, run `frameweave packages types` and extend `./.frameweave/managed.tsconfig.json` from the project's tsconfig. This writes only generated declaration paths and does not edit an existing user tsconfig.

An installed direct dependency may expose named Native Stage functions:

```json
"bindings": {
  "schemaVersion": 2,
  "module": "bindings",
  "types": "./dist/bindings.d.ts",
  "engine": "native-gpu",
  "initialize": "initialize"
}
```

`module` names a JavaScript/TypeScript module in the package manifest. Its
initializer receives the existing owner-scoped `NativePluginInit` and returns
`{exports: {namedFunction}, dispose?}`. A forwarding suite instead declares
`bindings.forward` and an exact R1 dependency for each provider. Each entry maps
an exposed name to `{dependency, name}`. The compiler binds it to the callable
in the initialized dependency. Type declarations belong to the immutable
package inventory.

```tsx
import {crossDissolve, keyframeSpan, scene2D} from 'pro-animation';
```

Call managed functions inside the exported Native Stage factory or its frame
callback. The Stage wrapper initializes the selected providers, binds the
callables, and releases their resources with the Stage. Supported import forms
are named functions, aliases and type-only imports. Default, namespace,
side-effect and dynamic managed imports report diagnostics.

The public graphics type facade is `@frameweave/engine/graphics-contracts`; the lifecycle/Flat runtime facade is `@frameweave/engine/packages`. Neither facade installs or trusts packages.

## Readable Flat

`frameweave export project.tsx --single-file --output chosen-name.tsx` can inline supported managed TS/TSX graphs and small resources. The exporter verifies the original R1 snapshots first. It preserves the package identities, original module hashes, dependency pins, source approvals and compatibility metadata alongside hashes of the transformed executable declarations. Resource constants are content-deduplicated. SDK Runtime Pin remains mandatory.

The output contains ordinary typed source, not a source capsule. Module definitions are scoped inside a readable loader function evaluated in the owning Web Stage. Existing `packageModuleLoader`, `createManagedStage`, `createPluginStage`, resource checks and permissions still execute. No Store is created/restored at reception, no eval is used, and no CSP relaxation is required. A second export of an already compliant Flat file preserves its bytes.

Supported managed graphs currently require `.ts`/`.tsx` sources with declaration-only module evaluation. GPU allocation and side effects must stay in their existing initializers. JS-only managed graphs, class/static initialization, top-level asynchronous/side-effect evaluation, dynamic imports, and shared authoring/native modules that would cross the embedded module scope are diagnosed; use Capsule or carried sources for these. This is an explicit subset of Flat, not a new module linker. Existing non-managed Flat behavior remains available.

Embedded certificates detect drift; they are not signatures or a sandbox for hostile project authors who deliberately change both code and hashes. Recipients must review executable projects under the existing trusted-project model, as with Capsule exports. Changing sealed implementation code requires deliberate review and re-export. Layout, timeline and other authoring code outside sealed declarations stays editable. WASM remains denied by default; explicit host authorization is still required after embedding. External export policy remains external and continues to reject managed Store dependencies that it cannot represent safely.

PA-0 publishes its typed source graph plus its existing npm ESM/declaration output. Graphics retains its dependency-free npm ESM and rolled declarations, while its R1 graph uses reviewed typed sources. Existing same-version installed snapshots are never overwritten: R1 still rejects changed content with `E_PACKAGE_IMMUTABLE`; install a reviewed new version or create a fresh project for this pre-release catalog.
