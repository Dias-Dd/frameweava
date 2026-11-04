/** Explicit trusted local authoring command. This is not Native resource I/O. */
import {writeFile} from 'node:fs/promises';
import {makeCharacter} from './asset.ts';
import {serializeCharacterAsset} from '../../native.ts';
await writeFile(new URL('./character.json',import.meta.url),serializeCharacterAsset(makeCharacter())+'\n');
console.log('Prepared standard MeshData + SkeletonData JSON; no external images or GPU geometry export');
