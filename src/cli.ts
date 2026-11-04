import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp, { type OverlayOptions } from 'sharp';
import { buildProject } from './compiler/build.ts';
import { Renderer } from './render/renderer.ts';
import {assertSharedExecution} from '../modules/shared-state/execution-host.ts';
import { VideoEncoder, probeVideo } from './encoding/ffmpeg.ts';
import { EngineError, diagnostic } from './core/errors.ts';
import type { Diagnostic, Rational, RenderedFrame } from './core/types.ts';
import {effectsCLI} from './plugins/cli.ts';
import {exportCLI} from './compiler/export.ts';
import {initProject,workflowInfo} from './workflow.ts';
import {nativeMediaCLI} from '../modules/native-gpu/cli.ts';
import {packagesCLI} from './packages/cli.ts';
import {runCapabilitiesCLI} from './capabilities/cli.ts';
import {analysisCLI} from './analysis-tools/cli.ts';
import {isAudioBlock} from './audio/block.ts';
import {writeCLIResult,cliHumanOutput,cliJSONRequested,writeCLIProgress} from './cli-output.ts';

type Flags = Record<string, string | boolean>;
const help = `FrameWeave 0.1 — trusted-code video development environment

  frameweave media capabilities --json
  frameweave media render <project.tsx> --settings professional.json --output hdr.mp4 --json
  frameweave inspect <project.tsx> [--frames 0,6,12] [--storyboard] --json
  frameweave inspect compare --before <inspection-directory> --after <inspection-directory> --json
  frameweave build <project.tsx>
  frameweave create <project.tsx> --output image.png|audio.wav|video.mp4 [--format png|wav|mp4|mov] [--json]
  frameweave <project.tsx> [--width 640] [--adaptive | --quality-scale 0.5] [--native <executable>] [--no-open]
  frameweave init <new-project-directory>
  frameweave workflow
  frameweave frame <project.tsx> --frame 240 --output frame.png
  frameweave frame <project.tsx> --time 4 --output scene.exr
  frameweave storyboard <project.tsx> --frames 0,60,180,300,450,599 --output storyboard.png
  frameweave preview <project.tsx> --from 2 --to 4 --width 960 --output preview.mp4
  frameweave render <project.tsx> --output video.mp4
  frameweave diagnose <project.tsx> [--frame 0] [--stage world]
  frameweave probe <video.mp4>
  frameweave analyze list|run|status|cancel|inspect|sample|sample-batch|preview [--json]
  frameweave session <project.tsx> [--frames 12,0,6,0] [--repeat 2] [--output directory]
  frameweave repl
  frameweave packages install <name|local-package> [--catalog directory] [--project <entry>] --trust local:authority
  frameweave packages restore <local-catalog> --project <entry>
  frameweave packages uninstall <id> --project <entry>
  frameweave packages list|verify|inspect|types [--project <entry>]
  frameweave effects list [--project <project.tsx>]
  frameweave capabilities search "intent" [--project <entry>] [--include-low-level] [--limit N] [--offset N] [--json]
  frameweave capabilities inspect <id@version> --project <entry> --json
  frameweave capabilities examples <id@version> --json
  frameweave effects search "cinematic glowing particles" [--include-low-level]
  frameweave effects info <id@version>
  frameweave effects validate <plugin-directory>
  frameweave effects install <trusted-local-plugin-directory> --project <project.tsx>
  frameweave effects lock --project <project.tsx>
  frameweave effects create <new-directory> --id author.effect
  frameweave effects install <trusted-local-plugin-directory> --global
  frameweave effects index [--offline]
  frameweave effects search "发光的粒子" --mode hybrid --limit 5 --offline
  frameweave export <project.tsx> --output <directory>
  frameweave export <project.tsx> --single-file --output <chosen-name.tsx>
  Export policies: --sources merge|preserve --modules merge|copy|external --assets embed|copy|external

Distribution: frameweave --version | doctor --json
Options: --height N --json --no-cache --timeout 15000 --allow-wasm
WASM is disabled by default. --allow-wasm permits WASM compilation in the isolated SpiderMonkey host; Servo WASM remains unavailable.
Direct TSX uses the Forge native GPU window. Use defineNativeStage for native visuals.
HTML/CSS content runs through the optional Servo module inside Native Stages.
The former Web Stage and Chromium host are removed.
The old HTTP preview/player is removed; native-only graphs have no PNG bridge.
JS/React control logic runs in the isolated SpiderMonkey host and submits native GPU commands.
Preview quality flags enable proxy playback in the native window. Pause and scrub release restore exact preview quality.
Use --checkpoint-interval and --checkpoint-mib to tune stateful preview checkpoint retention.
Frame/storyboard/render use native GPU. MP4 defaults to h264_nvenc; --encoder also accepts hevc_nvenc, av1_nvenc, libx264, libx265, libaom-av1.
Accurate EXR/HDR delivery: render/frame --settings professional.json; WASM remains explicitly authorized with --allow-wasm.
--max-concurrency 128 --initial-concurrency 8 --memory-mib 1024 bound dynamic native frame slots.
Professional media/create/inspect/session retain their separate existing services during migration.
Time arguments use seconds; frame ranges are zero based and end exclusive.
Each PNG/video has a .diagnostics.json sidecar with actual diagnostics.
`;
function parse(args: string[]): { command: string; target: string; flags: Flags } {
  const [command = 'help', target = '', ...rest] = args;
  const flags: Flags = {};
  const supported = new Set(['frame', 'time', 'stage', 'output', 'frames', 'times', 'from', 'to', 'width', 'height', 'fps', 'json', 'no-cache', 'timeout', 'allow-wasm']);
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].replace(/^--/, '');
    if (!rest[i].startsWith('--') || !supported.has(key)) throw new EngineError('E_ARGUMENT', `Unknown argument ${rest[i]}`);
    if (['json', 'no-cache', 'allow-wasm'].includes(key)) flags[key] = true;
    else {
      const value = rest[++i];
      if (value === undefined || value.startsWith('--')) throw new EngineError('E_ARGUMENT', `--${key} needs a value.`);
      flags[key] = value;
    }
  }
  return { command, target, flags };
}
function number(flags: Flags, key: string, fallback: number): number {
  const n = flags[key] === undefined ? fallback : Number(flags[key]);
  if (!Number.isFinite(n)) throw new EngineError('E_ARGUMENT', `--${key} must be finite.`);
  return n;
}
function output(flags: Flags, fallback: string): string { return resolve(String(flags.output ?? fallback)); }
async function save(path: string, data: string | Buffer): Promise<void> { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data); }
function stripSurface(frame: RenderedFrame) {
  return Object.fromEntries(Object.entries(frame.stageOutputs).map(([stage, ports]) => [stage, Object.fromEntries(Object.entries(ports).map(([port, value]) =>
    [port, value && typeof value === 'object' && 'kind' in value && value.kind === 'surface' ? { ...value, dataUrl: '[PNG surface bytes omitted]' } : isAudioBlock(value)?{...value,storage:{...value.storage,data:'[binary PCM omitted]'}}:value]))]));
}
function uniqDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const map = new Map<string, Diagnostic>();
  for (const d of diagnostics) map.set(`${d.code}:${d.stageId}:${d.message}`, d);
  return [...map.values()];
}
function escapeXml(text: string): string { return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }

