# Explicit frozen fixture

Use only this worktree's dependencies, caches and outputs. Load the reviewed
Native/SpiderMonkey delivery paths and set FRAMEWEAVE_HOME to
`.frameweave/user-home`, FRAMEWEAVE_MEDIA_PYTHON to the reviewed media Python,
and FRAMEWEAVE_INFERENCE_RUNTIME to the reviewed copied DirectML delivery.

Obtain the two original ONNX files at the exact repository revision in
sources.json, under `.frameweave/source-intake/slimsam`, preserving their
original names. Preparation verifies lengths/hashes. The separately licensed
QA photo is optional; its fixed URL/hash is in sources.json.

Read the existing immutable Git object bd188034 using git archive into
`.frameweave/frozen-native-inference/sdk-bd188034`. Include src, modules,
plugins/builtin, package.json, package-lock.json, tsconfig.json and
docs/plugin.schema.json. This does not synchronize branches or change Core.
The explicit runtime delivery belongs in
`.frameweave/frozen-native-inference/delivery-directml-bd188034`; retain its
original inference-runtime.json and licenses. Do not generate trust receipts.

Run `node modules/native-effects/roto-authoring/validate.mjs model`, then the
same command with phase `build`. The wrapper independently verifies frozen
source hashes against Git, uses only this worktree Cargo cache, restores the
baseline executable and copies these same effects/models into the fixture.

Recorded phases: types, neuraltypes, unit, syntax, manifest, gpu, neural,
neuralchecks, neuralmedia, media, performance and freeze. All share one campaign
ledger and cumulative budget, including failures and build time. See frozen
commands/source receipts/results. Historical ledgers do not grant extra test
budget. This fixture is not an installed/released SDK.
