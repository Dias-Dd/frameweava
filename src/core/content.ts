import type {PortRef,Rational} from './types.ts';
import {EngineError} from './errors.ts';
export interface SurfaceContent {kind:'surface';source:PortRef;durationInFrames?:number}
export interface ImageContent {kind:'image';source:PortRef}
export interface AudioContent {kind:'audio';source:PortRef;durationSamples:number;sampleRate:48000|96000}
export interface VideoContent {kind:'video';source:PortRef;durationInFrames:number|'unknown'|'infinite';audio?:AudioContent}
export type ContentReference=SurfaceContent|ImageContent|AudioContent|VideoContent;
/** Typed authoring references to existing output ports. No decoder/loader or new graph node. */
export const content={
 surface:(source:PortRef,timing:{durationInFrames?:number}={}):SurfaceContent=>({kind:'surface',source,...timing}),
 image:(source:PortRef):ImageContent=>({kind:'image',source}),
 audio:(source:PortRef,timing:Pick<AudioContent,'durationSamples'|'sampleRate'>):AudioContent=>({kind:'audio',source,...timing}),
 video:(source:PortRef,timing:Pick<VideoContent,'durationInFrames'|'audio'>):VideoContent=>({kind:'video',source,...timing}),
};
export function isContentReference(value:unknown):value is ContentReference {
 return !!value&&typeof value==='object'&&'kind' in value&&'source' in value;
}
export function samplesToFrames(samples:number,sampleRate:number,fps:Rational):number{
 if(!Number.isSafeInteger(samples)||samples<=0||![48000,96000].includes(sampleRate))throw new EngineError('E_CONTENT_DURATION','Audio needs positive finite durationSamples and 48/96 kHz sampleRate.');
 const n=BigInt(samples)*BigInt(fps.num),d=BigInt(sampleRate)*BigInt(fps.den),frames=(n+d-1n)/d;
 if(frames>BigInt(Number.MAX_SAFE_INTEGER))throw new EngineError('E_CONTENT_DURATION','Content duration exceeds safe frame range.');
 return Number(frames);
}
export function contentDuration(value:ContentReference,fps:Rational):number|undefined{
 if(!['surface','image','video','audio'].includes(value.kind))throw new EngineError('E_LAYER_CONTENT','Unknown content reference kind.');
 if(value.kind==='image')return 1;
 if(value.kind==='audio')return samplesToFrames(value.durationSamples,value.sampleRate,fps);
 if(value.durationInFrames===undefined||value.durationInFrames==='unknown'||value.durationInFrames==='infinite')return undefined;
 if(!Number.isSafeInteger(value.durationInFrames)||value.durationInFrames!<=0)throw new EngineError('E_CONTENT_DURATION','Content needs a positive finite durationInFrames.');
 return value.durationInFrames;
}
