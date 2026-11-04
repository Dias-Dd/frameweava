/** @jsxImportSource @frameweave/engine */
// FrameWeave flat TSX. Real typed code: no source capsule, eval, module restoration, or private registry.
import {defineEffect as fw_defineEffect,installStyles as fw_installStyles,type PluginManifest as FWManifest} from '@frameweave/engine/plugins';


/** JSX source: @frameweave/engine */
import { Composition as FW_0_Composition, Stage as FW_0_Stage, Layer as FW_0_Layer, Resource as FW_0_Resource, Text as FW_0_Text, Rect as FW_0_Rect, Group as FW_0_Group, ref as FW_0_ref, keyframes as FW_0_keyframes } from '@frameweave/engine';

import { PluginStage as FW_0_PluginStage, plugin as FW_0_plugin, effects as FW_0_effects } from '@frameweave/engine/plugins';

import * as FW_2_THREE from 'three';

import { GLTFLoader as FW_2_GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import type { StageFactory as FW_2_StageFactory } from '@frameweave/engine';

import { definePlugin as FW_3_definePlugin, canvasSurface as FW_3_canvasSurface } from '@frameweave/engine/plugins';

import { definePlugin as FW_4_definePlugin, canvasSurface as FW_4_canvasSurface } from '@frameweave/engine/plugins';

import { definePlugin as FW_5_definePlugin, canvasSurface as FW_5_canvasSurface } from '@frameweave/engine/plugins';

const fw_asset_ebba3388070f85269abc:string="data:application/octet-stream;base64,cHJlY2lzaW9uIGhpZ2hwIGZsb2F0Owp2YXJ5aW5nIHZlYzIgdlV2Owp1bmlmb3JtIGZsb2F0IHVfdGltZTsKdm9pZCBtYWluKCkgewogIGZsb2F0IHJhZGl1cz1sZW5ndGgodlV2LS41KTsKICBmbG9hdCBnbG93PWV4cCgtcmFkaXVzKjkuKSouMTgqKC44NSsuMTUqc2luKHVfdGltZSkpOwogIGdsX0ZyYWdDb2xvcj12ZWM0KC4xMiwuODUsLjcyLGdsb3cpOwp9Cg==";
const fw_asset_ebba3388070f85269abc_value:string="precision highp float;\nvarying vec2 vUv;\nuniform float u_time;\nvoid main() {\n  float radius=length(vUv-.5);\n  float glow=exp(-radius*9.)*.18*(.85+.15*sin(u_time));\n  gl_FragColor=vec4(.12,.85,.72,glow);\n}\n";
const fw_asset_65fd17fcbd2e2f522940:string="data:font/woff2;base64,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";
const fw_asset_9292d14a2677eb0dff18:string="data:model/gltf-binary;base64,Z2xURgIAAADcBAAAgAIAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAiLCJnZW5lcmF0b3IiOiJGcmFtZVdlYXZlIG9yaWdpbmFsIG9jdGFoZWRyb24ifSwic2NlbmUiOjAsInNjZW5lcyI6W3sibm9kZXMiOlswXX1dLCJub2RlcyI6W3sibWVzaCI6MH1dLCJtZXNoZXMiOlt7InByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjAsIk5PUk1BTCI6MX0sIm1hdGVyaWFsIjowfV19XSwibWF0ZXJpYWxzIjpbeyJwYnJNZXRhbGxpY1JvdWdobmVzcyI6eyJiYXNlQ29sb3JGYWN0b3IiOlswLjE4LDAuOCwwLjY1LDFdLCJtZXRhbGxpY0ZhY3RvciI6MC44LCJyb3VnaG5lc3NGYWN0b3IiOjAuMn19XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6NTc2fV0sImJ1ZmZlclZpZXdzIjpbeyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjAsImJ5dGVMZW5ndGgiOjI4OH0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjI4OCwiYnl0ZUxlbmd0aCI6Mjg4fV0sImFjY2Vzc29ycyI6W3siYnVmZmVyVmlldyI6MCwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjI0LCJ0eXBlIjoiVkVDMyIsIm1pbiI6Wy0xLC0xLC0xXSwibWF4IjpbMSwxLDFdfSx7ImJ1ZmZlclZpZXciOjEsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwidHlwZSI6IlZFQzMifV19QAIAAEJJTgAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAIA/AAAAAAAAAAAAAAAAAACAPwAAAAAAAIC/AAAAAAAAAAAAAAAAAAAAAAAAgD8AAAAAAACAPwAAAAAAAAAAAAAAAAAAgL8AAIC/AAAAAAAAAAAAAAAAAACAPwAAAAAAAIA/AAAAAAAAAAAAAAAAAAAAAAAAgL8AAAAAAACAvwAAAAAAAIA/AAAAAAAAAAAAAAAAAAAAAAAAgD8AAAAAAACAvwAAAAAAAAAAAAAAAAAAgD8AAIC/AAAAAAAAAAAAAAAAAACAvwAAAAAAAIC/AAAAAAAAAAAAAAAAAAAAAAAAgL8AAAAAAACAvwAAAAAAAAAAAAAAAAAAgL8AAIA/AAAAAAAAAAA6zRM/Os0TPzrNEz86zRM/Os0TPzrNEz86zRM/Os0TPzrNEz86zRO/Os0TPzrNEz86zRO/Os0TPzrNEz86zRO/Os0TPzrNEz86zRO/Os0TPzrNE786zRO/Os0TPzrNE786zRO/Os0TPzrNE786zRM/Os0TPzrNE786zRM/Os0TPzrNE786zRM/Os0TPzrNE786zRM/Os0TvzrNEz86zRM/Os0TvzrNEz86zRM/Os0TvzrNEz86zRO/Os0TvzrNEz86zRO/Os0TvzrNEz86zRO/Os0TvzrNEz86zRO/Os0TvzrNE786zRO/Os0TvzrNE786zRO/Os0TvzrNE786zRM/Os0TvzrNE786zRM/Os0TvzrNE786zRM/Os0TvzrNE78=";

export const fw_stage_0: typeof FW_2_factory = (init) => {fw_installStyles("canvas { display:block; }\n");return FW_2_factory(init);};

// Source: lib/edition.ts
const FW_1_edition = await Promise.resolve('01 / NATIVE THREE.JS     02 / SHARED PLUGIN     03 / ONE EDITABLE FILE');


// Source: project.tsx
const FW_0_fade = FW_0_keyframes([{ frame: 0, value: 0 }, { frame: 20, value: 1 }, { frame: 215, value: 1 }, { frame: 239, value: 0 }]);
const FW_0_default = <FW_0_Composition id="FrameWeave — Across Machines" width={640} height={360} fps={24} durationInFrames={240} background="#071019" seed={83}>
  <FW_0_Resource id="caption" src={fw_asset_65fd17fcbd2e2f522940} kind="font"/>
  <FW_0_Resource id="sameFont" src={fw_asset_65fd17fcbd2e2f522940} kind="font"/>
  <FW_0_Resource id="crystal" src={fw_asset_9292d14a2677eb0dff18} kind="model"/>
  <FW_0_Stage id="world" factory={fw_stage_0}/>
  <FW_0_PluginStage id="light" pipeline={[
        FW_0_plugin('example.energy-vortex@1.0.0', { radius: 110, arms: 7, speed: .6, color: '#65d8d2' }),
        FW_0_effects.displacement({ amount: 2.5, frequency: 7, speed: .7 }),
        FW_0_effects.glow({ intensity: 1.3, radius: 6, threshold: .45 }),
    ]}/>
  <FW_0_Stage id="editorial"><FW_0_Group opacity={FW_0_fade}>
    <FW_0_Text x={32} y={24} content="FRAMEWEAVE / PORTABLE EDITION" fontFamily="caption" fontSize={10} letterSpacing={1.3} fill="#8bb6b5"/>
    <FW_0_Rect x={32} y={94} width={32} height={2} fill="#75e7d1"/>
    <FW_0_Text x={32} y={112} content="IDEAS" fontFamily="caption" fontSize={46} fontWeight={600} fill="#e2fff4"/>
    <FW_0_Text x={32} y={162} content="TRAVEL." fontFamily="caption" fontSize={46} fontWeight={600} fill="#e2fff4"/>
    <FW_0_Text x={35} y={225} content="CODE. LIGHT. EVERYWHERE." fontFamily="caption" fontSize={10} letterSpacing={1.1} fill="#a0c9c7"/>
    <FW_0_Rect x={32} y={310} width={576} height={1} fill="#21434b"/>
    <FW_0_Rect x={32} y={310} width={FW_0_keyframes([{ frame: 0, value: 0 }, { frame: 239, value: 576 }])} height={2} fill="#78e1d3"/>
    <FW_0_Text x={32} y={326} content={FW_1_edition} fontFamily="caption" fontSize={8} letterSpacing={1} fill="#8faeb1"/>
  </FW_0_Group></FW_0_Stage>
  <FW_0_Layer source={FW_0_ref('world')}/><FW_0_Layer source={FW_0_ref('light')} opacity={.28}/><FW_0_Layer source={FW_0_ref('editorial')}/>
</FW_0_Composition>;


// Source: stages/world.ts
const FW_2_factory: FW_2_StageFactory = async (init) => {
    const renderer = new FW_2_THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(init.pixelRatio ?? 1);
    renderer.setSize(init.width, init.height);
    init.container.append(renderer.domElement);
    const scene = new FW_2_THREE.Scene(), camera = new FW_2_THREE.PerspectiveCamera(36, init.width / init.height, .1, 100);
    camera.position.z = 8;
    const group = new FW_2_THREE.Group();
    group.position.x = 1.8;
    scene.add(group);
    const ring = new FW_2_THREE.Mesh(new FW_2_THREE.TorusGeometry(1.1, .012, 8, 100), new FW_2_THREE.MeshBasicMaterial({ color: '#63e4cf' }));
    group.add(ring);
    const second = ring.clone();
    second.scale.setScalar(1.2);
    second.rotation.x = .9;
    group.add(second);
    const loaded = await new FW_2_GLTFLoader().loadAsync(init.resources.crystal);
    const crystal = loaded.scene;
    crystal.scale.setScalar(.8);
    group.add(crystal);
    scene.add(new FW_2_THREE.AmbientLight('#8ec9dd', 2));
    const lamp = new FW_2_THREE.PointLight('#65e9d5', 30);
    lamp.position.set(2, 3, 4);
    scene.add(lamp);
    const halo = new FW_2_THREE.Mesh(new FW_2_THREE.PlaneGeometry(4, 4), new FW_2_THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { u_time: { value: 0 } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: fw_asset_ebba3388070f85269abc_value }));
    halo.position.z = -.6;
    group.add(halo);
    return { renderAt(time) { group.rotation.y = .15 + time.time * .18; ring.rotation.z = time.time * .3; second.rotation.y = time.time * .25; crystal.rotation.set(time.time * .25, time.time * .45, .2); (halo.material as FW_2_THREE.ShaderMaterial).uniforms.u_time.value = time.time; renderer.render(scene, camera); }, dispose() { scene.traverse(o => { if (o instanceof FW_2_THREE.Mesh) {
            o.geometry.dispose();
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            for (const material of materials)
                material.dispose();
        } }); renderer.dispose(); renderer.domElement.remove(); } };
};
const FW_2_default = FW_2_factory;


