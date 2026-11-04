# DX-1D lightweight local REPL

This optional service is not wired into the public CLI. Importing it does not start a REPL, project, Chromium or daemon. Agent-1 owns the root CLI/bin/package wiring.

Current source-checkout launch (Node 22.19.0 tested):

```powershell
node --import tsx scripts/frameweave-repl.ts
```

```text
fw> 1 + 1
2
fw> let amount: number = 5
fw> amount += 2
7
fw> .open --trusted-local-code examples/developer-preview/hello.tsx
fw> .stages
fw> .time
fw> .params 6
fw> .frame 6
fw> .diagnostics
fw> .close
fw> .exit
```

Actual transcripts are retained in `artifacts/dx-1d/repl-expressions.log` and `repl-project.log`, not substituted with the schematic example above.

## Contract and boundaries

`startFrameweaveRepl({input?,output?,terminal?,cwd?,outputRoot?,banner?})` returns `{server,closed,close()}`. Call `await closed` in a foreground launcher. Do not start on module import. `createReplSession()` provides the same foreground project-command operations for focused tests/adapters. Results use the existing Agent Tool Result v1 helper; failed Inspection reports remain in diagnostic details with original code/stage/frame. This service does not set global exitCode or normalize/replace the three ACL transports.

Node's own REPL evaluator owns variables, evaluation, result formatting, runtime errors, EOF and exit. Existing TypeScript `transpileModule` erases/transforms types and checks syntax; there is no new interpreter, compiler or semantic type checker. The implementation wraps the exposed Node REPL `eval` function using `Reflect.set`; if a future Node version disallows wrapping, startup fails explicitly. Node 22.19.0 is the tested compatibility point. This integration is optional and must not block the first CLI release.

- Ordinary lines are TypeScript expressions/declarations executed as **fully trusted local Node code**, with Node filesystem/process privileges. This is **not a security sandbox**; the underlying Node VM context does not create one. Do not paste unreviewed model/network/project code. `process.exit()`, infinite loops and user-created resources remain ordinary Node behavior; `.exit` cannot safely stop arbitrary hostile code. No persistent REPL history is configured by this service.
- Dot commands are separate from expressions, with a small quoted-argument parser (no shell interpolation/expansion). Unknown commands use Node's normal invalid-keyword error. Paths with spaces must be quoted; backslashes are preserved.
- `.open --trusted-local-code <path>` explicitly permits the existing public compiler to run that reviewed project's Node code. Without the flag it refuses **before** importing/evaluating the project. This invocation declaration is not a new module trust registry and grants neither third-party package trust nor Stage WASM permission. Failed open preserves the previously opened project.
- `.stages`, `.time` and `.params <frame>` read the last successful **build snapshot**, labelled with project and build hash. `.params` uses the public engine `evaluate`, `frameContext` and `isActive`; it reports evaluated declared props/nodes, not values hidden inside arbitrary native code or actual rendered pixels. Re-open to refresh after edits. Stage time remapping and fractional local frames remain the engine's contract.
- `.modules` reuses ACL-1's actual keyword catalog (max 100 results), including trust/eligibility/locks and `runtimeVerified:false`. It does not infer trust from installation and does not install anything. A larger library can be truncated by the existing bounded query; inspect via the public capabilities CLI for selected details.
- `.frame <integer> [--allow-wasm]` is the only built-in command that launches rendering. It rebuilds and invokes public `inspectProject`, writes to a new directory under `outputRoot` (default `.frameweave/repl`), returns actual image references and diagnostics, and lets the existing Inspection service close Renderer. No renderer is kept in the session. WASM defaults to false **on every call**; only the explicit per-call flag grants the existing Stage permission. Trusted Node expressions can themselves invoke Node APIs, including Node WebAssembly; that is not a sandbox or a change to Stage authorization.
- `.diagnostics` returns the last project-command result. JS expression errors are displayed by Node separately. `.close` forgets project state but retains expression variables. `.exit`, EOF or returned `close()` drain queued foreground project commands; no hidden background work is created by the service.

The minimum REPL supports single-line TS/JS expressions and variable declarations. JSX expressions, static ESM import/export, semantic type checking, multiline TS editing, automatic imports, autocomplete for engine APIs and **top-level await** are not supported. Unsupported top-level await is rejected before evaluation; project commands have their own serialized asynchronous execution. Async functions/Promises retain normal trusted Node semantics and user-owned lifetimes. Standard Node `.help` remains available; some standard Node commands can execute local files and must be treated with the same trusted-code boundary.

## Agent-1 wiring

Do not modify `src/cli.ts`, package `bin`, exports or installation layout from this workstream. Suggested integration after Agent-1 reviews the service:

```ts
// In the foreground CLI, after explicit argument dispatch:
if (args.length === 0 && process.stdin.isTTY) {
  const {startFrameweaveRepl} = await import('../modules/repl/index.ts');
  await startFrameweaveRepl().closed;
  return;
}
```

Choose explicit `repl` versus bare interactive invocation in Agent-1; non-TTY no-argument behavior must remain machine-readable help or a documented explicit REPL opt-in. Include this module and the existing TypeScript runtime dependency in the real package, and test the resulting installed public entry. Do not add Chromium startup, WASM opt-in, a background host or automatic project loading to this branch. No root SDK export was added here; any package entry/runtime-pin integration belongs to final review.

```powershell
node --import tsx --test tests/repl.test.ts
node node_modules/typescript/bin/tsc --noEmit -p modules/repl/tsconfig.json
```
