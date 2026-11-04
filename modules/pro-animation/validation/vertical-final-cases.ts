import type {FrameContext} from '../../../src/core/types.ts';import type {NativeVerticalTextOptions} from '../src/font-execution/vertical/native.ts';
export const verticalFinalCases=['tab-start','tab-center','tab-end','tab-decimal','tab-left','hyphen','color-fallback','colrv0','colrv1','colr-opacity','svg','svg-gzip','sbix','cbdt','ebdt','close','tate','tsume','tate-colrv1','tate-svg'] as const;
export function verticalCase(mode:string,c:FrameContext,format:'rgba16float'|'rgba32float',gain=1):{font:string;options:NativeVerticalTextOptions}{
 const transform=()=>({matrix:[1,0,0,1,c.frame*2,0]as const,opacity:.75}),draw={format,ink:[3*gain,-.5*gain,1,.8]as const,transform},base={fontSize:32,baseline:210,y:20,textOrientation:'sideways-right' as const,draw};
 if(mode.startsWith('tab-')){const align=mode.slice(4);return {font:'latin',options:{...base,text:'A\t12.3',textOrientation:align==='left'?'sideways-left':'sideways-right',y:align==='left'?210:20,tabs:{stops:[{position:120,align:align==='left'?'start':align as 'start'|'center'|'end'|'decimal'}]}}};}
 if(mode==='hyphen'||mode==='close')return {font:'latin',options:{...base,text:'ab\u00adcd',inlineSize:58,columnAdvance:40}};
 if(mode==='color-fallback')return {font:'latin',options:{...base,text:'AV',paint:'color'}};
 if(mode==='tate')return {font:'latin',options:{...base,text:'A12ffiB',tateChuYoko:[{start:1,end:3},{start:3,end:6}],inlineSize:84,wrap:'grapheme'}};
 if(mode==='tsume')return {font:'latin',options:{...base,text:'AVffi',tsume:.25+c.frame/128}};
 if(mode==='tate-colrv1'||mode==='tate-svg')return {font:mode==='tate-colrv1'?'colrv1':'svg',options:{...base,text:'AA',fontSize:64,baseline:170,y:70,tateChuYoko:[{start:0,end:2}],paint:mode==='tate-colrv1'?'color':{format:'svg',viewBox:[0,-800,1000,1000],pixelsPerEm:64}}};
 if(mode.startsWith('colr'))return {font:mode==='colrv0'?'colrv0':'colrv1',options:{...base,text:mode==='colrv0'?'B':'A',fontSize:64,baseline:170,y:70,paint:'color',paletteIndex:Math.floor(c.frame)%2}};
 const svg=mode.startsWith('svg');return {font:mode,options:{...base,text:'A',fontSize:64,baseline:170,y:70,paint:svg?{format:'svg',viewBox:[0,-800,1000,1000],pixelsPerEm:64}:{format:mode as 'sbix'|'cbdt'|'ebdt',strikeIndex:mode==='sbix'?1:0}}};
}
