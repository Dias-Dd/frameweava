/** Node-only acceptance packaging. Main owns official catalog/export wiring. */
import {build} from 'esbuild';
import {join,resolve,isAbsolute} from 'node:path';
import {cp} from 'node:fs/promises';
import {engineRoot} from '../../../src/compiler/build.ts';
import {mainOwnerOverlay,type AcceptanceOwner} from './main-owner.ts';
export async function bundleGpuImageFixture(pack:string,owner?:AcceptanceOwner){
 const snapshot=owner?mainOwnerOverlay(owner):undefined;
 for(const [entry,name]of [['public.ts','main.js'],['bindings.ts','bindings.js']])await build({entryPoints:[join(engineRoot,'modules/gpu-image-effects',entry)],outfile:join(pack,name),bundle:true,format:'esm',platform:'browser',target:'chrome120',logLevel:'silent',plugins:[...snapshot?[snapshot.plugin]:[],{name:'reuse-existing-sdk-and-compositor',setup(b){b.onResolve({filter:/.*/},arg=>{
  if(!arg.path.startsWith('.')&&!isAbsolute(arg.path))return;
  const full=resolve(arg.resolveDir,arg.path).replaceAll('\\','/'),root=engineRoot.replaceAll('\\','/');
  if(full===root+'/modules/gpu-effects/index.ts'){
   // This baseline's SDK/web exports Pixel Pass, but not the already-supported
   // Stage-local compositor. Bundle that *unchanged* module for this fixture;
   // never retrieve a private device or create an alternative implementation.
   if(arg.importer.replaceAll('\\','/').endsWith('/gpu-image-effects/compositing.ts'))return {path:join(engineRoot,'modules/gpu-effects/professional.ts')};
   return {path:'@frameweave/engine/native',external:true};
  }
  if(full.startsWith(root+'/src/core/')||/^\/(?:surface|color|stage)\.ts$/.test(full.slice((root+'/src/media').length))&&full.startsWith(root+'/src/media/'))return {path:'@frameweave/engine',external:true};
  // Existing compositor/affine utility source is bundled without modification;
  // public Surface/colour primitives above still share the SDK implementation.
 });}}]});
 await cp(join(engineRoot,'modules/gpu-image-effects/api.d.ts'),join(pack,'api.d.ts'));
 return snapshot?.provenance()??{kind:'checkout-owner' as const};
}
