// Explicit local preparation utility, not an implicit runtime file loader.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';
import sharp from 'sharp';import {importGltfCharacter} from '../character-import.ts';import {characterDocument} from '../character-animation.ts';
const args=process.argv.slice(2),input=args[0],out=args[args.indexOf('--output')+1];
if(!input||!args.includes('--output')||!out)throw Error('Usage: node --import tsx modules/spatial-creation/scripts/import-character.ts model.glb --output .frameweave/character [--resources explicit-uri-to-file.json]');
const directory=resolve(out),mapping=args.includes('--resources')?JSON.parse(await readFile(resolve(args[args.indexOf('--resources')+1]),'utf8')):{},bytes:Record<string,Uint8Array>={};
for(const [uri,path]of Object.entries(mapping))bytes[uri]=new Uint8Array(await readFile(resolve(String(path))));
const raw=new Uint8Array(await readFile(resolve(input))),data=/\.gltf$/i.test(input)?new TextDecoder().decode(raw):raw,asset=characterDocument(await importGltfCharacter({data,buffers:bytes,images:bytes}));
await mkdir(directory,{recursive:true});const resources:Record<string,unknown>={};
for(const image of asset.images){if(!image.bytes.length)throw Error('Missing explicitly provided texture bytes: '+(image.uri??image.id));const buffer=Buffer.from(image.bytes),info=await sharp(buffer,{limitInputPixels:268402689}).metadata(),name=image.id+(image.mimeType==='image/jpeg'?'.jpg':'.png');if(!info.width||!info.height)throw Error('Image extent missing');await writeFile(join(directory,name),buffer);resources[image.id]={path:name,size:[info.width,info.height],decode:'icc-sdr',missingProfile:'assume-srgb'};image.bytes=[];}
await writeFile(join(directory,'model.character.json'),JSON.stringify(asset)+'\n');await writeFile(join(directory,'image-resources.json'),JSON.stringify(resources,null,2)+'\n');
console.log(JSON.stringify({asset:asset.id,output:directory,nodes:asset.nodes.length,primitives:asset.primitives.length,clips:asset.clips.map(c=>c.id),resources}));
