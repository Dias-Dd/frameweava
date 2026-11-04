/** Persistent TVG is JSON. Runtime ports may carry declared value-owned media bytes. No live device handles. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Rational { num: number; den: number }
export type PortType = 'surface' | 'audio' | 'number' | 'string' | 'boolean' | 'json';
export type InputPortSchema = PortType | { type:PortType; optional?:boolean };
export type InputPortTypes = Record<string,InputPortSchema>;
export interface PortRef { $ref: string; port: string }
export type Easing = 'linear' | 'step' | 'easeIn' | 'easeOut' | 'easeInOut' | { bezier: [number, number, number, number] };
export interface Keyframe<T = number | string> { frame: number; value: T; easing?: Easing }
export interface Keyframes<T = number | string> { $keyframes: Keyframe<T>[] }
export interface Expression { $expr: string; args: (number | Expression)[] }
export interface Spring { $spring: { from: number; to: number; start: number; stiffness: number; damping: number; mass: number; velocity: number } }
export type Signal<T> = T | Keyframes<T> | (T extends number ? Expression | Spring : never);
export interface Transform {
  x?: Signal<number>; y?: Signal<number>; scale?: Signal<number>;
  scaleX?: Signal<number>; scaleY?: Signal<number>; rotation?: Signal<number>; opacity?: Signal<number>;
  originX?: number; originY?: number;
}
export interface VisualNode extends Transform {
  kind: 'group' | 'text' | 'rect' | 'circle'; id?: string;
  start?: number; end?: number; children?: VisualNode[];
  content?: string; fontFamily?: string; fontSize?: Signal<number>; fontWeight?: number;
  letterSpacing?: Signal<number>; lineHeight?: number; align?: 'left' | 'center' | 'right';
  width?: Signal<number>; height?: Signal<number>; radius?: Signal<number>;
  fill?: Signal<string>; stroke?: Signal<string>; strokeWidth?: Signal<number>;
}
export interface TimeMapping {
  start: number; duration: number; offset: number; rate: Rational;
}
export interface StageSpec {
  id: string; engine: string; entry?: string; exportName?: string; nodes?: VisualNode[];
  inputs: Record<string, PortRef | Json>; inputTypes?:InputPortTypes; outputs: Record<string, PortType>;
  props: Record<string, unknown>; time: TimeMapping;
  seek: 'stateless' | 'fixed-step'; width?: number; height?: number;
  audio?:import('../audio/contract.ts').AudioStageMetadata;
  /** Optional SO-2 v1 local execution scope. Existing Stage fields retain their meaning. */
  composition?:import('../../modules/stage-orchestration/composite-types.ts').CompositeDefinition;
}
export interface EffectUse { id: string; params?: Record<string, Json> }
export interface ParameterSchema {
  type: 'number' | 'string' | 'boolean'; default?: Json; min?: number; max?: number; enum?: Json[];
}
export interface EffectDefinition {
  id: string; name: string; version: string; engine: string;
  kind: 'canvas-filter' | 'function' | 'component' | 'shader' | 'native';
  parameters: Record<string, ParameterSchema>; inputs: Record<string, PortType>; outputs: Record<string, PortType>;
  implementation?: { filter: 'blur' | 'brightness' | 'contrast' | 'saturate' | 'hue-rotate'; parameter: string; unit?: 'px' | 'deg' | '' };
  source?: string; resources?: string[];
}
export interface LayerSpec extends Transform {
  /** Professional compositor only. Existing SDR defaults retain their old behavior. */
  isolation?:'isolated'|'pass-through';mask?:PortRef;
  id: string; name?:string; source?: PortRef; parent?: string; start: number; end: number;
  /** Audio-only attributes, validated against the source port by the authoring/graph gates. */
  gain?:Signal<number>;pan?:Signal<number>;
  audio?:{startSample?:number;sourceOffsetSamples?:number;sourceEndSample?:number};
  blend?: 'source-over' | 'screen' | 'multiply' | 'lighter'; effects?: EffectUse[];
}
export interface ResourceSpec { id: string; src: string; kind: 'image' | 'font' | 'model' | 'media' | 'file' }
export interface TVG {
  schemaVersion: '0.1';
  composition: { id: string; width: number; height: number; fps: Rational; durationInFrames: number; background: string; seed: number };
  stages: StageSpec[]; layers: LayerSpec[]; resources: ResourceSpec[]; effects: EffectDefinition[];
}
export interface FrameContext {
  /** Stage-local frame; fractional values are allowed by explicit time remapping. */
  frame: number; globalFrame: number; time: number; globalTime: number;
  dt: number; progress: number; fps: Rational; durationInFrames: number; seed: number;
}
export interface Surface {
  kind: 'surface'; format: 'png'; width: number; height: number;
  /** PNG bytes in a data URL; transferable across runtimes, never a live engine object. */
  dataUrl: string;
}
export type PortValue = Json | Surface | import('../media/surface.ts').ProfessionalSurface | import('../audio/block.ts').AudioBlockV1;
export interface Diagnostic {
  code: string; severity: 'error' | 'warning'; message: string; hint?: string;
  stageId?: string; frame?: number; details?: unknown;
}
export interface StageFrameResult { outputs: Record<string, PortValue>; diagnostics: Diagnostic[] }
export interface StageInit {
  width: number; height: number; seed: number;
  /** Actual host SDK version, also used by Stage-local public effect runtimes. */
  engineVersion?:string;
  /** Requested logical-to-compute pixel ratio. */
  pixelRatio?:number;
  /** Only explicitly declared resources are served. */
  resources: Record<string, string>;
  /** Format/transport support is distinct from permissions or device acceleration. */
  media?:{surfaceSchema:'frameweave.surface/2';transports:readonly ['cpu-inline']};
}
export interface StageInstance<I = Record<string, PortValue>, P = Record<string, unknown>, O = Record<string, PortValue>> {
  renderAt(context: FrameContext, inputs: I, props: P): O | void | Promise<O | void>;
  dispose?(): void | Promise<void>;
}
export type StageFactory<I = Record<string, PortValue>, P = Record<string, unknown>, O = Record<string, PortValue>> =
  (init: StageInit) => StageInstance<I, P, O> | Promise<StageInstance<I, P, O>>;
