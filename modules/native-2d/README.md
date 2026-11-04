# Native 2D shared drawing — development checkpoint

This is a staged implementation, not a complete HTML/CSS/Canvas/SVG browser. Build the object tree inside the ordinary Native Stage factory and call `scene2D(init, root, options)`. Its output is the existing scene-linear Rec709 F16/F32 premultiplied Surface and can feed the current Blur/Glow/post APIs. It owns no Renderer, GPU host, session, package registry or time system. True DOM content remains an explicit Servo choice.

The shared typed nodes are Group, Shape/Path, Image and Text. IDs are explicit/stable; child array order is painter order. Coordinates are local px with top-left/Y-down axes. Transforms compose parent × child; rotation is degrees, anchor is local px and explicit matrices use Canvas `[a,b,c,d,e,f]` column-vector convention. Optional viewBox maps logical px into output pixels. Numeric colors are signed/HDR linear values, strings use the existing opaque sRGB control-color adapter, and paint opacity is explicit. Gradients interpolate premultiplied linear stop values. Image sources are declared existing Resources or explicit Stage inputs, with contain/cover/stretch and nearest/linear sampling.

Group opacity applies after its descendants have been composited in an isolated bounding image. Clip masks use the same Native mesh profile. Ordinary opaque groups flatten into shared batches; small children do not each become full-frame Surfaces or Stages. Multiple solid paints share a packed palette/atlas. Images share batches up to the current Pixel ABI's actual three-source limit after its index image. Sampling changes form explicit painter-order batches. Potpack is reused unchanged from Three0.186.1 (ISC notice retained); no new rectangle packing algorithm.

Geometry and per-node revisions persist; static local geometry is admitted at Stage initialization. Each frame uploads a small transform table and uses the existing Compute and Native hardware mesh raster. Dynamic geometry uses frame-local buffers and the existing owner's allocation reuse; it does not retain invalid transient handles. Geometry/layout/style/transform changes are tracked separately. There is no frame-result cache or wall-clock animation. Editing ordinary scene data is explicit; arbitrary author JS state is not transactionally rolled back or automatically replayed.

The current independent path renders plain rectangles, Three circle primitives, gradients, declared images, parent transforms, rectangle masks and isolated opacity. General paths, rounded corners, path clips and strokes delegate to the existing PA canonical Clipper2/Earcut services. Text delegates to existing shaping/layout/glyph geometry. Missing services fail with `E_NATIVE_2D_SERVICE`, never fake geometry or character-count widths. Frozen path/font/itemizer assets are an acknowledged Main dependency; the retired Kit initializer is not replaced. Canvas recording and layout now feed this same object tree. SVG source conversion now feeds the same tree; its explicit subset and service dependencies are below.

Budgets are configurable bytes and geometric/paint quality, not node-count quotas. Atlas gradients are spatially sampled at gradientPixelsPerUnit (default1 local px), with F32 work buffers and bilinear sampling; this is an explicit spatial-quality setting, not SDR8 quantization. No paint or image is silently downscaled to fit. Actual capabilities govern texture/storage/dispatch limits. RGBA16F logical images still cost the existing F32 working bytes per pixel; physical peak memory is unknown. Existing Graphics-v1 path/glyph and Schema-v2 whole-value limits are recorded separately and are not claimed removed.

Create one scene during Native Stage initialization, then reuse renderAt/update/setRoot. Await recording before editing/disposal. Returned images belong to the caller; scene disposal releases only its own resources, never the borrowed GPU owner/services. Logical retirement is distinct from GPU completion; Core owns fences, loss, cancellation and session reconstruction. Stateful user drawing must use the existing reset/replay rules. Caller-retained output images also remain caller memory responsibility.

Validation and package instructions will be finalized against actual phase evidence. This checkpoint does not claim text, arbitrary SVG, CSS layout, portability or 1080p/4K performance have already passed.

## Canvas recording and object layout

