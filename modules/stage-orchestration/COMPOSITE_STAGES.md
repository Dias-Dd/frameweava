# SO-2: composable Native Stage scopes, version 1

`CompositeStage` exposes one ordinary Stage boundary to its enclosing DAG. Its
children are definitions local to that scope, not additional top-level work.
Scopes can contain further composites. `mode="auto"` is the default and uses
the existing `topologicalLevels`; `mode="explicit"` uses ordinary JavaScript
and `defineCompositeStage`. Each enclosing scope keeps its own scheduling mode.

The editable, executable example is
`examples/stage-orchestration/nested.tsx`. It demonstrates an outer automatic
DAG, a convergence loop implemented in an ordinary reusable async `enhance`
function, an automatic child group, and a downstream Stage consuming both an
image and its numeric score.

```tsx
import {CompositeStage, Stage, ref, stageInput} from '@frameweave/engine';
import {defineCompositeStage} from '@frameweave/engine/native';

export const controlled = defineCompositeStage(({stages}) => ({
  async renderAt(context, inputs) {
    const result = await stages.run('child', {inputs});
    return result.outputs;
  }
}));

// Within the normal Composition:
// <CompositeStage id="group" mode="explicit" factory={controlled}>
//   <Stage id="child" factory={exportedNativeFactory} ... />
// </CompositeStage>
```

For automatic scopes, `publish={{surface:ref('child'),score:ref('child','score')}}`
maps declared outer outputs to local child outputs. A child's
`inputs={{surface:stageInput('image')}}` binds a declared enclosing input.
Sibling dependencies use existing `ref`. Inputs crossing a scope boundary must
be declared on that boundary; a child cannot silently capture an outer Stage.
Identical local names in different scopes identify different instances.

For explicit scopes, `stages.run(id, {inputs})` calls only a directly declared
child. Required inputs must be supplied on that invocation, even when the
definition has automatic bindings. Missing inputs do not cause hidden upstream
execution. Children remain in their existing independent SpiderMonkey realms.
Normal async helpers may receive/capture `stages`; the helper itself creates no
Stage, device, queue, or execution boundary. The capability is usable only during
the enclosing `renderAt`. Child calls must be awaited in order; concurrent and
unawaited calls fail the enclosing frame. A rejected child also fails the frame
if author code catches the exception, preventing partial output publication.

## Media, time, state, and completion

Native factories remain backward compatible with a single `GpuPixelImage`.
They may also return a declared port record containing an image and finite
JSON/number/string/boolean values. No CPU Surface is fabricated for a resident
image. An ordinary data-only child is valid. Private packet metadata carries
scoped image indices and typed values; it carries no pixels, pointers, arbitrary
paths, or new authority. Same-owner command recording and liveness handle the
whole chain. Pure grouping adds no GPU pass or process. Merely awaiting a child
does not submit or wait for the GPU: the result is recorded work with resident
output handles. The normal frame ticket still defines GPU completion.

Each child inherits the parent's local frame, applies its own existing
start/offset/rate mapping, and preserves the authored global frame/time. The
iteration ordinal does not advance time. There is no result memoization for
explicit calls. A call has a unique identity; persistent instance/state identity
is qualified by its definition's scope, so repeated calls reuse one child and
two separately declared children cannot alias state by sharing a local name.

GPU history still uses explicit `stateStep`, fresh reset epochs, and the
existing Native frame/continuation commit and failure rollback rules.
`flushState` is not a new nested transaction system. Ordinary JavaScript state
is not automatically rewindable. Authors retain responsibility for deterministic
reset/replay/checkpoints, exactly as for existing Native effects.

SO-1 `Session.run` and its independent call commits/reentry protection are
unchanged. SO-2 never recursively enters that public queue. Nested V-SHARED
drafts are explicitly rejected with `E_STAGE_SHARED_SCOPE` pending an approved
transaction-domain contract; root V-SHARED integration belongs to Main.
Audio calls are explicitly rejected with `E_STAGE_CALL_INTERVAL`; the existing
sample-interval API is unchanged. Temporal-source forks of a composite require
a separately qualified replay contract and currently fail explicitly.

A CPU-visible convergence value can control `while`. A convergence metric that
exists only on the GPU is not secretly read back: existing resident-effect
readback restrictions remain. GPU reduction/predication or an explicitly
approved synchronization interface is a separate extension.

## Lifetime, cancellation, and packaging

The root frame's cancellation/deadline is inherited throughout nested calls;
children do not reset it. Cancellation terminates an actively executing isolated
host, and normal disposal closes the remaining realms and resources. Existing
byte/device budgets apply, without an added fixed SO-2 nesting/iteration count.
Real JavaScript, OS, allocation, and protocol addressing constraints still apply.
Initialization retains the existing eager factory lifecycle; an uncalled child
is not a guarantee that its factory was never initialized.

`StageSpec.composition` is an optional, explicitly versioned v1 extension to TVG
0.1; existing fields keep their meaning. Older validators reject the unknown
field rather than silently flattening it. Child factories must still be named
exports or explicit entry/exportName bindings. Compiler collection, type checks,
R1 module-resource admission, build seals, and directory/capsule/Flat source
collection traverse the same scope tree. No package, trust, WASM, P4 ABI, or
global policy is introduced. Installed SDK pin updates remain explicit.

Relevant errors: `E_STAGE_COMPOSITION`, `E_STAGE_COMPOSITION_OUTPUT`,
`E_STAGE_INPUT_REFERENCE`, `E_STAGE_REFERENCE`, `E_INPUT_MISSING`, `E_INPUT_TYPE`,
`E_OUTPUT_TYPE`, `E_OUTPUT_UNDECLARED`, `E_STAGE_CALL_SCOPE`, `E_STAGE_CALL_BUSY`,
`E_STAGE_CALL_PENDING`, `E_STAGE_CALL_PROTOCOL`, `E_STAGE_TIMEOUT`, and
`E_RENDER_CANCELLED`. Child failures retain their qualified Stage identity,
authored frame, and call path at the trusted controller boundary.

## Qualification

L0 validates 110 nested definitions and invalid scope/type/cycle/ownership cases.
Real Windows SpiderMonkey/Vulkan tests cover auto/explicit/auto execution,
ordinary async helper calls, F32 computation and F16 output, signed HDR/Alpha,
random/repeated frames, failures/cancellation/disposal, independent GPU state,
same-frame state segments, PNG, decoded MP4, numerical EXR, and carried
directory/capsule execution with the original source unavailable. These small
correctness fixtures are not a 4K/120 FPS performance qualification. Other
platforms, nested audio/shared transactions, composite temporal replay, and all
six export combinations require their respective integration qualification.
