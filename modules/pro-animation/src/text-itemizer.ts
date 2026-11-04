// SPDX-License-Identifier: Apache-2.0
// Typed data adapter. UAX9/UAX29/property algorithms stay in the original reviewed Rust crates.
import {EngineError,diagnostic} from '../../../src/core/errors.ts';
import type {Diagnostic} from '../../../src/core/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
export interface TextKernel {
 analyze(text:string,base:number):Promise<number>;analyze_line?(text:string,base:number,start:number,end:number):Promise<number>;metadata():Promise<Float64Array>;
 read_paragraphs(start:number,count:number):Promise<Float64Array>;read_levels(start:number,count:number):Promise<Float64Array>;
 read_runs(start:number,count:number):Promise<Float64Array>;read_candidates(start:number,count:number):Promise<Float64Array>;
 read_bidi_runs(start:number,count:number):Promise<Float64Array>;read_visual_indices(start:number,count:number):Promise<Float64Array>;
 reset_results():Promise<void>;diagnostics():Promise<unknown>;dispose():Promise<{remainingSessions:number}>;
}
export type TextKernelFactory=(options:{signal:AbortSignal})=>Promise<TextKernel>;
export interface TextLineRange {start:number;end:number}
export interface TextItemizeOptions {baseDirection?:'auto'|'ltr'|'rtl';signal?:AbortSignal}
export interface TextParagraph {readonly start:number;readonly end:number;readonly level:number;readonly direction:'ltr'|'rtl'}
export interface TextItem {
 readonly paragraph:number;readonly start:number;readonly end:number;readonly level:number;readonly direction:'ltr'|'rtl';readonly visualIndex:number;
 readonly script:string|null;readonly scriptCandidates:readonly string[];
 readonly splitsGrapheme:boolean;readonly scriptConflict:boolean;
}
export interface TextAnalysis {
 readonly text:string;readonly unicodeVersion:'16.0.0';
 readonly paragraphs:readonly TextParagraph[];readonly runs:readonly TextItem[];
 readonly bidiRuns:readonly {readonly paragraph:number;readonly start:number;readonly end:number;readonly level:number}[];
 readonly levels:readonly number[];readonly lineLevels:readonly number[];
 /** bit0 removed by X9, bit1 Bidi_Control, bit2 paragraph separator. Indexed by original UTF16 unit. */
 readonly flags:readonly number[];
 /** Scalar starts in L2 visual order, excluding X9; NOT glyph order and NOT mirrored display text. */
 readonly visualOrder:readonly number[];readonly diagnostics:readonly Diagnostic[];
}
function fail(code:string,message:string,details?:unknown):never{throw new EngineError(code,message,{details});}
const integer=(n:number)=>Number.isSafeInteger(n)&&n>=0;
function scalarBoundary(text:string,i:number){return integer(i)&&i<=text.length&&!(i>0&&i<text.length&&text.charCodeAt(i)>=0xdc00&&text.charCodeAt(i)<=0xdfff&&text.charCodeAt(i-1)>=0xd800&&text.charCodeAt(i-1)<=0xdbff);}
function tag(n:number):string {if(!integer(n)||n>0xffffffff)fail('E_PA_TEXT_OUTPUT','Invalid script tag');const t=String.fromCharCode(n>>>24,(n>>>16)&255,(n>>>8)&255,n&255);if(!/^[A-Za-z]{4}$/.test(t))fail('E_PA_TEXT_OUTPUT','Expected ISO15924 script tag');return t;}
function wellFormed(text:string,budget:number){
 if(typeof text!=='string')fail('E_PA_TEXT_INPUT','Expected original Unicode text');if(text.length>budget)fail('E_GRAPHICS_LIMIT','Text exceeds existing canonical string budget');
 for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))fail('E_PA_TEXT_UTF16','Unpaired UTF16 high surrogate');}else if(n>=0xdc00&&n<=0xdfff)fail('E_PA_TEXT_UTF16','Unpaired UTF16 low surrogate');}
}
/** Owned existing Kit client; no font discovery, layout model, timing, renderer or task scheduler. */
export function createTextItemizer(graphics:Pick<typeof Graphics,'LIMITS'>,factory:TextKernelFactory,options:{signal?:AbortSignal}={}){return textItemizerSession(graphics,factory,options);}
/** Transfer an already admitted direct Kit kernel; the original analysis/cleanup is shared. */
export function createTextItemizerFromKernel(graphics:Pick<typeof Graphics,'LIMITS'>,kernel:TextKernel,options:{signal?:AbortSignal}={}){return textItemizerSession(graphics,undefined,options,kernel);}
async function textItemizerSession(graphics:Pick<typeof Graphics,'LIMITS'>,factory:TextKernelFactory|undefined,options:{signal?:AbortSignal},ownedKernel?:TextKernel){
 const life=options.signal,controller=factory?new AbortController():undefined;let closed=false,busy=false,terminated=false,disposal:Promise<{mode:'cooperative';remainingSessions:number}|{mode:'terminated'}>|undefined;
 const cancel=()=>{closed=true;terminated=Boolean(controller);controller?.abort();};
 const check=(signal?:AbortSignal)=>{if(life?.aborted||signal?.aborted)fail('E_PA_TEXT_CANCELLED','Text analysis cancelled');if(closed)fail('E_PA_TEXT_CLOSED','Text client is closed');};check();life?.addEventListener('abort',cancel,{once:true});if(life?.aborted){cancel();check();}
 let kernel:TextKernel;try{kernel=ownedKernel??await factory!({signal:controller!.signal});}catch(error){life?.removeEventListener('abort',cancel);controller?.abort();if(life?.aborted)fail('E_PA_TEXT_CANCELLED','Text client initialization cancelled');throw error;}
 if(life?.aborted||closed){try{await kernel.dispose();}finally{controller?.abort();life?.removeEventListener('abort',cancel);}fail('E_PA_TEXT_CANCELLED','Text client initialization cancelled');}
 async function analyze(text:string,p:TextItemizeOptions={},source?:{text:string;start:number;end:number}):Promise<TextAnalysis>{
   check();if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['baseDirection','signal'].includes(k))||!['auto','ltr','rtl'].includes(p.baseDirection??'auto'))fail('E_PA_TEXT_PARAMETER','Use documented base direction and query signal');
   const {signal,baseDirection}=p;
   check(signal);if(busy)fail('E_PA_TEXT_BUSY','Await the current owned text operation');wellFormed(text,graphics.LIMITS.string);
   busy=true;signal?.addEventListener('abort',cancel,{once:true});let failure:unknown;
   try{
    check(signal);const base=baseDirection==='ltr'?1:baseDirection==='rtl'?2:0,runCount=source?await kernel.analyze_line!(source.text,base,source.start,source.end):await kernel.analyze(text,base);check(signal);const meta=await kernel.metadata();check(signal);
    if(!(meta instanceof Float64Array)||meta.length!==15||meta.some(n=>!integer(n)||n>0xffffffff)||meta[0]!==text.length||meta[2]!==runCount||meta[1]>text.length||meta[2]>text.length||meta[3]>text.length||meta[4]>text.length||meta.slice(6).some((n,i)=>n!==(i%3===0?16:0)))fail('E_PA_TEXT_OUTPUT','Invalid Unicode16 metadata');
    const read=async(fn:(a:number,n:number)=>Promise<Float64Array>,count:number,stride:number)=>{const values:number[]=[];for(let at=0;at<count;at+=1024){check(signal);const size=Math.min(1024,count-at),chunk=await fn(at,size);check(signal);if(!(chunk instanceof Float64Array)||chunk.length!==size*stride||chunk.some(n=>!integer(n)))fail('E_PA_TEXT_OUTPUT','Invalid text result chunk');for(const n of chunk)values.push(n);}return values;};
    const ps=await read((a,n)=>kernel.read_paragraphs(a,n),meta[1],3),ls=await read((a,n)=>kernel.read_levels(a,n),text.length,3),rs=await read((a,n)=>kernel.read_runs(a,n),meta[2],8),cs=await read((a,n)=>kernel.read_candidates(a,n),meta[5],1),bs=await read((a,n)=>kernel.read_bidi_runs(a,n),meta[3],4),vs=await read((a,n)=>kernel.read_visual_indices(a,n),meta[4],1);
    const paragraphs:TextParagraph[]=[];let end=0;
    for(let i=0;i<ps.length;i+=3){const [start,next,level]=ps.slice(i,i+3);if(start!==end||next<=start||next>text.length||level>1||!scalarBoundary(text,start)||!scalarBoundary(text,next))fail('E_PA_TEXT_OUTPUT','Invalid paragraph boundary');end=next;paragraphs.push(Object.freeze({start,end:next,level,direction:level%2?'rtl' as const:'ltr' as const}));}if(end!==text.length)fail('E_PA_TEXT_OUTPUT','Incomplete paragraph coverage');
    const levels:number[]=[],lineLevels:number[]=[],flags:number[]=[];
    for(let i=0;i<ls.length;i+=3){if(ls[i]>126||ls[i+1]>126||(ls[i+2]&~7)!==0)fail('E_PA_TEXT_OUTPUT','Invalid embedding level/flags');levels.push(ls[i]);lineLevels.push(ls[i+1]);flags.push(ls[i+2]);}
    for(let i=0;i<text.length;){const size=text.codePointAt(i)!>0xffff?2:1;if(size===2&&(levels[i]!==levels[i+1]||lineLevels[i]!==lineLevels[i+1]||flags[i]!==flags[i+1]))fail('E_PA_TEXT_OUTPUT','Inconsistent surrogate-unit metadata');i+=size;}
    const validRange=(paragraph:number,start:number,next:number,level:number)=>{const para=paragraphs[paragraph];if(!para||start<para.start||next>para.end||next<=start||level>126||lineLevels[start]!==level||!scalarBoundary(text,start)||!scalarBoundary(text,next))fail('E_PA_TEXT_OUTPUT','Invalid item range');};
    const bidiRuns=[];for(let i=0;i<bs.length;i+=4){const [paragraph,start,next,level]=bs.slice(i,i+4);validRange(paragraph,start,next,level);bidiRuns.push(Object.freeze({paragraph,start,end:next,level}));}
    const runs:TextItem[]=[],diagnostics:Diagnostic[]=[];let candidateEnd=0;
    for(let i=0;i<rs.length;i+=8){
     const [paragraph,start,next,level,scriptCode,bits,candidateStart,count]=rs.slice(i,i+8);validRange(paragraph,start,next,level);if((bits&~3)!==0||candidateStart!==candidateEnd||candidateStart+count>cs.length)fail('E_PA_TEXT_OUTPUT','Invalid script item record');candidateEnd+=count;
     const candidates=Object.freeze(cs.slice(candidateStart,candidateEnd).map(tag)),script=scriptCode?tag(scriptCode):null;
     if(new Set(candidates).size!==candidates.length||script!==null&&!(script==='Zzzz'&&count===0)&&!candidates.includes(script))fail('E_PA_TEXT_OUTPUT','Inconsistent script candidates');
     const run=Object.freeze({paragraph,start,end:next,level,direction:level%2?'rtl' as const:'ltr' as const,visualIndex:runs.length,script,scriptCandidates:candidates,splitsGrapheme:Boolean(bits&1),scriptConflict:Boolean(bits&2)});runs.push(run);
     for(const [code,condition,message]of [['W_PA_TEXT_GRAPHEME_BOUNDARY',run.splitsGrapheme,'Bidi level boundary splits a grapheme; shaping must resolve it explicitly'],['W_PA_TEXT_SCRIPT_CONFLICT',run.scriptConflict,'One grapheme contains conflicting Script_Extensions'],['W_PA_TEXT_SCRIPT_AMBIGUOUS',script===null,'No unique script; select a candidate explicitly before shaping'],['W_PA_TEXT_SCRIPT_UNKNOWN',script==='Zzzz','Unknown script in the pinned Unicode16 data']] as const)if(condition)diagnostics.push(Object.freeze({code,severity:'warning',message,details:Object.freeze({start,end:next,paragraph})}));
    }
    if(candidateEnd!==cs.length)fail('E_PA_TEXT_OUTPUT','Trailing script candidate data');
    const coverage=(records:readonly {paragraph:number;start:number;end:number}[])=>{const logical=[...records].sort((a,b)=>a.paragraph-b.paragraph||a.start-b.start);let index=0;for(const para of paragraphs){let cursor=para.start;while(index<logical.length&&logical[index].start<para.end){if(logical[index].start!==cursor)fail('E_PA_TEXT_OUTPUT','Items overlap or omit source text');cursor=logical[index++].end;}if(cursor!==para.end)fail('E_PA_TEXT_OUTPUT','Incomplete item coverage');}};coverage(runs);coverage(bidiRuns);
    const seen=new Set<number>();for(const at of vs){if(at>=text.length||!scalarBoundary(text,at)||(flags[at]&1)||seen.has(at))fail('E_PA_TEXT_OUTPUT','Invalid L2 visual map');seen.add(at);}let expected=0;for(let i=0;i<text.length;){if(!(flags[i]&1))expected++;i+=text.codePointAt(i)!>0xffff?2:1;}if(expected!==vs.length)fail('E_PA_TEXT_OUTPUT','Incomplete L2 visual map');
    check(signal);return Object.freeze({text,unicodeVersion:'16.0.0',paragraphs:Object.freeze(paragraphs),runs:Object.freeze(runs),bidiRuns:Object.freeze(bidiRuns),levels:Object.freeze(levels),lineLevels:Object.freeze(lineLevels),flags:Object.freeze(flags),visualOrder:Object.freeze(vs),diagnostics:Object.freeze(diagnostics)});
   }catch(error){failure=error;if(life?.aborted||signal?.aborted)fail('E_PA_TEXT_CANCELLED','Text analysis cancelled');throw error;}
   finally{try{if(!closed)await kernel.reset_results();}catch(cleanup){cancel();throw new EngineError('E_PA_TEXT_CLEANUP','Text result cleanup failed; client terminated',{details:{...(failure?{original:diagnostic(failure)}:{}),cleanup:diagnostic(cleanup)}});}finally{signal?.removeEventListener('abort',cancel);busy=false;}}
 }
 return {
  analyze:(text:string,p:TextItemizeOptions={})=>analyze(text,p),
  /** Original paragraph context, selected UTF16 line; local result indices. No automatic wrapping. */
  async analyzeLine(text:string,range:TextLineRange,p:TextItemizeOptions={}):Promise<TextAnalysis>{
   check();wellFormed(text,graphics.LIMITS.string);
   if(!range||typeof range!=='object'||Array.isArray(range)||Object.keys(range).some(k=>!['start','end'].includes(k))||!scalarBoundary(text,range.start)||!scalarBoundary(text,range.end)||range.start>range.end)fail('E_PA_TEXT_LINE_RANGE','Use an ordered scalar-boundary UTF16 range inside the original text');
   if(typeof kernel.analyze_line!=='function')fail('E_PA_TEXT_LINE_KERNEL','This older verified text kernel does not provide contextual line analysis; use the reviewed text-lines carrier');
   const {start,end}=range;return analyze(text.slice(start,end),p,{text,start,end});
  },
  async diagnostics(){return {closed,busy,...terminated?{termination:'Kit abort; Rust Drop unverified'}:{},...!closed?{kernel:await kernel.diagnostics()}:{}};},
  async dispose(){if(disposal)return disposal;if(busy)cancel();else closed=true;disposal=(async()=>{try{const result=await kernel.dispose();return terminated?{mode:'terminated' as const}:{mode:'cooperative' as const,remainingSessions:result.remainingSessions};}finally{controller?.abort();life?.removeEventListener('abort',cancel);}})();return disposal;},
 };
}
