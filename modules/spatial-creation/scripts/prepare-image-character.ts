/** Explicit offline artwork authoring only. Runtime uses declared image import.
 * Existing Core transfer encoding and Sharp SVG rasterizer; no effect fallback. */
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import sharp from 'sharp';
import {characterArtwork,characterPalette} from '../character-art.ts';
import {transformPixels} from '../../../src/media/color.ts';import {linear709,srgb} from '../../../src/media/surface.ts';
const art=characterArtwork(),paints=Object.values(characterPalette).map(rgb=>{const p=transformPixels(Float32Array.of(...rgb,1),linear709,srgb,'straight').pixels;return 'rgb('+[...p.subarray(0,3)].map(v=>Math.round(v*255)).join(',')+')';}),m=art.mesh;
const triangles=Array.from({length:m.indices.length/3},(_,i)=>m.indices.slice(i*3,i*3+3)).sort((a,b)=>m.restPositions[a[0]][2]-m.restPositions[b[0]][2]);
const parts=new Map<string,{color:string;paths:string[]}>();for(const t of triangles){const index=t[0],paint=Math.floor(m.uv![index][0]*6),key=art.skeleton.weights[index].influences[0].boneId+':'+m.restPositions[index][2]+':'+paint;let part=parts.get(key);if(!part){part={color:paints[paint],paths:[]};parts.set(key,part);}part.paths.push(t.map((i,j)=>(j?'L':'M')+m.restPositions[i].slice(0,2).join(',')).join('')+'Z');}
// One compound path per original patch avoids antialiasing cracks between its triangles.
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="-1 -1.5 2 3"><title>Original Frameweave paper artwork, Apache-2.0</title><g transform="scale(1,-1)">'+[...parts.values()].map(p=>'<path fill="'+p.color+'" d="'+p.paths.join('')+'"/>').join('')+'</g></svg>\n';
await writeFile(new URL('../examples/image-character.svg',import.meta.url),svg);
await sharp(Buffer.from(svg)).withIccProfile('srgb').png().toFile(fileURLToPath(new URL('../examples/image-character.png',import.meta.url)));
const joints=Object.fromEntries(art.skeleton.bones.map(b=>[b.id,[(b.bindMatrix[12]+1)/2,(1.5-b.bindMatrix[13])/3]]));
await writeFile(new URL('../examples/image-character-joints.ts',import.meta.url),"import type {ImageCharacterJoints} from 'spatial-creation-candidate';\n// Static source UV landmarks: top-left0/0, right/down positive. Edit for your art.\nexport const joints="+JSON.stringify(joints,null,2)+" as const satisfies ImageCharacterJoints;\n");
console.log('Prepared original SVG/tagged PNG and explicit UV landmarks; no runtime image analysis.');
