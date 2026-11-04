import {typesettingServices} from './pa3-typesetting.ts';
import {prepareFontFallback} from '../../modules/pro-animation/src/typography/fonts.ts';
import {layoutParagraph,createParagraphIndex} from '../../modules/pro-animation/src/text-layout/index.ts';
export const pathTextSource='AV ffi a\u0327\u0301 אב 123\n日本語の文字 سَلَام 42\nPath motion and native glow';
export async function pathTextServices(){const services=await typesettingServices();try{const fallback=await prepareFontFallback(pathTextSource,{itemizer:services.itemizer,candidates:services.candidates,fontSize:30}),source=await layoutParagraph(pathTextSource,{itemizer:services.itemizer,font:fallback.font,fontForRun:fallback.fontForRun,scriptForRun:fallback.scriptForRun,width:680,wrap:'none',fontSize:30,lineHeight:85,x:20,baseline:60}),index=createParagraphIndex(source);return {...services,source,index,fallback:fallback.report};}catch(error){await services.dispose();throw error;}}
