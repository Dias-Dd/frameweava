import {mkdir,readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import {dirname,resolve,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),workspace=resolve(root,'../..');
/** Copies editable typed sources into the existing immutable R1 protocol. */
export async function buildGpuImagePackage(output:string){
 output=resolve(output);const rel=relative(join(workspace,'.frameweave'),output);
 if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('GPU package output must stay in this SDK worktree .frameweave');
 try{await stat(output);throw Error('Refusing to replace an immutable package output');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 await mkdir(output,{recursive:true});
 for(const name of ['public.ts','runtime.ts','parameters.ts','matte-parameters.ts','compositing.ts','reframe.ts','flatten.ts','tile-parameters.ts','tile.ts','raster-bits.ts','exposure.ts','invert.ts','add.ts','invert-matte.ts','replace-matte.ts','modulate.ts','over.ts','nonlinear-blend.ts','screen.ts','multiply.ts','offset-rgb.ts','subtract-matte.ts','crossfade.ts','bindings.ts','index.ts']){
  let text=await readFile(join(root,name),'utf8');
  text=text.replaceAll('../../src/core/errors.ts','@frameweave/engine').replaceAll('../../src/core/animation.ts','@frameweave/engine').replaceAll('../../src/core/types.ts','@frameweave/engine').replaceAll('../../src/media/surface.ts','@frameweave/engine').replaceAll('../../src/media/color.ts','@frameweave/engine').replaceAll('../../src/media/stage.ts','@frameweave/engine').replaceAll('../../src/plugins/sdk.ts','@frameweave/engine/plugins').replaceAll('../gpu-effects/index.ts','@frameweave/engine/native');
  await writeFile(join(output,name),text);
 }
 for(const name of ['frameweave.package.json','api.d.ts','README.md','NOTICE','INVENTORY.md'])await copyFile(join(root,name),join(output,name));
 await copyFile(join(workspace,'licenses/APACHE-2.0.txt'),join(output,'LICENSE'));
 return output;
}