export async function main(args = process.argv.slice(2)): Promise<unknown> {
  if(args[0]==='create'){const result=await (await import('./authoring-tools/cli.ts')).creationCLI(args.slice(1));writeCLIResult(result);return result;}
  if(args[0]==='capabilities')return runCapabilitiesCLI(args.slice(1));
  if(args[0]==='inspect')return (await import('../modules/render-inspection/cli.ts')).inspectionCLI(args.slice(1));
  if(args[0]&&/\.(?:[cm]?[jt]sx?|json)$/i.test(args[0])||['frame','storyboard','preview','render'].includes(args[0]))return nativeMediaCLI(args);
  if(args[0]==='init'||args[0]==='workflow'){const result=args[0]==='init'?await initProject(args.slice(1)):workflowInfo();writeCLIResult(result);return result;}
  if(args[0]==='export'){const result=await exportCLI(args.slice(1));writeCLIResult(result);return result;}
  if(args[0]==='packages'){const result=await packagesCLI(args.slice(1));writeCLIResult(result);return result;}
  if(args[0]==='effects'){const result=await effectsCLI(args.slice(1));writeCLIResult(result);return result;}
  if(args[0]==='analyze'){const result=await analysisCLI(args.slice(1));writeCLIResult(result);return result;}
  const { command, target, flags } = parse(args);
  if (['help', '--help', '-h'].includes(command)) { if(cliJSONRequested())return writeCLIResult({ok:true,help});console.log(help); return; }
  if (!['build', 'frame', 'storyboard', 'preview', 'render', 'diagnose', 'probe'].includes(command)) throw new EngineError('E_ARGUMENT', `Unknown command ${command}`);
  if (!target) throw new EngineError('E_ARGUMENT', 'A project entry or video file is required.');
  const report = (value: unknown) => { writeCLIResult(value); return value; };
  if (command === 'probe') return report(await probeVideo(target));
  const log = (text: string) => { if (cliHumanOutput()) console.error(text); };
  writeCLIProgress('正在编译工程：'+resolve(target));
  const build = await buildProject(target);
  if (command === 'build') return report({ ok: true, manifest: `${build.dir}/tvg.json`, hash: build.hash,
    stages: build.manifest.stages.map(s => ({ id: s.id, engine: s.engine, outputs: s.outputs })) });
  if (command === 'diagnose' && flags.frame === undefined && flags.time === undefined) {
    return report({ ok: true, buildHash: build.hash, diagnostics: [], note: 'Build/structure/resource checks only. Supply --frame to execute visual checks.' });
  }
  if(['render','preview'].includes(command)&&build.manifest.layers.some(l=>l.source&&build.manifest.stages.find(s=>s.id===l.source!.$ref)?.outputs[l.source.port]==='audio'))
    throw new EngineError('E_AUDIO_COMMAND','This legacy visual command does not mux placed audio. Use frameweave create <project> --output file.wav|file.mp4|file.mov.');
  const composition = build.manifest.composition;
  const sourceFps = composition.fps.num / composition.fps.den;
  const width = number(flags, 'width', flags.height === undefined ? composition.width : Math.round(composition.width * number(flags, 'height', composition.height) / composition.height));
  const height = number(flags, 'height', Math.round(composition.height * width / composition.width));
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) throw new EngineError('E_ARGUMENT', 'Dimensions must be positive integers >= 2.');
  assertSharedExecution(build.manifest.stages);
  const renderer = await Renderer.create(build, { width, height, cache: !flags['no-cache'],
    timeoutMs: number(flags, 'timeout', 20000), onLog: log, allowWasm:flags['allow-wasm']===true });
  let encoder: VideoEncoder | undefined;
  let cancelled = false;
  const cancel = () => { cancelled = true; };
  process.once('SIGINT', cancel);
  try {
    if (command === 'frame' || command === 'diagnose') {
      if (flags.frame !== undefined && flags.time !== undefined) throw new EngineError('E_ARGUMENT', 'Choose --frame or --time.');
      const frame = flags.time === undefined ? number(flags, 'frame', 0) : Math.round(number(flags, 'time', 0) * sourceFps);
      const result = await renderer.renderFrame(frame, typeof flags.stage === 'string' ? flags.stage : undefined);
      const path = output(flags, `artifacts/${flags.stage ?? 'frame'}-${frame}.png`);
      await save(path, result.png);
      const details = { ok: true, frame, time: frame / sourceFps, output: path, diagnostics: result.diagnostics,
        stageOutputs: stripSurface(result), cacheHits: result.cacheHits };
      await save(`${path}.diagnostics.json`, JSON.stringify(details, null, 2));
      return report(details);
    }
    if (command === 'storyboard') {
      if (flags.frames && flags.times) throw new EngineError('E_ARGUMENT', 'Choose --frames or --times.');
      const defaultFrames = [0, .1, .3, .5, .75, 1].map(p => Math.round((composition.durationInFrames - 1) * p));
      const frames = flags.times ? String(flags.times).split(',').map(n => Math.round(Number(n) * sourceFps)) :
        flags.frames ? String(flags.frames).split(',').map(Number) : defaultFrames;
      if (!frames.length || frames.length > 48 || frames.some(n => !Number.isInteger(n))) throw new EngineError('E_ARGUMENT', 'Supply 1–48 valid integer frames.');
      const thumbW = Math.min(640, width), thumbH = Math.round(thumbW * height / width);
      const margin = 18, labelH = 38, headerH = 76, columns = Math.min(3, frames.length), rows = Math.ceil(frames.length / columns);
      const boardW = margin + columns * (thumbW + margin), boardH = headerH + margin + rows * (thumbH + labelH + margin);
      const labels = [`<rect width="100%" height="100%" fill="#0b1020"/><text x="18" y="32" fill="#ffffff" font-size="24" font-family="sans-serif">${escapeXml(composition.id)} / STORYBOARD</text>`,
        `<text x="18" y="56" fill="#9baabe" font-size="14" font-family="sans-serif">${composition.width} × ${composition.height} · ${sourceFps} FPS · actual rendered frames</text>`];
      const images: OverlayOptions[] = [];
      const diagnostics: Diagnostic[] = [];
      for (let i = 0; i < frames.length; i++) {
        if (cancelled) throw new EngineError('E_CANCELLED', 'Rendering cancelled.');
        const result = await renderer.renderFrame(frames[i]);
        diagnostics.push(...result.diagnostics);
        const left = margin + (i % columns) * (thumbW + margin), top = headerH + margin + Math.floor(i / columns) * (thumbH + labelH + margin);
        images.push({ input: await sharp(result.png).resize(thumbW, thumbH).png().toBuffer(), left, top });
        labels.push(`<text x="${left}" y="${top + thumbH + 25}" fill="#c2d3e8" font-size="15" font-family="sans-serif">FRAME ${frames[i]} / ${(frames[i] / sourceFps).toFixed(3)} s</text>`);
        log(`Storyboard ${i + 1}/${frames.length}: frame ${frames[i]}`);
      }
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boardW}" height="${boardH}">${labels.join('')}</svg>`);
      const png = await sharp(svg).composite(images).png().toBuffer();
      const path = output(flags, 'artifacts/storyboard.png');
      await save(path, png);
      const details = { ok: true, output: path, frames, diagnostics: uniqDiagnostics(diagnostics) };
      await save(`${path}.diagnostics.json`, JSON.stringify(details, null, 2));
      return report(details);
    }
    const duration = composition.durationInFrames / sourceFps;
    const from = command === 'preview' ? number(flags, 'from', 0) : 0;
    const to = command === 'preview' ? number(flags, 'to', Math.min(duration, from + 2)) : duration;
    const outFps = number(flags, 'fps', command === 'preview' ? Math.min(30, sourceFps) : sourceFps);
    if (from < 0 || to > duration || to <= from || outFps <= 0 || outFps > 240) throw new EngineError('E_TIME_RANGE', 'Preview needs 0 <= from < to <= duration and 0 < fps <= 240.');
    const rational: Rational = flags.fps === undefined && command === 'render' ? composition.fps : { num: Math.round(outFps * 1000), den: 1000 };
    const count = Math.round((to - from) * outFps);
    if (count < 1) throw new EngineError('E_TIME_RANGE', 'The selected range contains no output frames.');
    const path = output(flags, command === 'preview' ? 'artifacts/preview.mp4' : 'artifacts/video.mp4');
    encoder = await VideoEncoder.create(path, rational, width, height);
    const diagnostics: Diagnostic[] = [];
    const started = Date.now();
    for (let i = 0; i < count; i++) {
      if (cancelled) throw new EngineError('E_CANCELLED', 'Rendering cancelled.');
      const sourceFrame = Math.min(composition.durationInFrames - 1, Math.round((from + i / outFps) * sourceFps));
      const result = await renderer.renderFrame(sourceFrame);
      diagnostics.push(...result.diagnostics);
      await encoder.write(result.png);
      if (i === 0 || (i + 1) % 30 === 0 || i === count - 1) log(`Rendered ${i + 1}/${count} frames (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    }
    await encoder.finish(); encoder = undefined;
    const metadata = await probeVideo(path);
    const details = { ok: true, output: path, frames: count, metadata, elapsedSeconds: (Date.now() - started) / 1000, diagnostics: uniqDiagnostics(diagnostics) };
    await save(`${path}.diagnostics.json`, JSON.stringify(details, null, 2));
    return report(details);
  } finally {
    process.removeListener('SIGINT', cancel);
    if (encoder) await encoder.abort();
    await renderer.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void import('./cli-entry.ts').then(({runCLI})=>runCLI(process.argv.slice(2)));
}
