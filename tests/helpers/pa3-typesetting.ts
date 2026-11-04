import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import * as graphics from '../../modules/graphics-contracts/index.ts';
import {createTextItemizer} from '../../modules/pro-animation/src/text-itemizer.ts';
import {createFontInspector} from '../../modules/pro-animation/src/typography/fonts.ts';
import {directTextLinesFactory} from './pa3-text-lines.ts';
import {directFontMetadataFactory} from './pa3-font-metadata.ts';
import sources from '../../modules/pro-animation/validation/bidi-scene/font-sources.json';
export async function typesettingServices(){
 const coordinates={spaceId:'canvas',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:720,height:400},fonts=new Map<string,Awaited<ReturnType<typeof createFontInspector>>>(),itemizer=await createTextItemizer(graphics,directTextLinesFactory);
 try{for(const s of sources){const bytes=await readFile(resolve('modules/pro-animation/validation/bidi-scene',s.asset));fonts.set(s.id,await createFontInspector(directFontMetadataFactory,{bytes,coordinates,source:{resourceId:s.id,kind:'font',sha256:s.font.sha256,bytes:s.font.bytes}}));}}
 catch(error){await itemizer.dispose();await Promise.all([...fonts.values()].map(f=>f.dispose()));throw error;}
 return {itemizer,fonts,candidates:[...fonts.values()],dispose:async()=>({text:await itemizer.dispose(),fonts:await Promise.all([...fonts.values()].map(f=>f.dispose()))})};
}
