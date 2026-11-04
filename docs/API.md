# FrameWeave 0.1 API and semantics

FrameWeave project source is ordinary TypeScript or TSX. Its custom JSX runtime constructs a JSON temporal visual graph (TVG); it does not implement React. Native code remains native code inside a Web Stage. A Stage may contain React, Three.js, PixiJS, DOM, Canvas, and shaders together.

## Build-time authoring

Import authoring components and animation helpers from `@frameweave/engine`. Use `jsx: "react-jsx"` and `jsxImportSource: "@frameweave/engine"` in a TypeScript configuration. The CLI configures esbuild with the same runtime. Components are eager build-time functions, and ordinary helpers, loops, conditionals, imports, generics and array operations work normally.

```tsx
import {Composition, Stage, Text, Rect, Layer, ref, keyframes} from '@frameweave/engine';

export default (
  <Composition width={1920} height={1080} fps={60} durationInFrames={600} seed={123}>
    <Stage id="world" entry="./world.ts" outputs={{surface:'surface', energy:'number'}} />
    <Stage id="titles">
      <Text content="FUTURE MOTION" x={keyframes([
        {frame:0,value:-500}, {frame:120,value:120,easing:'easeOut'}
      ])} y={300} fontSize={100} fill="#ffffff" />
    </Stage>
    <Layer id="background" source={ref('world')} />
    <Layer id="typography" source={ref('titles')} />
  </Composition>
);
```

FW-1 adds finite duration/output inference and typed unified Layer content; see [FW-1](FW1_REPORT.md). Explicit duration, old PortRefs and all existing export policies remain supported.

`Composition` (`Video` alias) accepts `width`, `height`, `fps`, and either `durationInFrames` or `duration` in seconds. Optional properties are `id`, `background` (CSS color), `seed` (integer), and `effects` (local effect manifests). `fps` is an integer or a rational `{num:30000,den:1001}`. Duration seconds are rounded to the nearest composition frame. `durationInFrames` takes precedence if both forms are present.

Composition children are `Stage`, `Layer`, `Resource`, arrays, or fragments. A root default export may instead be a JSON TVG object, an imported JSON module, or a build-time function that returns one. A `.json` TVG file can be built directly.

Build-time code executes in a separate Node process with a heap limit and timeout. It retains the current user's filesystem privileges: this is a **trusted-code development environment**, not an untrusted-code service.

### Stage

`Stage` declares an execution boundary. Properties are:

| Property | Meaning |
|---|---|
| `id` | Required unique identifier using letters, digits, underscores and hyphens. |
| `engine` | Optional explicit Engine. Omitted: intersect actually used managed module requirements; existing Web compatibility default applies only when allowed. No managed requirements keeps `web`. |
| `requires` | Explicit `{id,engines}[]` authoring requirements for opaque native factories. Not a TVG field or module loader. |
| `entry` | Native module path relative to the project entry directory. |
| `exportName` | Named native factory export from `entry`; defaults to `default`. Requires `entry`. |
| `factory` | A function that is a named export of the project entry module; resolved to a module/export reference at build time. Web Stages only. |
| `children` | Declarative visual nodes. `children`, `entry`, and `factory` are mutually exclusive Stage sources. |
| `inputs` | Explicit named literal JSON values or `ref(stageId, outputName)`. |
| `inputTypes` | Consumer wire contracts; concrete native TS input fields may be inferred. See executable input contracts below. |
| `outputs` | Named port schemas: `surface`, `number`, `string`, `boolean`, or `json`; default `{surface:'surface'}`. |
| `props` | JSON parameters; numeric/color animation signals are resolved each frame. |
| `width`, `height` | Optional surface dimensions; default composition dimensions. |
| `start`, `duration` | Stage activation range in global composition frames. |
| `offset`, `rate` | Local frame remapping; details below. |
| `time` | Equivalent explicit object `{start,duration,offset,rate}`. Top-level properties override matching object fields. |
| `seek` | `stateless` (default) or `fixed-step`; this declaration does not automatically make an arbitrary simulation seekable. |

Stage activation intervals are start-inclusive and end-exclusive. Consumers must be active only while their declared input producers are active. A Web Stage exports at most one surface port and any number of JSON ports. Surface is a screenshot-generated RGBA PNG, not a shared DOM, WebGL texture, renderer, React tree, or Pixi object. Native `renderAt` returns the declared non-surface output values.

### Single-file native source references

A project entry may contain the graph, native Stage factories, ordinary TypeScript helpers, and library imports in one standard source file. Export each referenced factory by name:

