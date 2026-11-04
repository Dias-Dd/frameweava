// SPDX-License-Identifier: Apache-2.0
// Immutable font-instance adapter. Shaping/outlines remain HarfRust/Skrifa in the existing Kit.
import {EngineError,diagnostic} from '../../../src/core/errors.ts';
import type {Diagnostic} from '../../../src/core/types.ts';
import type {Coordinates2D,ResourceReference,TextLayoutData,PathData,PathCommand} from '../../graphics-contracts/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';

export interface ShapingKernel {
 begin_font():Promise<void>;append_font(bytes:Uint8Array):Promise<void>;finish_font(index:number):Promise<number>;
 set_variations(settings:string):Promise<void>;
 normalized_coords():Promise<Float64Array>;
 color_glyph_paint?(glyph:number):Promise<Float64Array>;
 shape_run(text:string,direction:number,script:string,language:string,features:string):Promise<number>;
 shape_run_context?(text:string,direction:number,script:string,language:string,features:string,before:string,after:string):Promise<number>;
 read_glyphs(start:number,count:number):Promise<Float64Array>;
 outline_glyph(glyph:number):Promise<number>;read_outline(start:number,count:number):Promise<Float64Array>;
 reset_results():Promise<void>;diagnostics():Promise<unknown>;dispose():Promise<{remainingSessions:number}>;
}
export type ShapingKernelFactory=(options:{signal:AbortSignal})=>Promise<ShapingKernel>;
export type FontDisposal={mode:'cooperative';remainingSessions:number}|{mode:'terminated'};
export interface FontShaperOptions {
 source:ResourceReference;bytes:Uint8Array;faceIndex?:number;coordinates:Coordinates2D;
 /** @experimental Fixed instance; strict 1e-4 font-unit cross-library outline comparison has known residuals. */
 variations?:Readonly<Record<string,number>>;signal?:AbortSignal;
}
export interface ShapeRunOptions {
 /** One itemized run. Paragraph bidi, fallback, wrapping and script detection are outside this interface. */
 script:string;language?:string;direction?:'ltr'|'rtl';fontSize:number;x?:number;baseline?:number;
 /** Unranged OpenType settings, e.g. {kern:0,liga:0}; no arbitrary code or callback. */
 features?:Readonly<Record<string,number>>;missingGlyph?:'error'|'notdef';
 /** Absolute query instance. The owned kernel restores its immutable base before releasing the query. */
 variations?:Readonly<Record<string,number>>;
 /** Joining context for a style/axis run. It is not emitted into layout or clusters. */
 context?:Readonly<{before:string;after:string}>;
 /** Explicit color path: defer real COLR glyph paints to a reviewed renderer instead of inventing outlines. */
 paint?:'outline'|'color';
}
export interface ShapedRun {
 layout:TextLayoutData;
 /** Existing canonical per-glyph geometry; empty path lists are observable, never invented coverage. */
 glyphPaths:{glyphIndex:number;path:PathData}[];
 diagnostics:Diagnostic[];
 /** Original-library COLR availability; a consumer must actually paint these glyphs. */
 colorGlyphs?:{glyphIndex:number;format:'colr-v0'|'colr-v1'}[];
 /** Local return metadata, NOT a new professional data schema. Keep when persisting variable-font layout. */
 fontInstance:{source:ResourceReference;faceIndex:number;variations:Readonly<Record<string,number>>;normalizedCoordinates:readonly number[]};
}
function fail(code:string,message:string,details?:unknown):never{throw new EngineError(code,message,{details});}
const finite=(n:number,name:string)=>{if(typeof n!=='number'||!Number.isFinite(n))fail('E_PA_FONT_PARAMETER',`${name} must be finite`);return n;};
function settings(values:Readonly<Record<string,number>>|undefined,integer:boolean){
 const entries=Object.entries(values??{}).sort(([a],[b])=>a<b?-1:a>b?1:0);
 for(const [tag,value]of entries)if(!/^[\x20-\x7e]{4}$/.test(tag)||/[=,]/.test(tag)||!Number.isFinite(value)||integer&&(!Number.isSafeInteger(value)||value<0||value>0xffffffff))fail('E_PA_FONT_PARAMETER','Four ASCII setting bytes and finite values required');
 return entries.map(([tag,value])=>`${tag}=${value}`).join(',');
}
type FontGraphics=Pick<typeof Graphics,'validateTextLayoutData'|'validatePathData'|'verifyResource'|'LIMITS'>;
/** No resource fetch/path read/font download is performed here; callers supply already-authorized declared bytes. */
export function createFontShaper(graphics:FontGraphics,factory:ShapingKernelFactory,options:FontShaperOptions){return fontShaperSession(graphics,factory,options);}
/** Transfer one already-authorized direct Kit kernel. No DOM controller/Worker is fabricated. */
export function createFontShaperFromKernel(graphics:FontGraphics,kernel:ShapingKernel,options:FontShaperOptions){return fontShaperSession(graphics,undefined,options,kernel);}
async function fontShaperSession(graphics:FontGraphics,factory:ShapingKernelFactory|undefined,options:FontShaperOptions,ownedKernel?:ShapingKernel){
 const signal=options.signal;
 const seed:TextLayoutData={schema:'frameweave.text-layout',version:1,id:'shaped.run',coordinates:options.coordinates,text:'',layout:{engine:'harfrust',version:'0.15.0',clusterUnit:'utf16'},fonts:[{id:'font',source:options.source,faceIndex:options.faceIndex??0}],styles:[{id:'style',fontId:'font',fontSize:1,fill:{space:'srgb',alpha:'straight',rgba:[1,1,1,1]}}],paragraphs:[],lines:[],glyphs:[]};
 const identity=graphics.validateTextLayoutData(seed),source=identity.fonts[0].source,face=identity.fonts[0].faceIndex;
 if(identity.coordinates.unit!=='px')fail('E_PA_FONT_SPACE','Shaped layout uses explicit pixel coordinates');
 if(!(options.bytes instanceof Uint8Array))fail('E_PA_FONT_PARAMETER','Explicit font bytes required');
 const snapshot=new Uint8Array(options.bytes),variations=Object.freeze({...options.variations}),variationSettings=settings(variations,false);
 signal?.throwIfAborted();await graphics.verifyResource(source,snapshot);signal?.throwIfAborted();
 const controller=factory?new AbortController():undefined;let closed=false,busy=false,terminated=false,disposal:Promise<FontDisposal>|undefined;
 const cancel=()=>{closed=true;terminated=Boolean(controller);controller?.abort();};signal?.addEventListener('abort',cancel,{once:true});
 if(signal?.aborted){cancel();signal.throwIfAborted();}
 let kernel:ShapingKernel;
 try{kernel=ownedKernel??await factory!({signal:controller!.signal});}catch(error){signal?.removeEventListener('abort',cancel);controller?.abort();throw error;}
 const check=()=>{signal?.throwIfAborted();if(closed)fail('E_PA_FONT_CLOSED','Font session is closed');};
 let unitsPerEm:number,normalizedCoordinates:readonly number[],spaceGlyph:{key:string;glyph:number|null}|undefined;
 try{
  check();await kernel.begin_font();for(let start=0;start<snapshot.length;start+=262144){check();await kernel.append_font(snapshot.subarray(start,start+262144));}
  unitsPerEm=await kernel.finish_font(face);if(!Number.isInteger(unitsPerEm)||unitsPerEm<=0)fail('E_PA_FONT_OUTPUT','Invalid units per em');await kernel.set_variations(variationSettings);const normalized=await kernel.normalized_coords();if(!(normalized instanceof Float64Array)||normalized.some(n=>!Number.isFinite(n)))fail('E_PA_FONT_OUTPUT','Invalid normalized variation coordinates');normalizedCoordinates=Object.freeze(Array.from(normalized));check();
 }catch(error){try{await kernel.dispose();}catch(cleanup){throw new EngineError('E_PA_FONT_CLEANUP','Font initialization and cleanup failed',{details:{original:diagnostic(error),cleanup:diagnostic(cleanup)}});}finally{controller?.abort();signal?.removeEventListener('abort',cancel);}throw error;}
 return {
  unitsPerEm,
  async shapeRun(text:string,p:ShapeRunOptions):Promise<ShapedRun>{
   check();if(busy)fail('E_PA_FONT_BUSY','Await the owned font operation before shaping another run');
   if(typeof text!=='string'||/[\r\n\p{Bidi_Control}]/u.test(text))fail('E_PA_FONT_RUN','Expected one well-formed itemized Unicode run, no paragraph/bidi controls');
   if(text.length>graphics.LIMITS.string)fail('E_GRAPHICS_LIMIT','Run exceeds the existing canonical text budget');
   for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))fail('E_PA_FONT_RUN','Unpaired UTF16 high surrogate');}else if(c>=0xdc00&&c<=0xdfff)fail('E_PA_FONT_RUN','Unpaired UTF16 low surrogate');}
   if(!/^[A-Za-z]{4}$/.test(p.script)||typeof(p.language??'und')!=='string'||!(p.language??'und')||!['ltr','rtl'].includes(p.direction??'ltr')||!['error','notdef'].includes(p.missingGlyph??'error'))fail('E_PA_FONT_PARAMETER','Explicit script, language and ltr/rtl run direction required');
   const size=finite(p.fontSize,'fontSize'),x=finite(p.x??0,'x'),baseline=finite(p.baseline??size,'baseline');if(size<=0)fail('E_PA_FONT_PARAMETER','fontSize must be positive');const features=settings(p.features,true),scale=size/unitsPerEm,script=p.script,language=p.language??'und',direction=p.direction??'ltr',missingGlyph=p.missingGlyph??'error',hasVariationOverride=p.variations!==undefined,runVariations=hasVariationOverride?Object.freeze({...p.variations}):variations,runSettings=settings(runVariations,false);
   const paint=p.paint??'outline';if(!['outline','color'].includes(paint))fail('E_PA_FONT_PARAMETER','Known glyph paint policy required');if(paint==='color'&&typeof kernel.color_glyph_paint!=='function')fail('E_PA_FONT_COLOR','Reviewed color font kernel required; no monochrome fallback');
   const context=p.context===undefined?undefined:{before:p.context.before,after:p.context.after};
   if(context)for(const text of [context.before,context.after]){if(typeof text!=='string'||text.length>graphics.LIMITS.string||/[\r\n\p{Bidi_Control}]/u.test(text)||[...text].some(ch=>{const v=ch.codePointAt(0)!;return v>=0xd800&&v<=0xdfff;}))fail('E_PA_FONT_PARAMETER','Well-formed bounded joining context required');}
   if(context&&(context.before||context.after)&&typeof kernel.shape_run_context!=='function')fail('E_PA_FONT_CONTEXT','Reviewed contextual HarfRust kernel required; joining context is never silently ignored');
   let runCoordinates=normalizedCoordinates;
   busy=true;let failure:unknown;
   try{
    check();if(hasVariationOverride){await kernel.set_variations(runSettings);const actual=await kernel.normalized_coords();if(!(actual instanceof Float64Array)||actual.some(v=>!Number.isFinite(v)))fail('E_PA_FONT_OUTPUT','Invalid query-instance variation coordinates');runCoordinates=Object.freeze(Array.from(actual));check();}const count=context&&(context.before||context.after)?await kernel.shape_run_context!(text,direction==='rtl'?1:0,script,language,features,context.before,context.after):await kernel.shape_run(text,direction==='rtl'?1:0,script,language,features);
    if(!Number.isSafeInteger(count)||count<0||count>graphics.LIMITS.glyphs)fail('E_GRAPHICS_LIMIT','Shaped glyph count exceeds the existing canonical budget');
    const data:number[][]=[];for(let start=0;start<count;start+=1024){check();const n=Math.min(1024,count-start),chunk=await kernel.read_glyphs(start,n);if(!(chunk instanceof Float64Array)||chunk.length!==n*6||chunk.some(v=>!Number.isFinite(v)))fail('E_PA_FONT_OUTPUT','Invalid shaped glyph chunk');for(let i=0;i<n;i++)data.push(Array.from(chunk.subarray(i*6,i*6+6)));}
    const starts=[...new Set(data.map(r=>r[1]))].sort((a,b)=>a-b),ends=new Map(starts.map((v,i)=>[v,starts[i+1]??text.length]));
    let px=x,py=baseline;const glyphs:TextLayoutData['glyphs']=data.map((r,i)=>{const g={id:'glyph.'+i,lineId:'line',styleId:'style',glyphId:r[0],cluster:{start:r[1],end:ends.get(r[1])!},x:px+r[4]*scale,y:py-r[5]*scale,advanceX:r[2]*scale,advanceY:-r[3]*scale};px+=g.advanceX;py+=g.advanceY;return g;});
    const layout=graphics.validateTextLayoutData({...identity,text,styles:[{...identity.styles[0],fontSize:size}],paragraphs:[{id:'paragraph',start:0,end:text.length,direction}],lines:[{id:'line',paragraphId:'paragraph',start:0,end:text.length,baseline}],glyphs}),diagnostics:Diagnostic[]=[];
    if(Object.keys(runVariations).length)diagnostics.push({code:'W_PA_FONT_EXPERIMENTAL_AXES',severity:'warning',message:'Variable outline precision is experimental; strict cross-library acceptance is incomplete',details:{scope:'validation-limit'}});
    const missing=layout.glyphs.filter(g=>g.glyphId===0);if(missing.length){const d={code:'W_PA_FONT_MISSING_GLYPH',severity:'warning' as const,message:'Font returned .notdef; no fallback font was selected',details:{clusters:missing.map(g=>g.cluster)}};if(missingGlyph!=='notdef')fail('E_PA_FONT_MISSING_GLYPH',d.message,d.details);diagnostics.push(d);}
    const glyphPaths:ShapedRun['glyphPaths']=[],colorGlyphs:NonNullable<ShapedRun['colorGlyphs']>=[],outlines=new Map<number,number[]>();
    for(const [glyphIndex,g]of layout.glyphs.entries()){
     check();if(paint==='color'){const value=await kernel.color_glyph_paint!(g.glyphId);if(!(value instanceof Float64Array)||value.length<2||value[0]!==1||![-1,0,1].includes(value[1])||value.some(n=>!Number.isFinite(n)))fail('E_PA_FONT_OUTPUT','Invalid color glyph transport');if(value[1]!==-1){colorGlyphs.push({glyphIndex,format:value[1]===0?'colr-v0':'colr-v1'});continue;}}let raw=outlines.get(g.glyphId);if(!raw){const length=await kernel.outline_glyph(g.glyphId);if(!Number.isSafeInteger(length)||length<0)fail('E_PA_FONT_OUTPUT','Invalid outline length');raw=[];for(let start=0;start<length;start+=4096){check();const n=Math.min(4096,length-start),chunk=await kernel.read_outline(start,n);if(!(chunk instanceof Float64Array)||chunk.length!==n||chunk.some(v=>!Number.isFinite(v)))fail('E_PA_FONT_OUTPUT','Invalid outline chunk');raw.push(...chunk);}outlines.set(g.glyphId,raw);}
     if(!raw.length){
      const cluster=text.slice(g.cluster.start,g.cluster.end),ignorableOnly=/^[\s\p{Default_Ignorable_Code_Point}]*$/u.test(cluster);let invisibleMarker=false;
      if(!ignorableOnly&&g.advanceX===0&&g.advanceY===0&&/\p{Default_Ignorable_Code_Point}/u.test(cluster)){
       // HarfRust can use the font's blank space glyph for an invisible format character,
       // sharing a cluster with visible letters/marks. Do not classify every zero-ink glyph as blank.
       // Probe only this branch, under the same shaping conditions; keep one bounded cache slot.
       // All run positions are already JS-owned before probing the immutable font instance.
       const key=JSON.stringify([direction,script,language,features,runSettings]);
       if(spaceGlyph?.key!==key){check();const n=await kernel.shape_run(' ',direction==='rtl'?1:0,script,language,features);let found:number|null=null;if(n===1){const row=await kernel.read_glyphs(0,1);if(row instanceof Float64Array&&row.length===6&&Number.isSafeInteger(row[0])&&row[0]>0&&row[0]<=0xffffffff&&(await kernel.outline_glyph(row[0]))===0)found=row[0];}await kernel.reset_results();check();spaceGlyph={key,glyph:found};}
       invisibleMarker=spaceGlyph.glyph!==null&&g.glyphId===spaceGlyph.glyph;
      }
      if(!ignorableOnly&&!invisibleMarker)fail('E_PA_FONT_OUTLINE','Glyph has no supported vector outline; bitmap/SVG/color glyph rendering is not provided',{glyphId:g.glyphId,cluster:g.cluster});continue;
     }const commands:PathCommand[]=[];let at=0,sequence=0;
     const point=()=>{if(at+2>raw!.length)fail('E_PA_FONT_OUTPUT','Truncated outline');return {id:'p.'+sequence++,x:g.x+raw![at++]*scale,y:g.y-raw![at++]*scale};};
     while(at<raw.length){if(commands.length>=graphics.LIMITS.commands)fail('E_GRAPHICS_LIMIT','Glyph outline exceeds existing PathData budget');const op=raw[at++];if(op===1||op===2)commands.push({op:op===1?'M':'L',point:point()});else if(op===3)commands.push({op:'Q',control:point(),point:point()});else if(op===4)commands.push({op:'C',control1:point(),control2:point(),point:point()});else if(op===5)commands.push({op:'Z'});else fail('E_PA_FONT_OUTPUT','Unknown outline command');}
     glyphPaths.push({glyphIndex,path:graphics.validatePathData({schema:'frameweave.path',version:1,id:g.id,coordinates:identity.coordinates,fillRule:'nonzero',commands})});
    }
    return {layout,glyphPaths,diagnostics,...colorGlyphs.length?{colorGlyphs}:{},fontInstance:{source:{...source},faceIndex:face,variations:runVariations,normalizedCoordinates:runCoordinates}};
   }catch(error){failure=error;throw error;}finally{
    try{if(!closed){if(hasVariationOverride)await kernel.set_variations(variationSettings);await kernel.reset_results();}}catch(cleanup){cancel();throw new EngineError('E_PA_FONT_CLEANUP','Shaping cleanup failed; session terminated',{details:{...(failure?{original:diagnostic(failure)}:{}),cleanup:diagnostic(cleanup)}});}finally{busy=false;}
   }
  },
  async diagnostics(){return {unitsPerEm,busy,closed,...terminated?{termination:'Kit abort; Rust Drop unverified'}:{kernel:await kernel.diagnostics()}};},
  async dispose():Promise<FontDisposal>{if(disposal)return disposal;if(busy)cancel();else closed=true;disposal=(async()=>{try{const result=await kernel.dispose();return terminated?{mode:'terminated' as const}:{mode:'cooperative' as const,remainingSessions:result.remainingSessions};}finally{controller?.abort();signal?.removeEventListener('abort',cancel);}})();return disposal;},
 };
}
