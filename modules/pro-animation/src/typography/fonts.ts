// SPDX-License-Identifier: Apache-2.0
// Owned client for existing verified HarfRust/Skrifa; metadata transport, not a font registry/parser.
import {EngineError,diagnostic} from '../../../../src/core/errors.ts';
import * as graphics from '../../../graphics-contracts/index.ts';
import {createFontShaper,createFontShaperFromKernel,type ShapingKernel,type FontShaperOptions,type ShapeRunOptions,type ShapedRun} from '../font-shaping.ts';
import type {ParagraphItemizer} from '../text-layout/layout.ts';
import type {TextItem} from '../text-itemizer.ts';
import {sourceText,frozen,finite} from '../text-layout/common.ts';
export interface FontMetadataKernel extends ShapingKernel {
 font_metrics():Promise<Float64Array>;font_axes():Promise<Float64Array>;
 map_codepoints(points:Uint32Array):Promise<Float64Array>;map_variants(pairs:Uint32Array):Promise<Float64Array>;
 glyph_metrics(glyphs:Uint32Array):Promise<Float64Array>;resolve_location(settings:string):Promise<Float64Array>;
}
export type FontMetadataFactory=(options:{signal:AbortSignal})=>Promise<FontMetadataKernel>;
export interface FontGlobalMetrics {
 unitsPerEm:number;glyphCount:number;monospace:boolean;italicAngle:number;ascent:number;descent:number;leading:number;
 capHeight:number|null;xHeight:number|null;averageWidth:number|null;maxWidth:number|null;
 underline:{offset:number;thickness:number}|null;strikeout:{offset:number;thickness:number}|null;
 bounds:{left:number;bottom:number;right:number;top:number}|null;
}
export interface FontAxis {tag:string;index:number;min:number;default:number;max:number;hidden:boolean}
export interface FontCharacter {codepoint:number;glyphId:number|null}
export interface FontVariant {codepoint:number;selector:number;status:'missing'|'default'|'variant';glyphId:number|null}
export interface FontGlyphMetrics {glyphId:number;advance:number|null;leftSideBearing:number|null;bounds:FontGlobalMetrics['bounds']}
export interface FontQuery {signal?:AbortSignal}
declare const brand:unique symbol;
export interface InspectedFont {readonly [brand]:true;readonly instance:Readonly<ShapedRun['fontInstance']>;readonly unitsPerEm:number;shapeRun(text:string,p:ShapeRunOptions):Promise<ShapedRun>;dispose():ReturnType<Awaited<ReturnType<typeof createFontShaper>>['dispose']>}
type Client={kernel:FontMetadataKernel;font:Awaited<ReturnType<typeof createFontShaper>>;closed:boolean;busy:boolean;pending?:Promise<unknown>;disposal?:ReturnType<InspectedFont['dispose']>;signal?:AbortSignal;metrics?:FontGlobalMetrics;axes?:readonly FontAxis[]};
const clients=new WeakMap<object,Client>();
function fail(message:string,details?:unknown):never{throw new EngineError('E_PA_FONT_INSPECTION',message,{details});}
function client(font:InspectedFont){const c=clients.get(font);if(!c)fail('Font belongs to another inspector instance');if(c.closed||c.signal?.aborted)throw new EngineError('E_PA_FONT_CLOSED','Inspected font is closed');return c;}
function check(signal?:AbortSignal){if(signal?.aborted)throw new EngineError('E_PA_FONT_QUERY_CANCELLED','Font query cancelled before publication');}
function query<T>(font:InspectedFont,options:FontQuery,work:(c:Client)=>Promise<T>):Promise<T>{
 try{check(options.signal);const c=client(font);if(c.busy)throw new EngineError('E_PA_FONT_BUSY','Await the owned font operation');c.busy=true;
 const pending=(async()=>{try{const result=await work(c);check(options.signal);client(font);return result;}catch(error){if(error instanceof EngineError)throw error;throw new EngineError('E_PA_FONT_INSPECTION',String(error),{details:{cause:diagnostic(error)}});}finally{c.busy=false;c.pending=undefined;if(c.closed){c.metrics=undefined;c.axes=undefined;}}})();c.pending=pending;return pending;
 }catch(error){return Promise.reject(error);}
}
/** Internal extension seam: shares the original inspector's ownership, cancellation and serialization. */
export function withInspectedFontKernel<T>(font:InspectedFont,options:FontQuery,work:(kernel:FontMetadataKernel)=>Promise<T>):Promise<T>{return query(font,options,c=>work(c.kernel));}