```tsx
import {Composition, Stage, Text} from '@frameweave/engine';
import {defineWebStage} from '@frameweave/engine/web';

const tint = '#73ffe0';
function label(frame: number) { return `FRAME ${frame}`; }

export const nativeTitle = defineWebStage(({container}) => ({
  renderAt(context) {
    container.style.color = tint;
    container.textContent = label(context.frame);
    return {};
  }
}));

export default <Composition width={1280} height={720} fps={30} durationInFrames={90}>
  <Stage id="native" factory={nativeTitle} />
  <Stage id="declarative"><Text content="CUSTOM TSX" x={80} y={100} /></Stage>
</Composition>;
```

The build worker matches the factory by identity against named exports of the project entry. A re-export of the same function is also a named entry export. It then writes only `entry` and `exportName` into the canonical JSON TVG. The authoring-only function reference is removed before serialization. The browser bundle imports that exact ESM export; it does not serialize a function body, call `toString`, evaluate source strings, or copy a Node closure environment.

Module-level private helpers and constants such as `label` and `tint` remain normal lexical references in the original module and are retained by the standard bundler when needed. A native factory may create its own ordinary closures and runtime state. Values that exist only in the build process do not transfer with that closure: pass build-generated JSON parameters through `props` or explicit inputs instead.

An explicit native-module reference is equivalent and is useful when separating source files:

```tsx
<Stage id="native" entry="./native-title.ts" exportName="nativeTitle" />
// Without exportName, entry resolves the module's default export as before.
```

`factory` must be a function and its Stage backend must be `web` (`E_STAGE_FACTORY`). Combining it with `entry` or declarative children fails with `E_STAGE_ENTRY`. An unexported inline function, an imported function that is not re-exported from the project entry, or a temporary build-local function cannot be located and produces `E_STAGE_FACTORY_EXPORT`; export the function/re-export the binding, or use `entry` plus `exportName`. `exportName` without an entry or with an empty name fails with `E_STAGE_EXPORT`. A named export absent from the referenced module is a normal compiler error, not a silent fallback to the default export.

### One standard JSX source per file

`jsxImportSource` applies to the whole source file. A file using FrameWeave JSX can create genuine React elements with `React.createElement` inside a native factory. `createRoot` and `flushSync` still come from ReactDOM; those elements never pass through FrameWeave's video JSX runtime:

```ts
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {defineWebStage} from '@frameweave/engine/web';

export const nativeUI = defineWebStage(({container}) => {
  const root = createRoot(container);
  return {
    renderAt(context) {
      flushSync(() => root.render(React.createElement('div', {style:{color:'white'}}, `Frame ${context.frame}`)));
      return {};
    },
    dispose() { root.unmount(); }
  };
});
```

Conversely, a file may select React's own JSX runtime and construct its video graph with ordinary authoring functions. This is still standard TSX with one runtime:

```tsx
/** @jsxImportSource react */
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Composition, Stage, Text} from '@frameweave/engine';
import {defineWebStage} from '@frameweave/engine/web';

export const nativeUI = defineWebStage(({container}) => {
  const root = createRoot(container);
  return {
    renderAt(context) {
      flushSync(() => root.render(<div style={{color:'white'}}>Frame {context.frame}</div>));
      return {};
    },
    dispose() { root.unmount(); }
  };
});

export default Composition({width:1280,height:720,fps:30,durationInFrames:90,children:[
  Stage({id:'ui',factory:nativeUI}),
  Stage({id:'caption',children:Text({content:'NATIVE REACT JSX',x:80,y:100})})
]});
```

Keeping native React JSX in a separate file with its own pragma remains supported. There is no tag-based automatic dispatch between React JSX and video JSX, no per-function JSX runtime, and no React impersonation.

### Module execution and state boundaries

The project module executes in the build worker under Node and is independently loaded by each native Stage that imports one of its factories. Browser-only DOM/WebGL initialization belongs inside the factory, rather than at module top level. Top-level constants, helper functions, and imported dependencies used by a single-file Stage must be compatible with those execution environments. A module with Node-only imports or build-only side effects should be split so its native entry is browser-compatible.

Each Stage has its own module instance, globals, and factory-created state even when factories share one source file. Sharing a private helper does not create shared mutable memory between Stages. Cross-Stage values still use explicit JSON or PNG ports; neither factory references nor native objects become transportable values. Use `renderAt` and explicit time/checkpoint contracts for frame-dependent state.

Graph dependencies come only from explicit input references. The scheduler executes stable topological levels, allowing independent branches to run together and joins to wait for all inputs. Cycles and missing references produce structured errors. Runtime input/output validation checks declared types.

### Mandatory source checks and executable input contracts

