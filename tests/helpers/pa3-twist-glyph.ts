import {readFile} from 'node:fs/promises';
import * as graphics from '../../modules/graphics-contracts/index.ts';
import {createFontShaper} from '../../modules/pro-animation/src/font-shaping.ts';
import {glyphOptions} from '../../modules/pro-animation/validation/twist-scene/shapes.ts';
import {directShapingFactory} from './pa3-shaping.ts';
import sources from '../../modules/pro-animation/validation/shaping-scene/font-sources.json';
export async function sceneGlyph(){const record=sources.find(f=>f.id==='notosans')!,coordinates={spaceId:'canvas',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:640,height:240},font=await createFontShaper(graphics,directShapingFactory,{coordinates,bytes:await readFile('modules/pro-animation/validation/shaping-scene/fonts/notosans.ttf'),source:{kind:'font',resourceId:'notosans',bytes:record.font.bytes,sha256:record.font.sha256}});try{return (await font.shapeRun('R',glyphOptions)).glyphPaths[0].path;}finally{await font.dispose();}}
