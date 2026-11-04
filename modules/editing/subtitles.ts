import {parseSync} from './vendor/subtitle/parseSync.ts';
import {RE_TIMESTAMP} from './vendor/subtitle/parseTimestamps.ts';
import {EngineError} from '../../src/core/errors.ts';
import {rational} from '../../src/core/time.ts';
import type {Rational} from '../../src/core/types.ts';
export interface SubtitleCue {readonly id:string;readonly startMs:number;readonly endMs:number;readonly text:string}
export interface SubtitleImportOptions {format?:'srt'|'vtt';markup?:'error'|'strip';settings?:'error'|'ignore'}
export function subtitleError(message:string,details?:Record<string,unknown>):never{throw new EngineError('E_EDIT_SUBTITLE',message,{details});}
function textValue(text:string){if(typeof text!=='string'||!text.trim())subtitleError('Subtitle cue needs text');for(const c of text){const n=c.codePointAt(0)!;if(n>=0xd800&&n<=0xdfff)subtitleError('Subtitle text must contain valid Unicode scalars');}return text;}
/** User-authored cues use integer milliseconds, not a second playback clock. */
export function subtitleCue(text:string,startMs:number,endMs:number,id='cue'):SubtitleCue {
 if(!Number.isSafeInteger(startMs)||!Number.isSafeInteger(endMs)||startMs<0||endMs<=startMs||typeof id!=='string'||!id)subtitleError('Expected an id and a nonempty, safe integer millisecond interval');
 return {id,startMs,endMs,text:textValue(text)};
}
/** Reuses subtitle@4.2.2 (MIT), without loading its Node stream dependencies. */
export function parseSubtitles(source:string,options:SubtitleImportOptions={}):readonly SubtitleCue[]{
 if(typeof source!=='string')subtitleError('Subtitle source must be a string');
 for(const k of Object.keys(options))if(!['format','markup','settings'].includes(k))subtitleError('Unknown subtitle import option '+k);
 if(options.format!==undefined&&!['srt','vtt'].includes(options.format)||options.markup!==undefined&&!['error','strip'].includes(options.markup)||options.settings!==undefined&&!['error','ignore'].includes(options.settings))subtitleError('Invalid subtitle import policy');
 const input=source.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'),vtt=/^WEBVTT(?:[\t ]|\n|$)/.test(input);
 if(options.format!==undefined&&(options.format==='vtt')!==vtt)subtitleError('Requested subtitle format does not match the file header');
 const rows=input.split('\n');let timings=0;
 for(const [row,line]of rows.entries()){
  if(!/^\d.* --> \d/.test(line))continue;const m=RE_TIMESTAMP.exec(line);timings++;
  // Upstream accepts one/two fraction digits as literal milliseconds. Require the
  // canonical three-digit profile instead of silently misinterpreting .1 as .001.
  const strict=(s:string)=>/^(?:\d{2,}:)?[0-5]\d:[0-5]\d[,.]\d{3}$/.test(s);
  if(!m||!strict(m[1])||!strict(m[2]))subtitleError('Use canonical HH:MM:SS,mmm SRT or MM:SS.mmm WebVTT timestamps',{row:row+1});
  if(m[3]&&options.settings!=='ignore')subtitleError('Cue positioning/settings need an explicit style; use settings:"ignore" to discard them',{row:row+1,settings:m[3]});
 }
 // Upstream's streaming parser recognizes numeric indices only. Normalize just
 // that identifier line, retaining the original WebVTT/SRT cue id as metadata.
 const ids:string[]=[];
 const normalized=input.split(/\n[\t ]*\n/).map(block=>{const lines=block.split('\n');if(/^WEBVTT(?:[\t ]|$)|^NOTE(?:[\t ]|$)/.test(lines[0]))return block;
  const timing=RE_TIMESTAMP.test(lines[0])?0:lines.length>1&&RE_TIMESTAMP.test(lines[1])?1:-1;if(timing<0)return block;
  ids.push(timing===1?lines[0]:String(ids.length+1));if(timing===1)lines[0]=String(ids.length);return lines.join('\n');
 }).join('\n\n');
 let nodes:ReturnType<typeof parseSync>;try{nodes=parseSync(normalized);}catch(e){subtitleError('Subtitle parser: '+(e instanceof Error?e.message:String(e)));}
 const cues=nodes!.filter(n=>n.type==='cue');if(cues.length!==timings)subtitleError('Incomplete subtitle cue or timing block');
 return cues.map((node,index)=>{if(node.type!=='cue')subtitleError('Invalid parser cue');let text=node.data.text;
  if(/<[^>]+>/.test(text)){if(options.markup!=='strip')subtitleError('Styled cue markup requires an explicit markup:"strip" policy',{cue:index+1});text=text.replace(/<[^>]*>/g,'');}
  return subtitleCue(text,node.data.start,node.data.end,ids[index]??String(index+1));
 });
}
/** Preserve half-open cue visibility at real project sample times: ceil both ends. */
export function subtitleFrames(cue:SubtitleCue,fps:number|Rational):{start:number;end:number}{
 subtitleCue(cue.text,cue.startMs,cue.endMs,cue.id);const rate=rational(fps),d=1000n*BigInt(rate.den),ceil=(ms:number)=>{const n=BigInt(ms)*BigInt(rate.num),v=Number((n+d-1n)/d);if(!Number.isSafeInteger(v))subtitleError('Subtitle time exceeds project frame transport');return v;};
 return {start:ceil(cue.startMs),end:ceil(cue.endMs)};
}
/** Explicit millisecond retiming, independent of render order. */
export function shiftSubtitles(cues:readonly SubtitleCue[],offsetMs:number):readonly SubtitleCue[]{
 if(!Number.isSafeInteger(offsetMs))subtitleError('Subtitle offset must be integer milliseconds');return cues.map(c=>subtitleCue(c.text,c.startMs+offsetMs,c.endMs+offsetMs,c.id));
}
