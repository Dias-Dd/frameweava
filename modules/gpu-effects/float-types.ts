import type {ColorEncoding,AlphaMode} from '../../src/media/surface.ts';
export type FloatPixelPass={kind:'gaussian';radius:number;boundary?:'transparent'|'clamp'}|{kind:'glow';radius:number;threshold?:number;intensity:number;boundary?:'transparent'|'clamp'};
export interface FloatPixelPassOptions {workingColor?:ColorEncoding;format?:'rgba16float'|'rgba32float';alpha?:AlphaMode;maxBufferBytes?:number}
