import {mkdir,readFile,writeFile,copyFile,cp,stat,readdir} from 'node:fs/promises';
import {dirname,resolve,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),workspace=resolve(root,'../../..');
/** Typed R1 source package; no owner copy, install, implicit trust or lock writes. */
export async function buildGpuResidentPackage(output:string){
 output=resolve(output);const rel=relative(join(workspace,'.frameweave'),output);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Use a fresh worktree-private .frameweave package output');
 try{await stat(output);throw Error('Refusing to overwrite an immutable package');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const provenance=JSON.parse(await readFile(join(root,'sources.json'),'utf8'));for(const entry of provenance.sources){const bytes=await readFile(join(root,entry.local??'vendor/effectcraft/'+entry.path));if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Upstream provenance changed: '+entry.path);}
 await mkdir(output,{recursive:true});
 for(const name of ['public.ts','index.ts','bindings.ts','processor.ts','filters.ts','matte.ts','parameters.ts','arithmetic.ts','kernels.ts','matte-kernels.ts']){
  let text=await readFile(join(root,name),'utf8');for(const path of ['core/errors','core/types','core/animation','media/stage','media/surface','media/color'])text=text.replaceAll('../../../src/'+path+'.ts','@frameweave/engine');text=text.replaceAll('../../../src/plugins/sdk.ts','@frameweave/engine/plugins').replaceAll('../../gpu-effects/index.ts','@frameweave/engine/native').replaceAll('../../gpu-effects/pixel-types.ts','@frameweave/engine/native');await writeFile(join(output,name),text);
 }
 for(const name of ['frameweave.package.json','api.d.ts','README.md','MATTE.md','NOTICE','LICENSE.effectcraft','sources.json'])await copyFile(join(root,name),join(output,name));await cp(join(root,'vendor'),join(output,'vendor'),{recursive:true});for(const dir of ['creative','blends','foundations']){const target=join(output,dir);await cp(join(root,dir),target,{recursive:true});for(const entry of await readdir(target,{recursive:true,withFileTypes:true})){if(!entry.isFile()||!entry.name.endsWith('.ts'))continue;const path=join(entry.parentPath,entry.name);let text=await readFile(path,'utf8');text=text.replace(/(?:\.\.\/)+src\/(?:core\/(?:animation|types|time|errors)|media\/(?:surface|color|stage))\.ts/g,'@frameweave/engine').replace(/(?:\.\.\/)+gpu-effects\/(?:index|pixel-types)\.ts/g,'@frameweave/engine/native');await writeFile(path,text);}}
 await copyFile(join(workspace,'licenses/APACHE-2.0.txt'),join(output,'LICENSE'));return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildGpuResidentPackage(process.argv[2]));