function numbers(value:Float64Array,length?:number){if(!(value instanceof Float64Array)||length!==undefined&&value.length!==length||value.some(n=>!Number.isFinite(n)))fail('Invalid finite metadata transport');return value;}
const integer=(n:number)=>{if(!Number.isSafeInteger(n)||n<0||n>0xffffffff)fail('Expected unsigned32 value');return n;};
const flag=(n:number)=>{if(n!==0&&n!==1)fail('Expected presence flag');return n===1;};
const scalar=(n:number)=>{integer(n);if(n>0x10ffff||n>=0xd800&&n<=0xdfff)fail('Expected Unicode scalar');return n;};
const bounds=(a:ArrayLike<number>,i:number):FontGlobalMetrics['bounds']=>flag(a[i])?{left:a[i+1],bottom:a[i+2],right:a[i+3],top:a[i+4]}:null;
function parseMetrics(a:Float64Array):FontGlobalMetrics{
 numbers(a,27);if(a[0]!==1||!integer(a[1])||!integer(a[2]))fail('Unsupported font metric metadata');
 const o=(i:number)=>flag(a[i])?a[i+1]:null,d=(i:number)=>flag(a[i])?{offset:a[i+1],thickness:a[i+2]}:null;
 return frozen({unitsPerEm:a[1],glyphCount:a[2],monospace:flag(a[3]),italicAngle:a[4],ascent:a[5],descent:a[6],leading:a[7],capHeight:o(8),xHeight:o(10),averageWidth:o(12),maxWidth:o(14),underline:d(16),strikeout:d(19),bounds:bounds(a,22)});
}
/** Factory owns the one existing shaper/Kit client. It never loads paths, OS fonts or downloads bytes. */
export async function createFontInspector(factory:FontMetadataFactory,options:FontShaperOptions):Promise<InspectedFont>{
 let kernel:FontMetadataKernel|undefined;const font=await createFontShaper(graphics,async p=>kernel=await factory(p),options);
 return inspectedClient(font,kernel,options);
}
/** Transfer an authorized direct Kit kernel; Native does not require a DOM AbortController. */
export async function createFontInspectorFromKernel(kernel:FontMetadataKernel,options:FontShaperOptions):Promise<InspectedFont>{
 const font=await createFontShaperFromKernel(graphics,kernel,options);return inspectedClient(font,kernel,options);
}
async function inspectedClient(font:Awaited<ReturnType<typeof createFontShaper>>,kernel:FontMetadataKernel|undefined,options:FontShaperOptions):Promise<InspectedFont>{
 try{
  const instance=(await font.shapeRun('',{script:'Zyyy',fontSize:1,baseline:0})).fontInstance;
  if(!kernel||['font_metrics','font_axes','map_codepoints','map_variants','glyph_metrics','resolve_location'].some(k=>typeof Reflect.get(kernel!,k)!=='function'))fail('Reviewed font metadata kernel required; old shaping factory is not silently substituted');
  const state:Client={kernel,font,closed:false,busy:false,signal:options.signal},handle={instance:frozen(structuredClone(instance)),unitsPerEm:font.unitsPerEm,shapeRun:(text:string,p:ShapeRunOptions)=>query(handle as InspectedFont,{},c=>c.font.shapeRun(text,p)),dispose(){state.closed=true;state.metrics=undefined;state.axes=undefined;return state.disposal??=(async()=>{await state.pending?.catch(()=>{});return font.dispose();})();}} as InspectedFont;
  clients.set(handle,state);return Object.freeze(handle);
 }catch(error){await font.dispose();throw error;}
}
export function readFontMetrics(font:InspectedFont,options:FontQuery={}){return query(font,options,async c=>c.metrics??=parseMetrics(await c.kernel.font_metrics()));}
export function readFontAxes(font:InspectedFont,options:FontQuery={}){
 return query(font,options,async c=>{if(c.axes)return c.axes;const a=numbers(await c.kernel.font_axes());if(a.length<2||a[0]!==1||a.length!==2+integer(a[1])*6)fail('Invalid axis metadata');const axes:FontAxis[]=[];for(let i=2;i<a.length;i+=6){const tag=integer(a[i]),chars=[tag>>>24,tag>>>16&255,tag>>>8&255,tag&255];if(chars.some(v=>v<32||v>126)||a[i+2]>a[i+3]||a[i+3]>a[i+4]||a[i+1]!==axes.length)fail('Invalid original font axis');axes.push({tag:String.fromCharCode(...chars),index:a[i+1],min:a[i+2],default:a[i+3],max:a[i+4],hidden:flag(a[i+5])});}return c.axes=frozen(axes);});
}
function settings(values:Readonly<Record<string,number>>){return Object.entries(values).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([tag,value])=>{if(!/^[ -~]{4}$/.test(tag)||/[=,]/.test(tag))fail('Four ASCII axis bytes required');finite(value,tag);return tag+'='+value;}).join(',');}
export async function resolveFontLocation(font:InspectedFont,variations:Readonly<Record<string,number>>,options:FontQuery={}){const value=settings(variations);return query(font,options,async c=>frozen([...numbers(await c.kernel.resolve_location(value))]));}
export async function mapFontCharacters(font:InspectedFont,codepoints:Iterable<number>,options:FontQuery={}){
 const points=[...codepoints].map(scalar);return query(font,options,async c=>{const out:FontCharacter[]=[];for(let start=0;start<points.length;start+=256){check(options.signal);const chunk=points.slice(start,start+256),a=numbers(await c.kernel.map_codepoints(Uint32Array.from(chunk)),chunk.length*3);for(let i=0;i<chunk.length;i++){if(a[i*3]!==chunk[i])fail('Character result order changed');const glyphId=flag(a[i*3+1])?integer(a[i*3+2]):null;out.push({codepoint:chunk[i],glyphId});}}return frozen(out);});
}
export async function mapFontVariationSequences(font:InspectedFont,pairs:readonly {codepoint:number;selector:number}[],options:FontQuery={}){
 const input=pairs.map(p=>{const cp=scalar(p.codepoint),vs=scalar(p.selector);if(!(vs>=0xfe00&&vs<=0xfe0f||vs>=0xe0100&&vs<=0xe01ef))fail('Unicode variation selector required');return {codepoint:cp,selector:vs};});
 return query(font,options,async c=>{const out:FontVariant[]=[];for(let start=0;start<input.length;start+=256){check(options.signal);const chunk=input.slice(start,start+256),a=numbers(await c.kernel.map_variants(Uint32Array.from(chunk.flatMap(p=>[p.codepoint,p.selector]))),chunk.length*4);for(let i=0;i<chunk.length;i++){const at=i*4;if(a[at]!==chunk[i].codepoint||a[at+1]!==chunk[i].selector||![0,1,2].includes(a[at+2]))fail('Invalid variation mapping');out.push({...chunk[i],status:(['missing','default','variant'] as const)[a[at+2]],glyphId:a[at+2]===0?null:integer(a[at+3])});}}return frozen(out);});
}
export async function readGlyphMetrics(font:InspectedFont,glyphs:Iterable<number>,options:FontQuery={}){
 const ids=[...glyphs].map(integer);return query(font,options,async c=>{const out:FontGlyphMetrics[]=[];for(let start=0;start<ids.length;start+=256){check(options.signal);const chunk=ids.slice(start,start+256),a=numbers(await c.kernel.glyph_metrics(Uint32Array.from(chunk)),chunk.length*10);for(let i=0;i<chunk.length;i++){const at=i*10;if(a[at]!==chunk[i])fail('Glyph result order changed');out.push({glyphId:chunk[i],advance:flag(a[at+1])?a[at+2]:null,leftSideBearing:flag(a[at+3])?a[at+4]:null,bounds:bounds(a,at+5)});}}return frozen(out);});
}
/** Nominal coverage observation, NOT complex shaping or visible color-font capability. */
export async function fontCoverageReport(font:InspectedFont,text:string,options:FontQuery={}){
 sourceText(text);const points=[...text].map(ch=>ch.codePointAt(0)!),mapped=await mapFontCharacters(font,points,options);let start=0;
 const characters=mapped.map(m=>{const end=start+(m.codepoint>0xffff?2:1),result={...m,start,end,text:text.slice(start,end),defaultIgnorable:/^\p{Default_Ignorable_Code_Point}$/u.test(String.fromCodePoint(m.codepoint))};start=end;return result;});
 const missing=characters.filter(c=>c.glyphId===null&&!c.defaultIgnorable);return frozen({kind:'nominal-cmap-observation',characters,missing,nominallyCovered:missing.length===0,shapingRequired:true,font:font.instance});
}
/** Preserves the whole joining run. No fake glyphs or character-by-character font splicing. */
export async function chooseFontForRun(candidates:readonly InspectedFont[],text:string,options:ShapeRunOptions&FontQuery){
 sourceText(text);if(!Array.isArray(candidates)||!candidates.length)fail('Explicit nonempty owned font candidates required');const fonts=[...candidates],{signal,...shape}=options,features=structuredClone(shape.features??{}),failures:object[]=[];
 for(const [index,font]of fonts.entries()){check(signal);client(font);try{const run=await font.shapeRun(text,{...shape,features,missingGlyph:'error'});check(signal);return {font,index,run};}catch(error){check(signal);if(!(error instanceof EngineError)||!['E_PA_FONT_MISSING_GLYPH','E_PA_FONT_OUTLINE'].includes(error.code))throw error;failures.push({index,font:font.instance,error:diagnostic(error)});}}
 throw new EngineError('E_PA_FONT_FALLBACK','No explicit candidate can shape the complete itemized run with supported vector outlines',{details:{text,failures},hint:'Provide a font covering this joining/script run; no OS lookup/download or destructive per-character font split is attempted.'});
}
export async function prepareFontFallback(text:string,options:{itemizer:ParagraphItemizer;candidates:readonly InspectedFont[];fontSize:number;baseDirection?:'auto'|'ltr'|'rtl';language?:string;features?:Readonly<Record<string,number>>;scriptForRun?:(item:TextItem)=>string;signal?:AbortSignal}){
 sourceText(text);const {itemizer,signal,fontSize,baseDirection,language,scriptForRun}=options,candidates=[...options.candidates],features=structuredClone(options.features??{});check(signal);if(!candidates.length)fail('Explicit font candidates required');const analysis=await itemizer.analyze(text,{baseDirection,signal}),entries:{start:number;end:number;script:string;font:InspectedFont;candidateIndex:number}[]=[];
 for(const item of analysis.runs){check(signal);const clean=Array.from({length:item.end-item.start},(_,i)=>item.start+i).filter(i=>!(analysis.flags[i]&6)&&!['\r','\n','\u000b','\u000c','\u0085','\u2028'].includes(text[i])).map(i=>text[i]).join('');if(!clean)continue;const script=scriptForRun?.(item)??item.script??'Zyyy',selection=await chooseFontForRun(candidates,clean,{script,direction:item.direction,fontSize,language,features,signal});entries.push({start:item.start,end:item.end,script,font:selection.font,candidateIndex:selection.index});}
 const find=(item:TextItem)=>{const entry=entries.find(e=>e.start<=item.start&&item.end<=e.end);if(!entry)throw new EngineError('E_PA_FONT_FALLBACK_PLAN','Requested line item does not lie in one verified original font run',{details:{start:item.start,end:item.end}});return entry;};
 return Object.freeze({font:candidates[0],fontForRun:(item:TextItem)=>find(item).font,scriptForRun:(item:TextItem)=>find(item).script,report:frozen(entries.map(e=>({start:e.start,end:e.end,script:e.script,candidateIndex:e.candidateIndex,font:e.font.instance}))),source:text,policy:'whole original itemized runs, no OS lookup or per-character joining split'});
}
export function fontLineBox(metrics:FontGlobalMetrics,fontSize:number,baseline:number,options:{leading?:number}={}){
 const upem=finite(metrics.unitsPerEm,'unitsPerEm');if(upem<=0)fail('Positive unitsPerEm required');const scale=finite(fontSize,'fontSize')/upem,at=finite(baseline,'baseline'),leading=finite(options.leading??metrics.leading*scale,'leading'),ascent=metrics.ascent*scale,descent=metrics.descent*scale;if(scale<=0||ascent<0||descent>0||ascent-descent+leading<=0)fail('Valid font instance/size/line metrics required');return frozen({top:at-ascent-leading/2,bottom:at-descent+leading/2,ascent,descent,leading,height:ascent-descent+leading,baseline:at});
}
export function fontDecoration(metrics:FontGlobalMetrics,fontSize:number,baseline:number,kind:'underline'|'strikeout'='underline'){
 if(!['underline','strikeout'].includes(kind))fail('Underline/strikeout decoration required');const upem=finite(metrics.unitsPerEm,'unitsPerEm');if(upem<=0)fail('Positive unitsPerEm required');const scale=finite(fontSize,'fontSize')/upem;if(scale<=0)fail('Positive font size required');const value=metrics[kind];return value?frozen({kind,top:finite(baseline,'baseline')-value.offset*scale,thickness:value.thickness*scale,source:'original-font-metric'}):null;
}
export async function measureFontKerning(font:InspectedFont,text:string,options:ShapeRunOptions&FontQuery){
 const {signal,...shape}=options;check(signal);const enabled=await font.shapeRun(text,{...shape,features:{...shape.features,kern:1}});check(signal);const disabled=await font.shapeRun(text,{...shape,features:{...shape.features,kern:0}});check(signal);const advance=(run:ShapedRun)=>run.layout.glyphs.reduce((n,g)=>n+g.advanceX,0),withKerning=advance(enabled),withoutKerning=advance(disabled);return frozen({withKerning,withoutKerning,delta:withKerning-withoutKerning,scope:'original HarfRust kern feature differential, not all GPOS or per-pair reconstruction'});
}
