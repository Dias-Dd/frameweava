# CLI output for people and automation

The CLI selects a presentation, not a caller identity:

| Invocation | Presentation |
| --- | --- |
| Interactive stdout terminal | Readable Chinese summaries |
| Pipe or redirected stdout | Existing JSON results |
| `--human` | Force readable output, including in a pipe |
| `--json` | Force the existing machine JSON contract |
| `--verbose` with human output | Include raw results / diagnostic details |
| Analysis `--events` | Existing JSONL event stream |

`--human` and `--json` cannot be combined. `--events` cannot be combined with
`--human`. The REPL retains its interactive JavaScript/TypeScript expression
writer; use `session --json` for structured requests rather than `repl --json`.
Help remains readable by default; explicit `--help --json` returns help in JSON.
Version retains its short text form unless `--json` is explicit.

```powershell
frameweave frame room.tsx --frame 130 --output room.png
frameweave render room.tsx --output room.mp4 --human
frameweave render room.tsx --output room.mp4 --json
frameweave frame room.tsx --frame 130 --verbose
```

Readable media success names the file, selected frame/count, known dimensions
and total elapsed time. Preview readiness distinguishes an opened window from
`--no-open`. Failure goes to stderr, retains its stable error code and any
Stage/frame position, shows the original explanation and suggests an action
for common argument, resource-budget, missing-file, integrity, compilation,
WASM-permission and timeout failures. Diagnostics now use specific explanations,
shared cause categories, then named subsystem guidance. Future unknown codes also
receive a Chinese summary and a concrete request for verbose details/reproduction;
the original message, code and producer hint are retained. File-system failures
distinguish a missing path, denied access and a full disk. Integrity/permission
errors keep priority over incidental words in their message. Budget advice does
not claim that every resource limit can be changed with --memory-mib. This is a
presentation layer, not automatic permission granting,
budget changes, lock refresh, error suppression or translation of every backend.

JSON success/failure envelopes, existing ACL stdout/stderr distinctions,
analysis JSONL, exit statuses, returned service values and diagnostic sidecars
remain their existing contracts. Explicit `AgentIO` always stays a machine
transport. Lower-level APIs invoked outside the CLI keep their existing JSON
presentation unless a CLI context is explicitly supplied. Extensions that own
their own serialization can use `writeCLIResult` to join this presentation.

Presentation state uses `AsyncLocalStorage`, without replacing global console
functions. The REPL captures its display policy per instance because terminal
events can originate outside that async context. Its evaluator and lexical
binding behavior remain Node's ordinary behavior.

Run the targeted source checks:

```powershell
node artifacts/cli-output/check.mjs
```

Current delivery evidence is in `artifacts/cli-output/checks.json`: eleven CLI
presentation/invocation tests, one existing Agent transport test, two existing
REPL tests, and type checking. It includes a real build manifest, human/JSON
success and failure, pipes, analysis events and an out-of-context REPL input.
No media rendering or installed npm tarball acceptance was rerun for this
formatting change.

The existing SDK fingerprint covers CLI source bytes too, so this change also
changes the SDK Runtime Pin. Historical portable files must keep a matching
SDK or be deliberately re-exported after review; no locks were silently
refreshed and integrity checking was not weakened.

## Live media progress

Human CLI media commands now show `/ - \\ |` activity for compilation,
initialization and first-frame generation. Native export reports completed GPU
frame batches; creation/professional export reports frames after their existing
write completes. Counts, percentage, actual average throughput and estimated
remaining **render** time are displayed. Audio generation, muxing and encoder
drain have their own phases; 100% rendered is not a claim that finalization or
audio has finished. No new frame, readback, profiling or polling request is made
to compute progress. A single optional observer receives completion events.

The spinner stops when preview becomes ready and restarts for watched rebuilds.
Failure, cancellation and command completion clear its interval/terminal line.
Interactive stderr uses one updating row; redirected `--human` stderr uses
throttled plain lines without terminal escapes. Machine/JSON mode emits no
presentation progress, preserving stdout, diagnostics and service return values.
Observer exceptions do not change rendering. These hooks do not change budgets,
colors, precision, permissions, cache keys or output policy.

Checks: `tests/cli-progress.test.ts`, `tests/cli-progress-media.test.ts`, existing
CLI output tests and types. Local raw results: `artifacts/cli-progress/checks.json`.
There are17 distinct passing tests, including actual three-frame MP4 decode,
preview startup, JSON, compile failure and partial-export cancellation/cleanup.
TTY streams are simulated over the real CLI; this is not a separate physical
PowerShell UI capture. Total validation66.9353446 seconds includes the retained
initial ACEScg fixture refusal: the fixed ACES2 view is preview-only, so the
delivery smoke fixture was corrected to qualified linear709 without weakening
the color gate. No whole-repository, installed tarball or broad media acceptance
was repeated. New progress source bytes also affect the strict SDK fingerprint;
existing locks were not automatically refreshed.

## Diagnostic coverage maintenance (2026-11-03)

`src/cli-diagnostics.ts` owns human explanations; it does not rewrite service
diagnostics or the JSON protocol. Add a specific explanation for a distinct
user remedy, or use a matching cause/subsystem category. Unknown errors remain
visible with their original cause, stable code and a reporting action. A category
is not a claim to automatically diagnose every underlying backend failure.

REPL dot-command parse/queue failures join this presentation. Ordinary TypeScript
evaluation and the non-human REPL writer retain Node behavior. Asynchronously
rejecting extension commands now pass through the same top-level catch.

Run the focused checks (no browser, GPU or media encode required):

```powershell
node --import tsx --test tests/cli-diagnostics.test.ts tests/cli-output.test.ts tests/cli-progress.test.ts
npm run typecheck
```

The source audit scans tracked runtime TS/JS/Rust (not vendor, generated runtime,
validation/test fixtures or the presentation catalog itself). Its results are
written to artifacts/cli-diagnostics/coverage.json, including specific/category/
subsystem counts and uncovered codes. The gate rejects an unclassified family;
it does not imply exact per-code translation or coverage of external plugin code.
New external codes always keep the fallback. Tests cover human/JSON channels,
REPL recovery, explicit hints, raw errno details, integrity priority and failing
async extensions. SDK source bytes change; historical runtime pins and plugin
locks are not refreshed or bypassed by this presentation change.
