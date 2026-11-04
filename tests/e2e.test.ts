import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
import { buildProject, engineRoot } from '../src/compiler/build.ts';
import { Renderer } from '../src/render/renderer.ts';
import { VideoEncoder, probeVideo } from '../src/encoding/ffmpeg.ts';
import { Composition, Stage, Rect, keyframes } from '../src/index.ts';

const exec = promisify(execFile);
const fixture = join(engineRoot, 'tests/fixtures/project.tsx');
const artifacts = join(engineRoot, '.frameweave/e2e');
async function pixels(png: Buffer) { return sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); }
async function cli(...args: string[]) {
  const { stdout } = await exec(process.execPath, ['--import', 'tsx', join(engineRoot, 'src/cli.ts'), ...args, '--json'],
    { cwd: engineRoot, timeout: 120000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  return JSON.parse(stdout);
}

test('real PNG renders nested parent transforms/opacity, explicit surface and JSON input, and stable seeking', { timeout: 120000 }, async () => {
  const build = await buildProject(fixture);
  const renderer = await Renderer.create(build, { cache: true });
  try {
    const f0 = await renderer.renderFrame(0);
    const { data, info } = await pixels(f0.png);
    assert.equal(info.width, 320); assert.equal(info.height, 180);
    const sample = (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
    assert.deepEqual(sample(5, 5), [20, 40, 60, 255]);
    const blended = sample(35, 35);
    assert.ok(Math.abs(blended[0] - 138) <= 1, `red composite ${blended}`);
    assert.ok(Math.abs(blended[1] - 20) <= 1); assert.ok(Math.abs(blended[2] - 30) <= 1);
    assert.equal(f0.stageOutputs.consumer.received, 1);
    assert.equal(f0.stageOutputs.consumer.imageWidth, 320);
    const f6 = await renderer.renderFrame(6);
    assert.equal(f6.stageOutputs.consumer.received, 7);
    assert.notDeepEqual(f6.png, f0.png);
    const repeated = await renderer.renderFrame(0);
    assert.deepEqual(repeated.png, f0.png); assert.ok(repeated.cacheHits > 0);
    const isolated = await renderer.renderFrame(0, 'foreground');
    const stage = await pixels(isolated.png);
    assert.equal(stage.data[3], 0, 'Stage-only inspection preserves transparent background');
    await assert.rejects(renderer.renderFrame(12), { code: 'E_FRAME_RANGE' });
  } finally { await renderer.close(); }
  // A new process/context and a deliberately reversed order must agree without cache.
  const fresh = await Renderer.create(build, { cache: false });
  try {
    const late = await fresh.renderFrame(6);
    const early = await fresh.renderFrame(0);
    const seq0 = await fresh.renderFrame(0);
    const seq6 = await fresh.renderFrame(6);
    assert.deepEqual(early.png, seq0.png); assert.deepEqual(late.png, seq6.png);
    assert.equal(late.stageOutputs.background.random, seq6.stageOutputs.background.random);
    assert.equal(late.stageOutputs.background.clock, seq6.stageOutputs.background.clock);
  } finally { await fresh.close(); }
});

test('PNG frames encode to a fully decodable MP4 with exact duration/size/fps/frame count', { timeout: 120000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  const build = await buildProject(fixture);
  const renderer = await Renderer.create(build);
  const path = join(artifacts, 'closed-loop.mp4');
  const encoder = await VideoEncoder.create(path, { num: 12, den: 1 }, 320, 180);
  try {
    for (let frame = 0; frame < 12; frame++) await encoder.write((await renderer.renderFrame(frame)).png);
    await encoder.finish();
    assert.deepEqual(await probeVideo(path), { width: 320, height: 180, fps: 12, duration: 1, frames: 12, decodable: true });
  } catch (error) { await encoder.abort(); throw error; }
  finally { await renderer.close(); }
});

test('CLI produces actual frame/time preview, labelled storyboard and resized/rate-converted video clip', { timeout: 120000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  const framePath = join(artifacts, 'cli-frame.png');
  const frame = await cli('frame', fixture, '--time', '.5', '--stage', 'foreground', '--output', framePath);
  assert.equal(frame.frame, 6); assert.equal((await sharp(framePath).metadata()).width, 320);
  assert.equal(JSON.parse(await readFile(`${framePath}.diagnostics.json`, 'utf8')).ok, true);
  const boardPath = join(artifacts, 'cli-board.png');
  const board = await cli('storyboard', fixture, '--frames', '0,6,11', '--width', '160', '--height', '90', '--output', boardPath);
  assert.deepEqual(board.frames, [0, 6, 11]); assert.ok((await sharp(boardPath).metadata()).width! > 480);
  const clipPath = join(artifacts, 'cli-preview.mp4');
  const preview = await cli('preview', fixture, '--from', '.25', '--to', '.75', '--fps', '6', '--width', '160', '--height', '90', '--output', clipPath);
  assert.deepEqual(preview.metadata, { width: 160, height: 90, fps: 6, duration: .5, frames: 3, decodable: true });
});

test('Future Motion genuinely renders native Three.js plus native React/PixiJS and custom TSX titles', { timeout: 120000 }, async () => {
  const build = await buildProject(join(engineRoot, 'examples/future-motion/project.tsx'));
  const renderer = await Renderer.create(build, { width: 640, height: 360, cache: false });
  try {
    const frame = await renderer.renderFrame(240);
    assert.equal(typeof frame.stageOutputs.world.pulse, 'number');
    assert.equal(frame.stageOutputs.world.phase, 'SYNCHRONIZE');
    assert.ok(frame.stageOutputs.titles.surface); assert.ok(frame.stageOutputs['native-ui'].surface);
    const { data, info } = await pixels(frame.png);
    assert.equal(info.width, 640); assert.equal(info.height, 360);
    let bright = 0, colored = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i] + data[i + 1] + data[i + 2] > 550) bright++; if (data[i + 1] > data[i] * 1.2 && data[i + 1] > 40) colored++; }
    assert.ok(bright > 1500, `Expected real typography and lit geometry, bright pixels=${bright}`);
    assert.ok(colored > 1000, `Expected teal native geometry, colored pixels=${colored}`);
    await renderer.renderFrame(0);
    const repeated = await renderer.renderFrame(240);
    assert.deepEqual(repeated.png, frame.png, 'Seeking the real multi-library project must reproduce the original composed pixels.');
  } finally { await renderer.close(); }
});

