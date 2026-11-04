/** Shared Native parameter types; the browser renderer was removed. */
import type {ColorEncoding} from '../../../src/media/surface.ts';
export interface PuppetRendererOptions {width:number;height:number;workingColor?:ColorEncoding;bounds?:{left:number;right:number;bottom:number;top:number};maxBufferBytes?:number}
export interface PuppetRenderOptions {sampling?:'nearest'|'linear';boundary?:'zero'|'clamp';format?:'rgba16float'|'rgba32float'}