Every build type-checks the actual TS/TSX entry and its imports before evaluating the project, then checks native Stage string entries and their imports before bundling. This gate applies to every CLI build/frame/preview/render route, including external files excluded by tsconfig. Type errors report `E_TYPECHECK` with file, one-based line/column and TypeScript diagnostic code. Syntax errors retain `E_COMPILE`. JavaScript is not promoted to strict TypeScript; JSON/JS still undergo DSL/TVG and port validation.

`inputTypes` declares consumer expectations independently of producer output declarations:

```tsx
<Stage id="caption" entry="./caption.ts"
  inputs={{pulse:ref('world','pulse')}}
  inputTypes={{pulse:'number',label:{type:'string',optional:true}}} />
```

The compiler can infer closed input fields from `defineWebStage<{pulse:number;label?:string}>`, including exported/re-exported factories. Explicit contracts must agree with inferred ones. Open index signatures, `any`, `unknown` and other ambiguous inputs need explicit contracts. Supported wire categories are `number`, `string`, `boolean`, `json` and `surface`. Optional fields may be unbound; a bound value must still match. `json` validates finite, cloneable JSON values, not a nested application-specific object schema.

TVG validation rejects missing schemas (`E_INPUT_SCHEMA`), missing required bindings (`E_INPUT_MISSING`) and incompatible links/literals (`E_INPUT_TYPE`, inside build `E_TVG` details). Immediately before cache lookup or Stage execution, resolved values undergo the same checks with Stage/frame context. No coercion occurs. Unknown DSL/TVG node properties report `E_UNKNOWN_PROPERTY`; Stage `props` and JSON payloads retain arbitrary user keys.

### Layer and hierarchy

FW-1 adds `name`, static `enabled`, and typed `content.image/video/surface/audio` references which lower to existing output PortRefs. Visual content accepts transforms/blend; typed audio accepts existing Signal-based gain/pan and sample-unit trim. This baseline has no formal AU-1 runtime yet; typed audio declarations do not claim executable audio support. See [integration boundary](FW1_AU1_INTEGRATION.md).

`Layer` specifies compositing order (declaration order), a `source` surface reference, and optional `parent`. Nested `Layer` nodes automatically record their parent identifier. A Layer without `source` is a transform group. Properties include `id`, `x`, `y`, `scale`, `scaleX`, `scaleY`, `rotation`, `opacity`, `originX`, `originY`, `start`, `end`, `blend`, and `effects`.

Transforms use pixels, scale ratios, and rotation degrees. The pivot is `originX/originY` in local pixels. Children inherit parent transform and opacity. Each layer's animated values are evaluated at composition time. Supported blend modes are `source-over`, `screen`, `multiply`, and `lighter`.

If no explicit Layer is present, Composition creates one surface layer for each Stage in declaration order. If any explicit Layer exists, only explicitly declared layers participate in the final composite. A Stage can still be rendered and inspected independently.

### Declarative visuals

`Text`, `Rect` (`Shape` alias), `Circle`, and `Group` (`Scene` alias) create video visual nodes. Scene is a visual group, not an additional execution environment. Use Stage for execution boundaries.

All visual nodes support transform properties, `start` and `end` local frames. Groups contain other visual nodes. `Text` accepts `content` (or string children), `fontFamily`, `fontSize`, `fontWeight`, `letterSpacing`, `lineHeight`, `align`, `width`, `height`, `fill`, `stroke`, and `strokeWidth`. Rect uses `width`/`height`; Circle uses `radius`. Both support fill/stroke.

Visual coordinates are local to the parent. Text content is a build-time string; changing arbitrary strings each frame belongs in native Stage code. Numeric and color properties accept animation signals. Raw DOM JSX is deliberately rejected by the video runtime.

### Resources

`<Resource id="font" kind="font" src="./font.woff2" />` explicitly declares a resource. Supported kinds are `image`, `font`, `model`, `media`, and `file`. Local files must reside within the project entry directory. Explicit `package:` references can locate installed package resources, for example `package:@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2`.

The compiler copies declared resources into the build and records their bytes in the build fingerprint. Native Stage initialization receives a map of resource IDs to served URLs. Supported imported asset extensions also pass through esbuild's asset loader. Missing resources fail before rendering.

## Animation and deterministic time

The single base time is an integer, zero-based global composition frame. A frame exists when `0 <= frame < durationInFrames`. The final frame of a 600-frame composition is 599.

Stage local time follows:

```text
localFrame = offset + (globalFrame - start) * rate.num / rate.den
timeSeconds = localFrame * fps.den / fps.num
globalTimeSeconds = globalFrame * fps.den / fps.num
```

