/** Static authored input fixture; this does not implement an image effect. */
import {mkdir,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import sharp from 'sharp';
import {inputSurface} from '../io/input.ts';
const out=resolve('modules/native-effects/authoring/examples/assets');await mkdir(out,{recursive:true});
await writeFile(join(out,'input.surface.json'),JSON.stringify(inputSurface(160,90))+'\n');
const bytes=Buffer.alloc(160*90*4);for(let y=0;y<90;y++)for(let x=0;x<160;x++){const i=(y*160+x)*4;bytes.set([Math.round(x/159*255),Math.round(y/89*180),Math.round((x<80?.15:.8)*255),255],i);}
await sharp(bytes,{raw:{width:160,height:90,channels:4}}).png().withIccProfile('srgb').toFile(join(out,'input.png'));
console.log(JSON.stringify({ok:true,inputOnly:true,files:['input.surface.json','input.png']}));
