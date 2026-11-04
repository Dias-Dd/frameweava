import type {TVG,Diagnostic,LayerSpec} from './types.ts';
import {EngineError} from './errors.ts';
export type OutputFormat='png'|'mp4'|'mov'|'wav';
export interface OutputPlan {format:OutputFormat;visual:boolean;audio:boolean;start:number;end:number;frames:number;reason:string;diagnostics:Diagnostic[]}
/** Select by actual declared output ports and finite frame range, never source text or pixel changes. */
export function planOutput(tvg:TVG,options:{format?:OutputFormat;start?:number;end?:number}={}):OutputPlan {
 const start=options.start??0,end=options.end??tvg.composition.durationInFrames;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>tvg.composition.durationInFrames)throw new EngineError('E_OUTPUT_RANGE','Output requires a finite half-open frame range within the composition.');
 const types=new Map(tvg.stages.map(s=>[s.id,s.outputs]));
 const byId=new Map(tvg.layers.map(l=>[l.id,l]));
 const active=(l:LayerSpec):boolean=>{
  let low=start,high=end,current:LayerSpec|undefined=l;const seen=new Set<string>();
  while(current){if(seen.has(current.id))throw new EngineError('E_LAYER_CYCLE','Output Layer ancestry has a cycle.');seen.add(current.id);
   low=Math.max(low,current.start);high=Math.min(high,current.end);if(low>=high)return false;
   if(!current.parent)return true;current=byId.get(current.parent);if(!current)return false;
  }return false;
 };
 const ports=tvg.layers.filter(l=>l.source&&active(l)).map(l=>types.get(l.source!.$ref)?.[l.source!.port] as string|undefined);
 const visual=ports.includes('surface'),audio=ports.includes('audio'),frames=end-start;
 if(!visual&&!audio)throw new EngineError('E_OUTPUT_EMPTY','No active visual or audio Layer in the output range.');
 const format=options.format??(visual?(frames===1&&!audio?'png':'mp4'):'wav');
 if(!['png','mp4','mov','wav'].includes(format)||format==='png'&&!visual||format==='wav'&&!audio||['mp4','mov'].includes(format)&&!visual)throw new EngineError('E_OUTPUT_FORMAT','Requested format cannot represent the selected media; select a compatible format/range explicitly.');
 const diagnostics:Diagnostic[]=[];if(format==='png'&&audio)diagnostics.push({code:'W_OUTPUT_AUDIO_OMITTED',severity:'warning',message:'Explicit PNG output captures visuals only.'});if(format==='wav'&&visual)diagnostics.push({code:'W_OUTPUT_VISUAL_OMITTED',severity:'warning',message:'Explicit WAV output contains audio only.'});
 return {format,visual,audio,start,end,frames,diagnostics,reason:options.format?'explicit-format':audio?(visual?'visual-and-audio':'audio-only'):frames===1?'single-visual-frame':'finite-visual-sequence'};
}

/** Thin dispatch view for existing compositors/mixers. Retain ancestors, never send PCM to a visual source slot. */
export function layersForMedia(tvg:TVG,media:'surface'|'audio'):LayerSpec[]{
 const stages=new Map(tvg.stages.map(s=>[s.id,s])),layers=new Map(tvg.layers.map(l=>[l.id,l])),keep=new Set<string>();
 const matches=(l:LayerSpec)=>Boolean(l.source&&(stages.get(l.source.$ref)?.outputs[l.source.port] as string|undefined)===media);
 for(const layer of tvg.layers)if(matches(layer)){
  let current:LayerSpec|undefined=layer;const seen=new Set<string>();
  while(current){if(seen.has(current.id))throw new EngineError('E_LAYER_CYCLE','Layer ancestry has a cycle.');seen.add(current.id);keep.add(current.id);current=current.parent?layers.get(current.parent):undefined;}
 }
 return tvg.layers.filter(l=>keep.has(l.id)).map(l=>{if(!l.source||matches(l))return {...l};const {source,...group}=l;return group;});
}