export interface BuiltProject { dir: string; manifest: TVG; stageBundles: Record<string, string>; hash: string; assets: Record<string, string> }
export interface RenderOptions {
  /** Host audio source/cache budgets. Total source duration is not a request budget. */
  audioResources?:import('../audio/resource-options.ts').AudioResourceOptions;
  width?: number; height?: number; cache?: boolean; timeoutMs?: number;
  onLog?: (message: string) => void; preview?:boolean;
  /** Explicitly permit WASM compilation in the isolated SpiderMonkey host; omitted means false. Does not permit JS eval. */
  allowWasm?:boolean;
  /** Explicit opt-in scene-linear composition and display preview policy. */
  media?:import('../media/compositor.ts').MediaPolicy;
}
export interface RenderedFrame { png: Buffer; diagnostics: Diagnostic[]; stageOutputs: Record<string, Record<string, PortValue>>; cacheHits: number }
export interface PreviewFrame {image:Buffer;mime:'image/png'|'image/jpeg';diagnostics:Diagnostic[];stageOutputs:Record<string,Record<string,PortValue>>;cacheHits:number}
export interface StageAdapter {
  readonly engine: string;
  init(stage: StageSpec): Promise<void>;
  renderAt(stage: StageSpec, context: FrameContext, inputs: Record<string, PortValue>, props: Record<string, unknown>): Promise<StageFrameResult>;
  dispose(): Promise<void>;
  /** Optional capability. Existing frame-only adapters are never assumed to support sample intervals. */
  readonly intervalCapability?:{schemaVersion:1;unit:'samples';seek:'stateless'|'preroll';lookbehindSamples:number;lookaheadSamples:number;latencySamples:number;tailSamples:number};
  evaluateInterval?(stage:StageSpec,request:import('../audio/contract.ts').IntervalRequest,inputs:Record<string,PortValue>,props:Record<string,unknown>):Promise<import('../audio/contract.ts').IntervalResult>;
}