Default mapping is `start=0`, `duration=composition.durationInFrames`, `offset=0`, and `rate={num:1,den:1}`. Rates may be positive, negative, or zero; a positive integer denominator is required. Rational mappings can produce fractional local frames. Reverse playback requires an appropriate offset. Stage activation still uses global frames, independently of remapped local time.

The `FrameContext` delivered to a Stage contains `frame` (local frame), `globalFrame`, `time`, `globalTime`, `dt` (signed mapped step in seconds), `fps`, `durationInFrames` (activation span), `progress` (activation progress), and a deterministic Stage-specific `seed`. `frameContext`, `compositionContext`, `frameToSeconds`, and `secondsToFrame` are exported helpers.

### Keyframes and interpolation

```ts
const position = keyframes([
  {frame:0, value:0},
  {frame:120, value:700, easing:{bezier:[0.16,1,0.3,1]}}
]);
```

Keys require finite nonnegative strictly increasing frame numbers. Values are all numbers or all strings. Easing belongs to the **destination key** and controls the segment leading into it. Tracks clamp before their first and after their last key. Independent properties are independent tracks.

Supported curves are `linear`, `step`, `easeIn` (quadratic), `easeOut` (quadratic), `easeInOut` (symmetric quadratic), and `{bezier:[x1,y1,x2,y2]}`. Bezier x control points must be in `[0,1]`; y may overshoot. Step holds the previous value until the destination key. Color interpolation supports hex RGB/RGBA, `rgb(...)`, `rgba(...)`, and a small set of named colors. Channels interpolate numerically in sRGB; arbitrary non-color strings change discretely.

### Springs

```ts
spring({from:100,to:800,start:60,stiffness:170,damping:26,mass:1,velocity:0})
```

`start` is a local frame; velocity uses value units per second. Mass and stiffness must be positive, damping nonnegative. The implementation solves the underdamped, critically damped, and overdamped equations directly from absolute time. No accumulated integration state is needed, so random frame access yields identical results. Before start, the value is `from`.

### Expressions and ordinary TypeScript helpers

Build-time functions may calculate tracks, layouts and parameters. Arbitrary JS closures cannot be serialized into a TVG. Use a JSON expression AST for portable per-frame expressions, or put unrestricted native code in a Stage module.

```ts
import {expr} from '@frameweave/engine';
const orbitX = expr.add(200, expr.mul(40, expr.sin(expr.mul(expr.time, 2))));
```

AST sources: `expr.time`, `frame`, `globalTime`, `globalFrame`, and `progress`. Operations: `add`, `sub`, `mul`, `div`, `sin`, `cos`, `abs`, `min`, `max`, `clamp`, `pow`, `floor`, `ceil`, `mod`, and `random(salt)`. `evaluate(value, context)` recursively evaluates signals in JSON objects. Non-finite results and unsupported operations fail explicitly.

`seededRandom(seed, frame, salt)` is a pure helper: identical inputs return an identical number in `[0,1)`. Use a stable particle index as salt. `expr.random` includes the context's Stage seed and local frame.

Native Stage code should derive every visible state from the supplied context. Engine clock guards do not make arbitrary third-party simulations stateless, and raster/GPU results are not guaranteed byte-identical across browser versions or GPU drivers. Reproducibility claims apply to the tested environment and pinned inputs.

### Stateful simulation checkpoints

For physical or history-dependent code, use `FixedStepRunner` explicitly rather than assuming random access works:

```ts
import {FixedStepRunner} from '@frameweave/engine/web';
let state = {x:0,velocity:1};
const simulation = new FixedStepRunner({
  reset(){state={x:0,velocity:1};},
  step(dt,frame){state.velocity+=9.81*dt;state.x+=state.velocity*dt;},
  snapshot(){return state;},
  restore(saved){state=saved;}
}, {fps:60,checkpointInterval:30,maxCheckpoints:32,maxSteps:100000});
// In renderAt(context): const current = simulation.seek(context.frame);
```

Frame zero is the reset state. Seeking restores a retained checkpoint at or before the target, then replays constant steps. Snapshots are structured-cloned so retained state cannot be changed accidentally. Frame zero is always retained; memory and replay step counts are bounded. The helper requires nonnegative integer local frames: authors using reverse or fractional remapping must choose an explicit compatible sampling strategy.

## Native Web Stage modules

### Headless host API

Node scripts running with a TS loader such as `tsx` can import the headless host separately from the browser-safe authoring API:

