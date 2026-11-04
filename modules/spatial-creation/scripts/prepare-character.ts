/** Explicit local authoring, not runtime I/O, trust or image generation. */
import {writeFile} from 'node:fs/promises';
import {characterArtwork} from '../character-art.ts';
await writeFile(new URL('../examples/paper-figure.json',import.meta.url),JSON.stringify(characterArtwork(),null,2)+'\n');
console.log('Prepared editable authored MeshData/SkeletonData; no external asset or GPU.');
