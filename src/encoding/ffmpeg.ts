import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import type { Rational } from '../core/types.ts';
import { EngineError } from '../core/errors.ts';

export function ffmpegPath(): string {
  const path = process.env.FRAMEWEAVE_FFMPEG ?? process.env.CANVIX_FFMPEG ?? ffmpegStatic;
  if (!path) throw new EngineError('E_FFMPEG_MISSING', 'FFmpeg is unavailable. Set FRAMEWEAVE_FFMPEG to an installed executable.');
  return path;
}
export class VideoEncoder {
  private child: ChildProcessWithoutNullStreams;
  private stderr = '';
  private complete: Promise<void>;
  private ended = false;
  private constructor(output: string, fps: Rational, width: number, height: number) {
    this.child = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', `${fps.num}/${fps.den}`,
      '-vcodec', 'png', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
      '-vf', `scale=${width}:${height}:flags=lanczos,format=yuv420p`, '-r', `${fps.num}/${fps.den}`, '-movflags', '+faststart', output],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-16000); });
    this.child.stdout.resume();
    this.complete = new Promise((resolveDone, reject) => {
      this.child.once('error', error => reject(new EngineError('E_ENCODE', String(error))));
      this.child.once('close', code => code === 0 ? resolveDone() : reject(new EngineError('E_ENCODE', this.stderr || `FFmpeg exited ${code}`)));
    });
    // A rejected process promise is observed immediately, even before finish().
    this.complete.catch(() => {});
    this.child.stdin.on('error', () => {});
  }
  static async create(output: string, fps: Rational, width: number, height: number): Promise<VideoEncoder> {
    if (width % 2 || height % 2) throw new EngineError('E_ENCODE_SIZE', 'H.264 yuv420p output dimensions must be even.');
    await mkdir(dirname(resolve(output)), { recursive: true });
    return new VideoEncoder(resolve(output), fps, width, height);
  }
  async write(png: Buffer): Promise<void> {
    if (this.ended) throw new EngineError('E_ENCODE', 'Encoder is closed.');
    if (this.child.exitCode !== null || this.child.stdin.destroyed) { await this.complete; throw new EngineError('E_ENCODE', 'Encoder exited early.'); }
    if (!this.child.stdin.write(png)) await Promise.race([once(this.child.stdin, 'drain'), this.complete.then(() => { throw new EngineError('E_ENCODE', 'Encoder closed while writing.'); })]);
  }
  async finish(): Promise<void> { this.ended = true; this.child.stdin.end(); await this.complete; }
  async abort(): Promise<void> { this.ended = true; this.child.kill(); try { await this.complete; } catch {} }
}

export async function probeVideo(path: string): Promise<{ width: number; height: number; fps: number; duration: number; frames: number; decodable: boolean }> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  let output: string;
  try {
    const result = await promisify(execFile)(ffmpegPath(), ['-hide_banner', '-i', resolve(path), '-map', '0:v:0', '-f', 'null', '-'],
      { maxBuffer: 4 * 1024 * 1024, timeout: 120000, windowsHide: true });
    output = result.stderr;
  } catch (error) { throw new EngineError('E_DECODE', `Video could not be fully decoded: ${String(error)}`); }
  const dimensions = output.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  const fps = output.match(/Video:.*?([\d.]+) fps/);
  const duration = output.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const frames = [...output.matchAll(/frame=\s*(\d+)/g)].at(-1);
  if (!dimensions || !fps || !duration || !frames) throw new EngineError('E_PROBE', `Could not read decoded video metadata: ${output.slice(0, 2000)}`);
  return { width: +dimensions[1], height: +dimensions[2], fps: +fps[1],
    duration: +duration[1] * 3600 + +duration[2] * 60 + +duration[3], frames: +frames[1], decodable: true };
}