```ts
import {buildProject, Renderer} from '@frameweave/engine/node';
const build = await buildProject('./examples/future-motion/project.tsx');
const renderer = await Renderer.create(build, {width:960,height:540});
try {
  const frame = await renderer.renderAt({time:4}); // explicit seconds; nearest composition frame
  const same = await renderer.renderAt({frame:240});
  // frame.png is a Buffer; stageOutputs holds validated explicit port values.
} finally {
  await renderer.close();
}
```

`renderFrame(integerFrame, stageId?)` is the direct frame API. `renderAt` requires exactly one explicit `frame` or `time`; it never guesses the units of a bare number. Supplying a Stage ID renders only that Stage and its dependencies. Independent native Stage initialization/render failures remain diagnosable without preventing inspection of a healthy Stage.

The selected module export is an async or synchronous factory: the default export for plain `entry`, the specified export for `entry` plus `exportName`, or the named entry-module export resolved from `factory`. It receives `{container,width,height,seed,resources}` and returns `{renderAt,dispose?}`. All libraries stay inside this execution environment.

```ts
import {defineWebStage} from '@frameweave/engine/web';
export default defineWebStage(({container,width,height}) => {
  // Initialize Three.js, React, PixiJS, or DOM once, without an independent animation loop.
  return {
    renderAt(context, inputs, props) {
      // Assign absolute state using context.time/frame, then explicitly render.
      container.textContent = String(context.frame);
      return {}; // Named JSON outputs only; RGBA surface is captured by the host.
    },
    dispose() { /* release native resources */ }
  };
});
```

For React TSX modules, add `/** @jsxImportSource react */` and use the genuine React/ReactDOM runtime; the single-file alternatives are described above. A render call must commit DOM changes before its promise resolves; `flushSync` is appropriate for the engine's explicit capture boundary. PixiJS should disable automatic ticker startup and call `render()` explicitly. Three.js should update from absolute time and render explicitly rather than calling `setAnimationLoop`.

Stage inputs are structured data. Surface inputs carry `{kind:'surface',format:'png',width,height,dataUrl}`; native code can decode the PNG. Declared non-surface output values must be JSON and match their port schema. Errors identify Stage and frame where available.

## Effects extension manifests

This section describes the compatible legacy Layer Canvas Filter API. P4's executable, versioned plugin registry and Stage-local pipelines are documented in [PLUGINS.md](PLUGINS.md); import their SDK from `@frameweave/engine/plugins`.

Local TypeScript modules can export versioned effect manifests using `registerEffect`. Import and include them explicitly in `Composition.effects`; use their IDs in a Layer's `effects` array. There is no hidden global registry.

```ts
export const soft = registerEffect({
  id:'soft',name:'Soft focus',version:'1.0.0',engine:'web',kind:'canvas-filter',
  parameters:{radius:{type:'number',default:4,min:0,max:50}},
  inputs:{surface:'surface'},outputs:{surface:'surface'},
  implementation:{filter:'blur',parameter:'radius',unit:'px'}
});
// <Composition effects={[soft]} ...>
// <Layer ... effects={[{id:'soft',params:{radius:6}}]} />
```

Parameter schemas support `number`, `string`, and `boolean`, defaults, numeric min/max, and enumerations. Unknown parameters, missing required values, invalid types and duplicate IDs are diagnosed. Built-ins are `blur` (`radius`, default 0) and `brightness` (`amount`, default 1). Executable filters are blur, brightness, contrast, saturate and hue-rotate.

Manifest fields reserve `function`, `component`, `shader`, and `native` effect kinds plus `source` and `resources` references. These kinds describe future adapters; trying to execute them in this edition fails with `E_EFFECT_BACKEND`. They must not be counted as implemented backends.

## Validation and diagnostics

`validateTVG(tvg)` returns structured diagnostics; `assertValidTVG(tvg)` returns the graph or throws `EngineError('E_TVG', ..., {details:{diagnostics}})`. JSON validation rejects functions, cyclic objects, non-finite numbers, and live runtime objects before serialization. The authoring-only `Stage.factory` reference is resolved to a module/export descriptor by the build worker before canonical JSON validation; it is not an exemption for arbitrary function-valued props or outputs. `topologicalLevels(stages)` throws on missing dependencies or cycles and includes the cycle path.

Diagnostic records contain `code`, `severity`, `message`, and optional `stageId`, `frame`, `hint`, and `details`. Examples include `E_COMPILE`, `E_TVG`, `E_STAGE_REF`, `E_DAG_CYCLE`, `E_KEYFRAMES`, `E_TIME_RANGE`, `E_RESOURCE_MISSING`, `E_STAGE_RENDER`, and output format/size errors. Visual heuristics are warnings, not proofs of aesthetic correctness; inspect actual frame and storyboard images as part of acceptance.
