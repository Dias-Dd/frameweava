import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {inputSurface} from './input.ts';
// Static authoring input, not a render or numerical validation.
await mkdir(resolve('modules/native-effects/examples/io-assets'),{recursive:true});
await writeFile(resolve('modules/native-effects/examples/io-assets/input.surface.json'),JSON.stringify(inputSurface(160,128))+'\n');
console.log(JSON.stringify({prepared:true,width:160,height:128,format:'rgba32float'}));
