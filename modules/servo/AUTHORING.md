# Servo authoring

`servoStage` returns an ordinary Native Stage factory. The engine still owns
the GPU, schedule, clock and final output. It creates one persistent Servo
module per frame slot and disposes it with the Stage. This does not restore the
removed Web Stage or authorize untrusted content/native code.

```tsx
import {Composition, Stage, Layer, ref, keyframes} from '@frameweave/engine';
import {servoStage} from '@frameweave/engine/servo';

export const title = servoStage({
  html: '<div class="title">Frameweave</div>',
  css: '.title { color:white; opacity:var(--opacity); transform:translateX(calc(var(--fw-progress) * 40px)); }',
  defaults: {opacity: 1},
  variables: {'--opacity': 'opacity'},
});
export default <Composition width={1920} height={1080} fps={60} durationInFrames={120}>
  <Stage id="title" factory={title} props={{opacity:keyframes([{frame:0,value:0},{frame:30,value:1}])}}/>
  <Layer source={ref('title')}/>
</Composition>;
```

`--fw-time`, `--fw-frame` and `--fw-progress` use the existing local FrameContext;
they are set before `window.frameweaveRender(context, parameters)`. User mappings
accept scalar values; missing values remove the property. Defaults are literal
JSON, not another expression/animation evaluator. Animate the existing Stage
`props`. The frame callback is synchronous. Ordinary DOM and Canvas code may
update from that explicit time; autonomous RAF/timer compatibility, arbitrary
React DOM, SMIL and arbitrary third-party animation libraries are not qualified.
Keep history-dependent code out of stateless callbacks; automatic replay is not
implemented here. Do not reconstruct HTML or encode images every frame.

The default is explicitly **SDR sRGB8 inside Servo**, returning linear Rec.709
premultiplied F32. It is not lossless HDR. `input:'picture'` accepts one ordinary
Native image port satisfying the existing Servo input contract; use
`{{frameweave.input}}` in an image `src`. Keep HDR content outside Servo and
composite the generated SDR overlay using the existing professional compositor.

An editable source-development example is `examples/card/project.tsx`, with
ordinary `page.html`, `style.css`, `animate.js`, `logo.svg` and generated document.
Run `node --import tsx modules/servo/examples/card/prepare.ts` after editing its
local page files, then render the project with the existing CLI and an explicitly
selected matching Servo runtime. Its relative SDK import avoids assuming that
Main has already installed the new public package entrypoints.

## Local files, prepared once in Node

```ts
import {prepareServo, writeServoDocument} from '@frameweave/engine/servo/node';
const document = await prepareServo({
  root: './page', entry: 'page',
  resources: {
    page:'index.html', style:'style.css', script:'main.js',
    logo:'logo.png', font:'font.woff2', fontLicense:'OFL.txt',
  },
  notices:['fontLicense'],
  maxSourceBytes:32*1024*1024, maxPreparedBytes:48*1024*1024,
});
await writeServoDocument('./generated/document.ts', document);
```

Import that generated pure TS document into the project, then use
`servoStage({document})`. All source dependency IDs, byte lengths and SHA256
values are recorded. CSS imports, relative image/font URLs and static JS/TS/JSON
imports must name explicitly declared files in the project root. No implicit
node_modules lookup, network/code download or runtime file reads occur. Scripts
initialize in document order, in bundled entry scopes; expose the callback
explicitly on `window`. This is not full browser classic-script global scope.

The prepared bytes become ordinary project/R1 module source dependencies:
existing build fingerprints, R1 content locks and source exports protect them.
The provenance array is not another lock/registry or permission grant. Regenerate
after editing original files; until then the generated document is the actual
runtime input. Original files are unnecessary at runtime. Keep font/library
license notices with the project/module, or supply their declared IDs in
`notices` to embed them in generated source. Preparation does not grant
distribution rights or discover third-party notices automatically.

Unsupported elements, resource attributes, inline event handlers, async/defer
scripts, dynamic imports, undeclared dependencies and external URLs fail with
`E_SERVO_*` diagnostics. HTML parsing uses the existing xmldom parser, not a full
browser HTML5 error-recovery implementation; provide well-structured markup.
Runtime CSP remains restrictive. No eval/Function/WASM/network permission is
added by preparing a document.

## Capacity and runtime compatibility

The updated native DLL removes the old 4092/32768-byte control, 2 MiB source,
16-instance and 16M-pixel policy ceilings. Existing owner message/memory budgets,
actual GPU texture dimensions and ABI/addressability checks remain. Optional
operator environment variables configure additional budgets, read once in the
native process: `FRAMEWEAVE_SERVO_MAX_CONFIG_BYTES`,
`FRAMEWEAVE_SERVO_MAX_CONTROL_BYTES` (context + parameters),
`FRAMEWEAVE_SERVO_MAX_INSTANCES`, `FRAMEWEAVE_SERVO_MAX_PIXELS` (per instance).
Values must be positive addressable integers. These are admission limits, not
complete accounting for Servo/driver internal DOM/layout allocations.

Old modules and C ABI1 remain valid. Large payloads need the matching reviewed
DLL (`capacityProfile:'operator-budget-v1'` in runtime stats); old DLLs retain
their old limits. Build with the existing explicit offline Servo build recipe.
Do not modify receipts or update a runtime pin to make a mismatched DLL load.
No public redistribution qualification for the optional native bundle is added.

## Public SDK integration

This checkpoint provides independent pure `modules/servo/index.ts` and Node-only
`modules/servo/node.ts` entrypoints. Main owns package/compiler/portable SDK wiring:

- `/servo`: types `modules/servo/index.ts`, runtime `lib-modules/servo/index.js`.
- `/servo/node`: types `modules/servo/node.ts`, runtime `lib-modules/servo/node.js`.
- Compiler aliases/type paths must match those exact sources. Only index,
  stage and document are pure SDK files; never admit the Node preparation file
  into a Stage or classify the whole directory as trusted pure SDK.
- Portable SDK collection must recognize these exact pure files. An unsupported
  export must diagnose the missing integration instead of dropping dependencies.
- Review SDK Runtime Pin and install the matching frozen native/Servo assets at
  integration. Source-relative examples qualify the module before that wiring;
  the public import snippets above require Main's integration.
