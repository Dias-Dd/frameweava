/**
 * Frameweave effect-library tour — 4 s / 3840×2160 / 60 fps. Native F32 scene + separate Servo HTML/CSS overlay.
 * 1. Animation: source Native cardFlipWipe (32-transition facade).
 * 2. Image: real managed native-image-effects@0.4.0, F32 Glow/colour/compositing.
 * 3. Spatial: wave/twist deformation + deterministic feedback particles/trails.
 * Native source imports below are intentionally explicit; they are not claimed
 * to be installed exports of the old Web-only pro-animation package.
 * Run prepare.mjs once, then use the regular Frameweave CLI.
 */
import {Composition, Stage, Layer, ref, linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {Matrix4, OrthographicCamera, WebGPUCoordinateSystem} from 'three';
import {createServo} from '../../modules/servo/index.ts';
import {processImage, processPa, processRaster} from 'native-image-effects';
import {createNativeTransitions} from '../../modules/pro-animation/src/native-transitions/index.ts';
import {createFeedbackParticles, createNativeParticleRenderer} from '../../modules/spatial-effects/native.ts';
import {twistPositions, wavePositions} from '../../modules/mesh-deformation/index.ts';
import {withGpuResources} from '../../modules/gpu-effects/resource-arena.ts';

export const tour = defineNativeStage(async init => {
  const g = init.gpu;
  const transitions = createNativeTransitions(init);
  const camera = new OrthographicCamera(-3.2, 3.2, 1.8, -1.8, .01, 20);
  camera.coordinateSystem = WebGPUCoordinateSystem;
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  // An octahedron. These immutable data seeds are created once per Stage.
  const vertices = await g.createField({type:'f32', dimensions:[6,1,1], components:3,
    semantic:'position', space:'deformation.local', units:'meter'},
    Float32Array.of(0,1.25,0, 1,0,0, 0,0,1, -1,0,0, 0,0,-1, 0,-1.25,0));
  const indices = await g.createBuffer({type:'u32', length:24},
    Uint32Array.of(0,2,1, 0,3,2, 0,4,3, 0,1,4, 5,1,2, 5,2,3, 5,3,4, 5,4,1));

  const simulation = createFeedbackParticles({fps:60, seed:703,
    rate:34, lifetime:2.8, duration:4, origin:[-1.5,-.6,.5],
    positionJitter:[.2,.15,.2], velocity:[1.1,1.2,0], velocityJitter:[.5,.5,.2],
    radius:.026, trailPoints:8, trailEverySteps:5, // 5/60 s preserves the old 2/24 s trail spacing.
    forces:[{kind:'acceleration', value:[0,-.8,0]}, {kind:'drag', coefficient:.12}],
    colliders:[{kind:'plane', id:'floor', normal:[0,1,0], offset:-1.3, restitution:.7}],
    budgets:{maxParticles:256, maxReplaySteps:1024}});
  const particles = createNativeParticleRenderer(g, {width:init.width, height:init.height,
    camera:{projection:'orthographic', position:[0,0,5], target:[0,0,0], near:.01, far:20, viewHeight:3.6},
    format:'rgba32float', maxBufferBytes:256*1024*1024});

  // Only the scene source is custom WGSL; every named effect below uses the libraries.
  const background = await g.compile({abiVersion:1, id:'tour/animated-source', version:'1.0.0',
    inputCount:0, parameterWords:2, code:`
fn pixel(p:vec2u)->vec4f {
  let size=vec2f(outputSize()); let uv=(vec2f(p)+.5)/size;
  let t=paramF32(0u); let variant=paramF32(1u);
  let q=(uv-.5)*vec2f(size.x/size.y,1.);
  let radius=length(q); let theta=atan2(q.y,q.x);
  let halo=exp(-abs(radius-(.34+.02*sin(t*2.)))*105.);
  let ray=pow(max(0.,cos(theta*8.+t)),22.)*exp(-radius*3.);
  let grid=step(.97,fract(uv.x*32.))+step(.97,fract(uv.y*18.));
  let ink=mix(vec3f(.04,.7,1.8),vec3f(1.4,.07,.8),variant);
  let color=vec3f(.007,.014,.035)+ink*(halo*.75+ray*.12+grid*.008);
  return vec4f(color,1.);
}`});

  return {
    async renderAt(c) {
      return withGpuResources(g, async a => {
        const output = {width:init.width, height:init.height, format:'rgba32float' as const,
          alpha:'premultiplied' as const, color:linear709};
        const blue = a.image(await g.run(background, [], {parameters:Float32Array.of(c.time,0), output}));
        const violet = a.image(await g.run(background, [], {parameters:Float32Array.of(c.time,1), output}));
        const twisted = a.buffer(await twistPositions(g, vertices, c, {axis:'y', rate:.55*Math.sin(c.time*1.7)}));
        const waved = a.buffer(await wavePositions(g, twisted, c, {
          direction:[0,1,0], displacement:[1,0,0], amplitude:.15, frequency:5, phase:c.time*3}));
        const rotation = new Matrix4().makeRotationY(c.time*.65);
        const matrix = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
          .multiply(rotation).toArray();
        const sculpture = a.image(await g.drawMesh({positions:waved, indices, matrix,
          color:[.08,1.2,1.9,.86], output}));
        const scene = await processRaster(sculpture, (image, fx) => fx.over(image, blue), {context:c});
        const sparks = a.image(await particles.render(simulation.sample(c), c,
          {ink:[4,.65,.12], opacity:.9, trailOpacity:.35, trailWidth:.75, fadeWithAge:true},
          {background:scene}));
        const graded = await processImage(sparks, async (image, fx) => {
          const contrast = await fx.brightnessContrast(image, {contrast:1.08, brightness:.012});
          return fx.vignette(contrast, {amount:.3, radius:.8});
        }, {context:c});
        const glowing = await processPa(graded,
          (image, fx) => fx.glow(image, {radius:15, intensity:.45, threshold:.8}), {context:c});
        const x = Math.max(0, Math.min(1, (c.time-2.2)/1.4));
        const progress = x*x*(3-2*x);
        const result = a.image(await transitions.cardFlipWipe(glowing, violet,
          {geometry:'mesh', cells:[4,3], axis:'y', stagger:.25, shading:true, progress}, c));
        return a.keep(result);
      });
    },
    async dispose() {
      particles.dispose();
      simulation.reset();
      await g.releaseBuffer(indices);
      await g.releaseBuffer(vertices);
    }
  };
});


/** Servo produces a transparent SDR UI branch. The F32 background is never
 * sent through Servo's sRGB8 input conversion. This source was not tested. */
export const servoHud = defineNativeStage(async init => {
  const ui = await createServo(init.gpu, {
    profile:'sdr-srgb8', execution:'trusted-local', input:false,
    width:init.width, height:init.height, seed:init.seed,
    html:`<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
      body{font-family:Arial,sans-serif;color:#f5faff}
      #hud{position:absolute;inset:0;opacity:0}
      .header{position:absolute;left:5vw;top:6vh}
      .kicker{font-size:.72vw;letter-spacing:.28em;color:#6eefff}
      h1{font-size:3.2vw;font-weight:700;letter-spacing:-.045em;margin:.45vw 0 .3vw}
      .subtitle{font-size:.8vw;letter-spacing:.12em;color:#b6cbdf}
      .panel{position:absolute;right:5vw;top:7vh;width:16vw;padding:1.1vw;
        background:rgba(4,13,29,.85);border:.04vw solid #2d778c;border-radius:.5vw}
      .label{font-size:.65vw;letter-spacing:.16em;color:#80e9f5}
      #time{font-size:1.8vw;font-family:monospace;margin:.4vw 0}
      #frame{font-size:.75vw;color:#a9c2d6}
      .pill{display:inline-block;margin-top:.8vw;padding:.3vw .6vw;
        border:.04vw solid #58dfe9;border-radius:1vw;font-size:.6vw;letter-spacing:.1em}
      .footer{position:absolute;left:5vw;right:5vw;bottom:6vh}
      .row{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:.8vw}
      .title{font-size:1vw;font-weight:700;letter-spacing:.08em}
      .detail{font-size:.65vw;color:#a5c8df;margin-top:.3vw}
      .spec{font-size:.8vw;letter-spacing:.15em;color:#d7f5ff}
      .track{height:.16vw;background:rgba(108,180,209,.3)}
      #fill{height:100%;width:0;background:#76f5ff}
      #phase{position:absolute;left:5vw;top:34vh;font-size:.75vw;letter-spacing:.14em;color:#e3faff}
    </style></head><body><div id="hud">
      <div class="header"><div class="kicker">FRAMEWEAVE / NATIVE MOTION</div>
        <h1 id="headline">BEYOND THE FRAME</h1>
        <div class="subtitle">GEOMETRY · PARTICLES · LIGHT · SERVO</div></div>
      <div class="panel"><div class="label">TIMELINE</div><div id="time">00:00.000</div>
        <div id="frame">FRAME 000 / 239</div><div class="pill">SERVO HTML + CSS</div></div>
      <div id="phase">01 / ENERGY FIELD</div>
      <div class="footer"><div class="row"><div><div class="title">CREATIVE SYSTEMS</div>
        <div class="detail">Native GPU scene + transparent Servo typography</div></div>
        <div class="spec">3840 × 2160 / 60 FPS</div></div>
        <div class="track"><div id="fill"></div></div></div>
    </div></body></html>`,
    javascript:`window.frameweaveRender = function(c) {
      var enter = Math.max(0, Math.min(1, c.time / .55));
      var eased = 1 - Math.pow(1 - enter, 3);
      var progress = Math.max(0, Math.min(1, c.frame / 239));
      var hud = document.getElementById('hud');
      hud.style.opacity = String(eased);
      hud.style.transform = 'translateY(' + ((1 - eased) * 50) + 'px)';
      document.getElementById('time').textContent = '00:' + c.time.toFixed(3).padStart(6, '0');
      document.getElementById('frame').textContent = 'FRAME ' + String(c.frame).padStart(3, '0') + ' / 239';
      document.getElementById('fill').style.width = String(progress * 100) + '%';
      document.getElementById('phase').textContent = c.time < 2.2 ? '01 / ENERGY FIELD' : '02 / REFRAME';
      document.getElementById('headline').textContent = c.time < 2.8 ? 'BEYOND THE FRAME' : 'WEAVE THE FUTURE';
    };`
  });
  return {
    renderAt(context) { return ui.render(undefined, {context}); },
    dispose() { return ui.dispose(); }
  };
});

export default (
  <Composition id="effects-library-tour-servo-4k60" width={3840} height={2160} fps={60}
    durationInFrames={240} seed={703} background="#02050c">
    <Stage id="tour" factory={tour} />
    <Stage id="servo-ui" factory={servoHud} />
    <Layer source={ref('tour')} />
    <Layer source={ref('servo-ui')} />
  </Composition>
);
