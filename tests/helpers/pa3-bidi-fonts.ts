import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import * as graphics from '../../modules/graphics-contracts/index.ts';
import {createFontShaper} from '../../modules/pro-animation/src/font-shaping.ts';
import {directShapingFactory} from './pa3-shaping.ts';
import sources from '../../modules/pro-animation/validation/bidi-scene/font-sources.json';
export const bidiCoordinates={spaceId:'canvas',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:1280,height:300};
export async function bidiFont(id:string){const source=sources.find(s=>s.id===id)!;if(!source)throw Error('Explicit fixture font required');const bytes=await readFile(resolve('modules/pro-animation/validation/bidi-scene',source.asset));return createFontShaper(graphics,directShapingFactory,{bytes,coordinates:bidiCoordinates,source:{kind:'font',resourceId:id,bytes:source.font.bytes,sha256:source.font.sha256}});}