```tsx
export const shot = defineNativeStage(init => {
  const drawing = canvas2D({id:'drawing', width:640, height:360});
  drawing.fillStyle = '#54cfff';
  drawing.save();
  drawing.translate(36, 40);
  drawing.fillRect(0, 0, 120, 60);
  drawing.restore();
  return scene2D(init, group({id:'root', children:[
    drawing.snapshot(),
    group({id:'cards', y:140,
      layout:{display:'flex', direction:'row', width:640, height:160, padding:24, gap:16, align:'center'},
      children:[
        rect({id:'one', width:120, height:80, fill:solid('#335577')}),
        rect({id:'two', width:120, height:80, layout:{grow:1}, fill:solid('#55bbdd')})
      ]})
  ]}));
});
```

Canvas-style drawing records existing Shape/Image/Text/Group data; it is not an HTML Canvas implementation or a second renderer. save/restore, affine transforms, move/line/quadratic/cubic paths, circular/elliptical arcs, fills/strokes, source-over, globalAlpha, gradients, declared images, sampling and clips use the same geometry/paint/backend. Path arcs lower through the original PA sink. Rectangles and complete ellipse fills reuse the existing primitive geometry path. Consecutive identical clips share a Group. Single-paint object opacity stays in the shared atlas rather than allocating one isolated Surface per translucent rectangle. Multi-paint/group opacity remains isolated.

`clearRect`, other composite modes, two-centre/two-radius radial gradients and equal-offset hard stops explicitly reject in this subset. `reset()` starts a new recording; it is not destination-pixel erasure. Paint/geometry snapshots preserve earlier recorded calls. Pixel reads/writes are not exposed. `measureText(value,font)` and `fillText(value,x,alphabeticBaseline,font)` are explicitly asynchronous, require actual FrameContext plus the admitted existing text service, and must be awaited before changing state or taking a snapshot. They do not return fake/stale synchronous widths. Missing path/text services still diagnose.

`node.layout` supports explicit flex row/column/reverse, wrap, gaps, padding/margins (one/two/four values), alignment, grow/shrink/basis, min/max, px/percentage/auto dimensions and absolute insets. `gridColumns` is an equal-column source-order grid preset over the same flex/wrap algorithm; spans, subgrid and browser CSS cascade are unsupported. Layout changes the object's allocated dimensions/placement; visual transforms are applied afterwards and do not change flow. Geometry has actual intrinsic bounds, images use declared source dimensions, and text uses admitted actual measurements. Ellipses/paths resize into their allocated box; text wraps rather than stretching glyphs. Actual default font layout is qualified by the native-2d font asset checkpoint below.

The adapter uses pinned Flexily0.8.3 (MIT) after evaluating Typeflex0.1.0 (older Yoga port without the required gap profile), css-layout1.1.1 (archived limited profile), and Yoga/WASM (needs unavailable admitted Native assets). Flexily's optional debug/loggily probing is removed; its integer device-pixel snapping is replaced by identity coordinates for floating logical px. Flex/constraint formulas are retained. The source receipt records exact upstream/carried hashes and these changes; no synthetic monospace/pretext/test measurer is used. Existing Node geometry/layout revision caching is reused; this first adapter caches an unchanged layout tree and rebuilds layout on real layout/geometry changes, not a claim of fully incremental per-node layout. GPU geometry caching remains separate. `maxLayoutPasses` (default16, configurable) bounds asynchronous text-constraint settling and errors rather than publishing provisional results.

Editable combined example: `examples/dashboard.tsx`. It uses a declared real image and both recording/object-flow APIs in one Stage, with no author-managed GPU resources. See examples/fonts.tsx for the qualified default text/path shot.

## SVG source adapter

```ts
const artwork = await svg2D(`<svg viewBox="0 0 640 360">
  <g id="panel" opacity=".8" transform="translate(30 40)">
    <rect width="200" height="100" fill="#53caff"/>
  </g>
