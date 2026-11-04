import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { buildProject } from '../src/compiler/build.ts';
import { Renderer } from '../src/render/renderer.ts';
import { renderNativeProject } from '../modules/native-gpu/service.ts';
import { ffmpegPath } from '../src/encoding/ffmpeg.ts';
const dir = resolve('artifacts/perf-frame-bindings');
await mkdir(dir, { recursive: true });
const rows = [];
for (const name of ['project-4k60', 'project-servo-4k60']) {
    const entry = 'examples/effects-library-tour/' + name + '.tsx', build = await buildProject(entry), renderer = await Renderer.create(build, { width: 320, height: 180, nativeGpu: { executable: resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'), window: true, dynamic: 'interactive', slots: 1, maxBytes: 128 * 1024 ** 2 } }), r = renderer, control = new Map();
    const read = async (frame) => { const t = await renderer.submitNativeFrame(frame); await t.completed; const index = r.nativePlan.program.passes.at(-1).output; return { scene: (await r.nativeClient.inspectForTest(t.slot, index)).pixels, display: (await r.nativeClient.inspectDisplayForTest(t.slot)).pixels }; };
    try {
        for (const frame of [168, 169, 170, 171]) {
            r.nativeFrameLayout = undefined;
            control.set(frame, await read(frame));
        }
        const initial = await renderer.nativeStats();
        for (const frame of [168, 169, 170, 171]) {
            const current = await read(frame), expected = control.get(frame);
            assert.deepEqual(current, expected, `${name} frame ${frame}: frame-local vs full-plan update`);
            const scene = Float32Array.from(current.scene), display = Float32Array.from(current.display);
            await writeFile(resolve(dir, name + '-' + frame + '-scene.f32'), Buffer.from(scene.buffer));
            await writeFile(resolve(dir, name + '-' + frame + '-display.f32'), Buffer.from(display.buffer));
        }
        const stats = await renderer.nativeStats();
        assert.equal(stats.programUpdates, initial.programUpdates);
        assert.equal(stats.frameBindings.slotUpdates - initial.frameBindings.slotUpdates, 4);
        rows.push({ name, numerical: 'scene/display finite Float32 values exactly equal, same live Servo instance, single-slot reference; multi-slot seed isolation separately tested', frames: [168, 169, 170, 171], before: initial, after: stats });
    }
    finally {
        await renderer.close();
    }
    if (name === 'project-4k60') {
        const output = resolve(dir, 'frame-slots.mp4'), media = await renderNativeProject(entry, { build, output, width: 320, height: 180, start: 18, end: 24, maxConcurrency: 2, maxBytes: 128 * 1024 ** 2, native: resolve('.frameweave/native-target/release/frameweave-native-gpu.exe'), encoder: 'h264_nvenc' });
        assert.equal(media.stats.programUpdates, 1);
        assert.ok(media.stats.frameBindings.slotUpdates >= 5);
        const bytes = execFileSync(ffmpegPath(), ['-v', 'error', '-i', output, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { windowsHide: true, maxBuffer: 4 * 1024 ** 2 });
        assert.equal(bytes.length, 320 * 180 * 4 * 6);
        rows.push({ media, decodedFrames: bytes.length / (320 * 180 * 4), decodedFormat: 'rgba8', format: '320x180 H264 NVENC, actual unchanged TSX workflow' });
    }
}
await writeFile(resolve(dir, 'numeric-and-media.json'), JSON.stringify({ version: 1, rows }, null, 2));
console.log(JSON.stringify({ ok: true, sceneCases: 2, framesPerCase: 4, exact: 'scene/display F32 equality', media: '6 actual decoded H264 frames', result: resolve(dir, 'numeric-and-media.json') }));