// Source: modules/example.energy-vortex@1.0.0/index.ts
interface FW_3_Params {
    radius: number;
    arms: number;
    turns: number;
    speed: number;
    color: string;
    seed: number;
}
const FW_3_default = FW_3_definePlugin<FW_3_Params>({ kind: 'generator', create(init) {
        const surface = FW_3_canvasSurface(init), ctx = surface.context, { width: w, height: h } = init;
        return { render(time, _inputs, p) {
                surface.clear();
                const r = Math.min(h * .44, p.radius * init.pixelRatio), x = w * .67, y = h * .49, t = time.time * p.speed;
                const reveal = Math.min(1, Math.max(0, time.time / 1.4));
                const aura = ctx.createRadialGradient(x, y, 0, x, y, r * 1.55);
                aura.addColorStop(0, '#183335');
                aura.addColorStop(.5, '#0b171e');
                aura.addColorStop(1, '#081019');
                ctx.fillStyle = '#081019';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = aura;
                ctx.fillRect(0, 0, w, h);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(-.16);
                ctx.globalCompositeOperation = 'lighter';
                for (let arm = 0; arm < p.arms; arm++) {
                    const gradient = ctx.createLinearGradient(-r, -r, r, r);
                    gradient.addColorStop(0, '#343a5c');
                    gradient.addColorStop(.45, p.color);
                    gradient.addColorStop(.72, '#d9fff5');
                    gradient.addColorStop(1, '#305389');
                    ctx.strokeStyle = gradient;
                    ctx.lineWidth = (1.1 + arm % 3 * .45) * init.pixelRatio;
                    ctx.globalAlpha = reveal * .8;
                    ctx.beginPath();
                    for (let i = 0; i <= 180; i++) {
                        const q = i / 180, a = q * Math.PI * 2 * p.turns + arm * Math.PI * 2 / p.arms + t + (p.seed % 31) * .01, rr = r * (.1 + .9 * q) * (.4 + .6 * reveal), z = Math.sin(a + t * .3), px = Math.cos(a) * rr, py = Math.sin(a) * rr * .66 + Math.sin(q * 8 - t) * r * .075;
                        if (i === 0)
                            ctx.moveTo(px, py);
                        else
                            ctx.lineTo(px, py);
                        if (i === 180) {
                            ctx.stroke();
                            ctx.fillStyle = p.color;
                            ctx.beginPath();
                            ctx.arc(px, py, Math.max(1.2, 2.8 + z) * init.pixelRatio, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }
                for (let ring = 0; ring < 3; ring++) {
                    ctx.globalAlpha = .12;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = init.pixelRatio * .7;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, r * (1.03 + ring * .1), r * (.8 + ring * .09), t * .05 + ring * .2, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.globalAlpha = reveal;
                const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * .2);
                core.addColorStop(0, '#e6fff8');
                core.addColorStop(.2, p.color);
                core.addColorStop(1, '#00000000');
                ctx.fillStyle = core;
                ctx.beginPath();
                ctx.arc(0, 0, r * .2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return { image: surface.canvas };
            }, dispose: surface.dispose };
    } });


// Source: ../../../../plugins/builtin/displacement/index.ts
interface FW_4_P {
    amount: number;
    frequency: number;
    speed: number;
    seed: number;
}
const FW_4_default = FW_4_definePlugin<FW_4_P>({ kind: 'image-effect', create(init) {
        const out = FW_4_canvasSurface(init, true), source = FW_4_canvasSurface(init, true), w = init.width, h = init.height;
        return { render(time, inputs, p) {
                out.clear();
                source.clear();
                source.context.drawImage(inputs.image as HTMLCanvasElement, 0, 0);
                if (p.amount === 0) {
                    out.context.drawImage(source.canvas, 0, 0);
                    return { image: out.canvas };
                }
                const a = source.context.getImageData(0, 0, w, h).data, image = out.context.createImageData(w, h), b = image.data, t = time.time * p.speed, amp = p.amount * init.pixelRatio;
                const xs = new Float64Array(w);
                for (let x = 0; x < w; x++)
                    xs[x] = Math.sin(x / w * p.frequency * 6.283 + t + p.seed * .13);
                for (let y = 0; y < h; y++) {
                    const wave = Math.sin(y / h * p.frequency * 4.2 - t * .7 + p.seed * .31);
                    for (let x = 0; x < w; x++) {
                        const xx = Math.max(0, Math.min(w - 1, Math.round(x + amp * wave * xs[x]))), yy = Math.max(0, Math.min(h - 1, Math.round(y + amp * xs[x] * .6))), from = (yy * w + xx) * 4, to = (y * w + x) * 4;
                        b[to] = a[from];
                        b[to + 1] = a[from + 1];
                        b[to + 2] = a[from + 2];
                        b[to + 3] = a[from + 3];
                    }
                }
                out.context.putImageData(image, 0, 0);
                return { image: out.canvas };
            }, dispose() { out.dispose(); source.dispose(); } };
    } });


// Source: ../../../../plugins/builtin/glow/index.ts
interface FW_5_P {
    intensity: number;
    threshold: number;
    radius: number;
}
const FW_5_default = FW_5_definePlugin<FW_5_P>({ kind: 'image-effect', create(init) {
        const out = FW_5_canvasSurface(init), bright = FW_5_canvasSurface(init, true);
        return { render(_time, inputs, p) {
                out.clear();
                bright.clear();
                const image = inputs.image as HTMLCanvasElement;
                out.context.drawImage(image, 0, 0);
                if (p.intensity === 0 || p.radius === 0)
                    return { image: out.canvas };
                bright.context.drawImage(image, 0, 0);
                const pixels = bright.context.getImageData(0, 0, init.width, init.height), d = pixels.data;
                for (let i = 0; i < d.length; i += 4) {
                    const l = (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255;
                    d[i + 3] = Math.round(d[i + 3] * Math.max(0, Math.min(1, (l - p.threshold) / Math.max(.001, 1 - p.threshold))));
                }
                bright.context.putImageData(pixels, 0, 0);
                const c = out.context;
                c.globalCompositeOperation = 'screen';
                c.filter = 'blur(' + p.radius * init.pixelRatio + 'px)';
                for (let amount = p.intensity; amount > 0; amount -= 1) {
                    c.globalAlpha = Math.min(1, amount);
                    c.drawImage(bright.canvas, 0, 0);
                }
                return { image: out.canvas };
            }, dispose() { out.dispose(); bright.dispose(); } };
    } });


const fw_manifest_0:FWManifest={
  "schemaVersion": 1,
  "apiVersion": 1,
  "id": "example.energy-vortex",
  "name": "Energy Vortex",
  "version": "1.0.0",
  "kind": "generator",
  "engine": "web",
  "compatible": "^0.1.0",
  "description": "程序化能量漩涡 / cinematic procedural luminous energy vortex; deterministic absolute-time spirals",
  "tags": [
    "energy",
    "vortex",
    "cinematic",
    "glowing",
    "漩涡",
    "能量"
  ],
  "parameters": {
    "radius": {
      "type": "number",
      "default": 180,
      "minimum": 1,
      "maximum": 1000
    },
    "arms": {
      "type": "number",
      "default": 7,
      "minimum": 1,
      "maximum": 24,
      "integer": true
    },
    "turns": {
      "type": "number",
      "default": 2.5,
      "minimum": 0.1,
      "maximum": 8
    },
    "speed": {
      "type": "number",
      "default": 0.8,
      "minimum": -5,
      "maximum": 5
    },
    "color": {
      "type": "string",
      "default": "#54e8e4"
    },
    "seed": {
      "type": "number",
      "default": 17,
      "minimum": 0,
      "maximum": 2147483647,
      "integer": true
    }
  },
  "inputs": {},
  "outputs": {
    "image": "image"
  },
  "examples": [
    "plugin('example.energy-vortex@1.0.0',{radius:180,color:'#54e8e4'})"
  ]
};
export const fw_effect_0=fw_defineEffect(fw_manifest_0,FW_3_default);
const fw_manifest_1:FWManifest={
  "schemaVersion": 1,
  "apiVersion": 1,
  "id": "fw.displacement",
  "name": "Animated Wave Displacement",
  "version": "1.0.0",
  "kind": "image-effect",
  "engine": "web",
  "compatible": "^0.1.0",
  "description": "Deterministic time-varying seeded displacement field; CPU RGBA sampling with exact identity at amount zero 位移",
  "parameters": {
    "amount": {
      "type": "number",
      "default": 7,
      "minimum": 0,
      "maximum": 100
    },
    "frequency": {
      "type": "number",
      "default": 9,
      "minimum": 0.1,
      "maximum": 80
    },
    "speed": {
      "type": "number",
      "default": 0.8,
      "minimum": -10,
      "maximum": 10
    },
    "seed": {
      "type": "number",
      "default": 3,
      "minimum": 0,
      "maximum": 2147483647,
      "integer": true
    }
  },
  "inputs": {
    "image": "image"
  },
  "outputs": {
    "image": "image"
  },
  "tags": [
    "displacement",
    "web",
    "cinematic"
  ]
};
export const fw_effect_1=fw_defineEffect(fw_manifest_1,FW_4_default);
const fw_manifest_2:FWManifest={
  "schemaVersion": 1,
  "apiVersion": 1,
  "id": "fw.glow",
  "name": "Threshold Bloom / Glow",
  "version": "1.0.0",
  "kind": "image-effect",
  "engine": "web",
  "compatible": "^0.1.0",
  "description": "Luminance threshold extraction and Chromium native Gaussian blur; luminous glow 辉光",
  "parameters": {
    "intensity": {
      "type": "number",
      "default": 1.3,
      "minimum": 0,
      "maximum": 5
    },
    "threshold": {
      "type": "number",
      "default": 0.45,
      "minimum": 0,
      "maximum": 1
    },
    "radius": {
      "type": "number",
      "default": 12,
      "minimum": 0,
      "maximum": 64
    }
  },
  "inputs": {
    "image": "image"
  },
  "outputs": {
    "image": "image"
  },
  "tags": [
    "glow",
    "web",
    "cinematic"
  ]
};
export const fw_effect_2=fw_defineEffect(fw_manifest_2,FW_5_default);



export default FW_0_default;


/* Included license: modules/example.energy-vortex@1.0.0/LICENSE
Apache License

Version 2.0, January 2004

http://www.apache.org/licenses/ 

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction, and distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by the copyright owner that is granting the License.

"Legal Entity" shall mean the union of the acting entity and all other entities that control, are controlled by, or are under common control with that entity. For the purposes of this definition, "control" means (i) the power, direct or indirect, to cause the direction or management of such entity, whether by contract or otherwise, or (ii) ownership of fifty percent (50%) or more of the outstanding shares, or (iii) beneficial ownership of such entity.

"You" (or "Your") shall mean an individual or Legal Entity exercising permissions granted by this License.

"Source" form shall mean the preferred form for making modifications, including but not limited to software source code, documentation source, and configuration files.

"Object" form shall mean any form resulting from mechanical transformation or translation of a Source form, including but not limited to compiled object code, generated documentation, and conversions to other media types.

"Work" shall mean the work of authorship, whether in Source or Object form, made available under the License, as indicated by a copyright notice that is included in or attached to the work (an example is provided in the Appendix below).

"Derivative Works" shall mean any work, whether in Source or Object form, that is based on (or derived from) the Work and for which the editorial revisions, annotations, elaborations, or other modifications represent, as a whole, an original work of authorship. For the purposes of this License, Derivative Works shall not include works that remain separable from, or merely link (or bind by name) to the interfaces of, the Work and Derivative Works thereof.

"Contribution" shall mean any work of authorship, including the original version of the Work and any modifications or additions to that Work or Derivative Works thereof, that is intentionally submitted to Licensor for inclusion in the Work by the copyright owner or by an individual or Legal Entity authorized to submit on behalf of the copyright owner. For the purposes of this definition, "submitted" means any form of electronic, verbal, or written communication sent to the Licensor or its representatives, including but not limited to communication on electronic mailing lists, source code control systems, and issue tracking systems that are managed by, or on behalf of, the Licensor for the purpose of discussing and improving the Work, but excluding communication that is conspicuously marked or otherwise designated in writing by the copyright owner as "Not a Contribution."

"Contributor" shall mean Licensor and any individual or Legal Entity on behalf of whom a Contribution has been received by Licensor and subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare Derivative Works of, publicly display, publicly perform, sublicense, and distribute the Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable (except as stated in this section) patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer the Work, where such license applies only to those patent claims licensable by such Contributor that are necessarily infringed by their Contribution(s) alone or by combination of their Contribution(s) with the Work to which such Contribution(s) was submitted. If You institute patent litigation against any entity (including a cross-claim or counterclaim in a lawsuit) alleging that the Work or a Contribution incorporated within the Work constitutes direct or contributory patent infringement, then any patent licenses granted to You under this License for that Work shall terminate as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the Work or Derivative Works thereof in any medium, with or without modifications, and in Source or Object form, provided that You meet the following conditions:

You must give any other recipients of the Work or Derivative Works a copy of this License; and

You must cause any modified files to carry prominent notices stating that You changed the files; and

You must retain, in the Source form of any Derivative Works that You distribute, all copyright, patent, trademark, and attribution notices from the Source form of the Work, excluding those notices that do not pertain to any part of the Derivative Works; and

If the Work includes a "NOTICE" text file as part of its distribution, then any Derivative Works that You distribute must include a readable copy of the attribution notices contained within such NOTICE file, excluding those notices that do not pertain to any part of the Derivative Works, in at least one of the following places: within a NOTICE text file distributed as part of the Derivative Works; within the Source form or documentation, if provided along with the Derivative Works; or, within a display generated by the Derivative Works, if and wherever such third-party notices normally appear. The contents of the NOTICE file are for informational purposes only and do not modify the License. You may add Your own attribution notices within Derivative Works that You distribute, alongside or as an addendum to the NOTICE text from the Work, provided that such additional attribution notices cannot be construed as modifying the License. You may add Your own copyright statement to Your modifications and may provide additional or different license terms and conditions for use, reproduction, or distribution of Your modifications, or for any such Derivative Works as a whole, provided Your use, reproduction, and distribution of the Work otherwise complies with the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise, any Contribution intentionally submitted for inclusion in the Work by You to the Licensor shall be under the terms and conditions of this License, without any additional terms or conditions. Notwithstanding the above, nothing herein shall supersede or modify the terms of any separate license agreement you may have executed with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade names, trademarks, service marks, or product names of the Licensor, except as required for reasonable and customary use in describing the origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or agreed to in writing, Licensor provides the Work (and each Contributor provides its Contributions) on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied, including, without limitation, any warranties or conditions of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE. You are solely responsible for determining the appropriateness of using or redistributing the Work and assume any risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory, whether in tort (including negligence), contract, or otherwise, unless required by applicable law (such as deliberate and grossly negligent acts) or agreed to in writing, shall any Contributor be liable to You for damages, including any direct, indirect, special, incidental, or consequential damages of any character arising as a result of this License or out of the use or inability to use the Work (including but not limited to damages for loss of goodwill, work stoppage, computer failure or malfunction, or any and all other commercial damages or losses), even if such Contributor has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing the Work or Derivative Works thereof, You may choose to offer, and charge a fee for, acceptance of support, warranty, indemnity, or other liability obligations and/or rights consistent with this License. However, in accepting such obligations, You may act only on Your own behalf and on Your sole responsibility, not on behalf of any other Contributor, and only if You agree to indemnify, defend, and hold each Contributor harmless for any liability incurred by, or claims asserted against, such Contributor by reason of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

*/
/* Included license: assets/OFL.txt
Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.

*/