</svg>`, {id:'art', width:640, height:360});
const scene = await scene2D(init, artwork);
scene.update('art/panel', {x:expr.mul(expr.time, 20)});
```

The source adapter reuses the pinned Three0.186.1 SVG path/arc/primitive/transform parser, extracted without its loader, CanvasTexture, materials, meshes or separate stroke renderer. It receives a real @xmldom/xmldom0.8.15 XML document. Fixed element queries use actual XML methods; no browser DOM global or general CSS selector shim is installed. Source/transform algorithms are retained, warnings become explicit diagnostics, gradient maps use null prototypes. Exact fixed-source/adaptation hashes are in vendor/three-svg/SOURCE.json. Both sources are MIT.

Supported source data: SVG root, groups, paths with M/L/H/V/C/S/Q/T/A/Z, rect/circle/ellipse/line/polyline/polygon, presentation/simple inline styles, inherited fill/stroke/color, local gradient references/inheritance/affine maps, strictly increasing gradient stops, concentric radial/linear paints, local userSpaceOnUse clips, declared images, viewBox and root preserveAspectRatio. Parent transforms remain local native transforms; group opacity applies after isolation. Elliptic arcs use the original PA sink's explicit positional tolerance. Root viewport clipping is retained. Plain rectangles/circles/ellipses and rectangular clips use the independent primitive path.

General fill/stroke and canonical union of multi-shape clips require the actual existing admitted PA path service. Curved object-bounding-box gradients require the original PA CurveGeometry factory through Services2D.curveFactory. It is borrowed, does not confer WASM permission and creates/disposes original owned query leases; no replacement geometry query host or fake bounding box is supplied. Default Clipper2-backed curved fill/stroke is qualified in examples/fonts.tsx; tight curve-factory bounds remain explicitly supplied.

`images` maps exact SVG href strings to declared existing image Resources/Stage inputs. There is no implicit file/network/data-URL loading. SVG image preserveAspectRatio supports centre meet/slice or none. Source SVG strings use sRGB control colors; output stays existing float scene-linear PM. Authors can update any stable imported shape paint to native signed/HDR linear numbers. An imported authored ID `panel` is exposed as `art/panel`. The existing compiler's ordinary `.svg` import is a file asset, not automatically raw source; this API accepts explicit SVG text. It does not alter compiler resource behavior.

Explicitly unsupported in this profile: scripts/events/DTD/entity declarations, external unresolved references, stylesheets/cascade, filters/masks/patterns/use, nested SVG viewports, objectBoundingBox clip units, focal/two-circle radial paints, equal-offset hard stops and non-px primitive geometry units. Unsupported features fail before a fake or SDR raster fallback. Full browser SVG remains an explicit Servo option. SVG <text> remains outside this strict source profile. Use the qualified text() node or asynchronous Canvas-shaped text calls described below.

Editable source example: examples/svg-scene.tsx (declared real photo, gradients, nested transforms/clips, ordinary Native time and HDR paint update, one Stage).