test('native renderAt receives an explicit offset and reverse rational time mapping', { timeout: 120000 }, async () => {
  const build = await buildProject(fixture);
  build.manifest.stages[0].time = { start: 0, duration: 12, offset: 10, rate: { num: -1, den: 2 } };
  const renderer = await Renderer.create(build, { cache: false });
  try {
    const result = await renderer.renderFrame(6);
    assert.equal(result.stageOutputs.background.frameValue, 7);
    assert.ok(Math.abs(Number(result.stageOutputs.background.clock) - 7 / 12 * 1000) < 1e-8);
    assert.equal(result.stageOutputs.consumer.received, 8);
  } finally { await renderer.close(); }
});

test('CLI rejects invalid arguments and emits structured error diagnostics', async () => {
  try { await cli('frame', fixture, '--frame', '0', '--unknown', 'value'); assert.fail('Expected argument failure'); }
  catch (error) {
    const e = error as { stderr?: string; code?: number };
    assert.equal(e.code, 1); assert.equal(JSON.parse(e.stderr!).diagnostics[0].code, 'E_ARGUMENT');
  }
});

test('P1 rotation, scale and opacity keyframes change actual pixels at their expected transformed positions', { timeout: 120000 }, async () => {
  await mkdir(join(engineRoot, '.frameweave'), { recursive: true });
  const dir = await mkdtemp(join(engineRoot, '.frameweave/p1-pixels-'));
  const graph = Composition({ width: 64, height: 64, fps: 10, durationInFrames: 10, background: 'transparent', children:
    Stage({ id: 'animated', children: Rect({ x: 24, y: 24, width: 16, height: 8, fill: '#ff0000',
      rotation: keyframes([{ frame: 0, value: 0 }, { frame: 9, value: 90 }]),
      scale: keyframes([{ frame: 0, value: 1 }, { frame: 9, value: 2 }]),
      opacity: keyframes([{ frame: 0, value: 1 }, { frame: 9, value: .5 }]) }) }) });
  const entry = join(dir, 'project.ts'); await writeFile(entry, `export default ${JSON.stringify(graph)}`);
  const build = await buildProject(entry), renderer = await Renderer.create(build, { cache: false });
  try {
    const first = await pixels((await renderer.renderFrame(0)).png), last = await pixels((await renderer.renderFrame(9)).png);
    const sample = (data: Buffer, x: number, y: number) => [...data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
    assert.deepEqual(sample(first.data, 36, 28), [255, 0, 0, 255]);
    assert.deepEqual(sample(last.data, 36, 28), [0, 0, 0, 0], '90-degree rotation moves the original rectangle away.');
    assert.deepEqual(sample(first.data, 12, 48), [0, 0, 0, 0]);
    const transformed = sample(last.data, 12, 48);
    assert.equal(transformed[0], 255); assert.equal(transformed[1], 0); assert.equal(transformed[2], 0);
    assert.ok(Math.abs(transformed[3] - 128) <= 1, `Expected scaled rotated rectangle at half opacity, got ${transformed}`);
  } finally { await renderer.close(); }
  const upscale = await Renderer.create(build, {width:128,height:128,cache:false});
  try {
    await upscale.renderFrame(0);
    const last = await pixels((await upscale.renderFrame(9)).png);
    const oldPosition = (56 * 128 + 72) * 4;
    assert.deepEqual([...last.data.subarray(oldPosition, oldPosition + 4)], [0,0,0,0], 'Upscaled transparent frames must clear the entire actual output, without prior-frame trails.');
  } finally { await upscale.close(); }
});
