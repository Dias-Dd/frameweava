import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import * as graphics from '../../modules/graphics-contracts/index.ts';
import {createFontShaper} from '../../modules/pro-animation/src/font-shaping.ts';
import {createTextItemizer,type TextItem} from '../../modules/pro-animation/src/text-itemizer.ts';
import {directShapingFactory} from './pa3-shaping.ts';
import {directTextLinesFactory} from './pa3-text-lines.ts';
import sources from '../../modules/pro-animation/validation/bidi-scene/font-sources.json';
export const paragraphText='AV ffi a\u0301 אב 123. A long caption for shaping.\n日本語の文字 سَلَام 42.\nאב 123 abc';
export async function paragraphServices(){
 const coordinates={spaceId:'canvas',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:720,height:360},fonts=new Map<string,Awaited<ReturnType<typeof createFontShaper>>>(),itemizer=await createTextItemizer(graphics,directTextLinesFactory);
 try{for(const source of sources){const bytes=await readFile(resolve('modules/pro-animation/validation/bidi-scene',source.asset));fonts.set(source.id,await createFontShaper(graphics,directShapingFactory,{bytes,coordinates,source:{kind:'font',resourceId:source.id,bytes:source.font.bytes,sha256:source.font.sha256}}));}}
 catch(error){await Promise.all([itemizer.dispose(),...[...fonts.values()].map(f=>f.dispose())]);throw error;}
 const script=(item:TextItem)=>item.script??(item.scriptCandidates.includes('Latn')?'Latn':item.scriptCandidates[0]??'Zyyy'),fontForRun=(item:TextItem)=>fonts.get(script(item)==='Hebr'?'notosanshebrew':script(item)==='Arab'?'notonaskharabic':['Hani','Hira','Kana'].includes(script(item))?'notosansjp':'notosans')!;
 const options={itemizer,font:fonts.get('notosans')!,fontForRun,scriptForRun:script};return {...options,options,fonts,async dispose(){return {text:await itemizer.dispose(),fonts:await Promise.all([...fonts.values()].map(f=>f.dispose()))};}};
}