SVG gradient fidelity: Native/Canvas-shaped gradients retain their existing linear-premultiplied default. SVG defaults to sRGB straight-color interpolation, or linear-straight for explicit color-interpolation="linearRGB", then converts the result into the same scene-linear premultiplied output. This preserves transparent stop RGB during interpolation. The signed sRGB piecewise equations match existing Core color transforms; only stop/control conversion runs on CPU, all spatial gradient sampling remains GPU. SVG straight gradients use centre-sampled float atlas cells; transformed gradients retain the documented configurable spatial sampling quality. Zero-stop gradients paint none; one-stop gradients are solid. This is separate from Native linear PM compositing. Source semantics: [W3C SVG paint servers](https://www.w3.org/TR/SVG/latest/pservers.html), [W3C color interpolation](https://www.w3.org/TR/SVG/painting).

## Default font and path assets (candidate 0.4.6)

R1 scene2D now supplies the existing pro-animation font, itemizer and Clipper2 clients lazily. Authors write text({id:'title',text:'文字与路径',fontSize:34}) or ordinary paths, without building a WASM host or GPU buffers. The declared default is unchanged Noto Sans SC variable font, wght400, zh-Hans/Hani; explicit node language/script and borrowed Services2D remain available. There is no OS font lookup, network fetch, guessed glyph or automatic WASM authorization. Run font/path projects with --allow-wasm; primitives remain usable without it. R1 may snapshot admitted resource bytes before use; lazy client initialization is not zero asset-byte overhead.

For Canvas-shaped text in renderAt(c), use const drawing=scene.canvas(c), await drawing.measureText('文字',{fontSize:24}), await drawing.fillText('文字',20,60,{fontSize:24}), then scene.setRoot(drawing.snapshot()) before scene.renderAt(c,{},{}). The y argument is the actual alphabetic baseline. All calls share the scene's real default services and logical viewport. Await every text call before editing the recorder or snapshotting. text font omitted or explicitly undefined selects 'default'.

Creation: initialize one scene; use the existing FrameContext and Signal; await recording; release each returned GPU output according to the normal Stage contract. scene.dispose() drains the scene before closing its owned clients and geometry cache. Explicit typographyServices2D({typography,...}) borrows its actual provider: dispose the scene/adapter first and the provider afterwards. createDefault2DServices owns only its admitted Kit clients/font sessions/cache, borrowing R1 loader/GPU. A local native-first cancellation ponyfill neither installs globals nor grants permissions. Cancellation is cooperative between operations, not forced interruption of synchronous WASM/GPU work.

The cache stores resolved text layout/triangles only (default32MiB logical estimate, configurable); it does not cache rendered frames. Text transforms/colors remain independent. Horizontal outline text, mixed-script shaping, wrapping, actual metrics, unwrapped cluster tracking and separate fill/stroke are supported by original PA algorithms. Wrapped tracking requires an explicit PA reflow policy; fallback font lists require an explicit admitted run resolver. Vertical/color/bitmap fonts, full browser Canvas/SVG text, automatic font fallback, morph/curve services and complete browser typography are not added. Curved tight bounding boxes still require Services2D.curveFactory.

Build an immutable reviewed carrier with NATIVE2D_TYPOGRAPHY_SDK pointing to @frameweave/typography-preparation@0.1.1, NATIVE2D_DEFAULT_FONT to the pinned NotoSansSC.ttf, and NATIVE2D_FONT_LICENSE to its OFL.txt, then node --import tsx modules/native-2d/scripts/build.ts .frameweave/native-2d/my-font-candidate. It verifies the fixed Kit lock, individual JS/WASM files, font checksum and license. The runtime carries original Kit licenses and runtime/SOURCE.json. The 17,772,300-byte font is OFL-1.1; abort-controller3.0.0 and event-target-shim5.0.1 are MIT with fixed receipts in vendor/. No root dependencies or Core runtime pin are rewritten.

From this worktree, install explicitly: node --import tsx src/cli.ts packages install <candidate-directory> --project <fonts.tsx> --trust local:frameweave.native-2d-candidate --json. Use node --import tsx src/cli.ts frame <fonts.tsx> --frame 12 --output frame.png --allow-wasm --json, or render <fonts.tsx> --output fonts.mp4 --encoder libx264 --allow-wasm --json. Copy examples/fonts.tsx as the editable entry. The qualified clip is24 frames/1s. Candidate installation is project-local; Main owns formal SDK/catalog integration.

Evidence, exact commands and the single cumulative<420s campaign (including failures) are in validation/fonts/evidence/. The Node typography reference uses the fixed public preparation SDK; Native outputs use actual SpiderMonkey/WASM/Vulkan on RTX5070 Laptop. F32/F16 raw RGBA/Alpha/black/white differences are distinct from lossy H.264 decoding. No claim of general cross-machine/font/browser pixel identity is made.
