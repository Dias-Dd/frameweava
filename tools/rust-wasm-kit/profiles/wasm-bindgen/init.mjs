// SPDX-License-Identifier: Apache-2.0
import {mkdir,stat,cp,readFile,writeFile,unlink,readdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),kit=resolve(here,'../..');
export async function initializeBindgen(directory,{id,authority,example='lyon',execution=example==='lyon'?'direct':'worker',version='1.0.0',rustc='1.99.1'}={}){
  if(!/^[a-z][a-z0-9.-]*$/.test(id??'')||!/^[a-z][a-z0-9.-]*$/.test(authority??''))throw Error('Supply --id author.module and --authority reviewed.source');
  if(!['lyon','bindings'].includes(example)||!['direct','worker'].includes(execution)||!/^\d+\.\d+\.\d+$/.test(version)||!/^\d+\.\d+\.\d+$/.test(rustc))throw Error('Invalid wasm-bindgen recipe/version/execution');
  directory=resolve(directory);try{await stat(directory);throw Error(`Refusing to overwrite ${directory}`);}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(dirname(directory),{recursive:true});await cp(join(here,'template'),directory,{recursive:true,errorOnExist:true,force:false});await cp(join(here,'recipes',example),directory,{recursive:true});
  await cp(join(kit,'template/LICENSE'),join(directory,'LICENSE'));await cp(join(kit,'template/licenses'),join(directory,'licenses'),{recursive:true});
  const effect=JSON.parse(await readFile(join(directory,'effect.recipe.json'),'utf8'));effect.id=id;effect.name=id;effect.version=version;await unlink(join(directory,'effect.recipe.json'));
  const snippets={};for(const name of await readdir(join(directory,'rust/js'))){const bytes=await readFile(join(directory,'rust/js',name));snippets[`js/${name}`]={sha256:createHash('sha256').update(bytes).digest('hex')};}
  const emit=(name,value)=>writeFile(join(directory,name),JSON.stringify(value,null,2)+'\n');
  await emit('effect.json',effect);
  await emit('module.config.json',{schemaVersion:2,kitVersion:2,binding:'wasm-bindgen-data-v1',rustc,wasmBindgen:'0.2.129',example,execution,entryClass:'Engine',snippets});
  // WASM-with-imports is data for a checked JS adapter, never mislabeled core-v1.
  await emit('frameweave.package.json',{schemaVersion:1,apiVersion:1,id,version,name:id,description:effect.description,source:{kind:'local',authority},compatible:'^0.1.0',platforms:['web'],capabilities:['wasm','canvas2d'],permissions:{filesystem:false,network:false,process:false},entry:'main',effect:'./effect.json',modules:{main:{format:'javascript',path:'./index.ts'},api:{format:'javascript',path:'./generated/api.ts'},binding:{format:'javascript',path:'./dist/binding.mjs'},bindingBytes:{format:'resource',path:'./dist/binding.mjs'},bytes:{format:'resource',path:'./dist/generated/module_bg.wasm'},worker:{format:'resource',path:'./dist/worker.js'},profile:{format:'resource',path:'./dist/import-profile.json'}},dependencies:{}});
  for(const file of ['index.ts','demo/project.tsx'])await writeFile(join(directory,file),(await readFile(join(directory,file),'utf8')).replaceAll('__REFERENCE__',`${id}@${version}`).replaceAll('__WORKER__',String(execution==='worker')));
  return {directory,id,version,example,execution,template:'wasm-bindgen',next:'node module.mjs fetch; node module.mjs build; node module.mjs test --browser; node module.mjs pack'};
}
