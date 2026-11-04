import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'../../..'),receipt=JSON.parse(await readFile(join(root,'docs/main-typography-ingress/receipt.json'),'utf8'));
const target=join(root,'modules/pro-animation/typography-kits'),sha=b=>createHash('sha256').update(b).digest('hex');
function inside(base,name){const path=resolve(base,name),rel=relative(base,path);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Invalid Kit artifact path');return path;}
async function immutable(path,bytes){try{const old=await readFile(path);if(sha(old)!==sha(bytes))throw Error('Refusing changed Kit artifact; review and version the new delivery: '+path);return;}catch(e){if(e.code!=='ENOENT')throw e;}await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}
const lock={schemaVersion:1,id:'frameweave.typography-kits',version:'1.0.0',trust:'fixed SDK data/code; no arbitrary local Kit roots',kits:{}};
for(const kit of receipt.kits){
 const source=await realpath(kit.directory),out=join(target,kit.id),files={};
 for(const [name,expected]of Object.entries(kit.files)){const file=inside(source,name);if(await realpath(file)!==file)throw Error('Kit symlink is not allowed');const bytes=await readFile(file);if(sha(bytes)!==expected)throw Error('Kit delivery changed: '+name);await immutable(inside(out,name),bytes);files[name]=expected;}
 const compiled=await build({absWorkingDir:root,entryPoints:[join(out,'generated/api.ts')],bundle:true,write:false,metafile:true,format:'esm',platform:'node',target:'node22',legalComments:'inline',logLevel:'silent'});
 if(Object.values(compiled.metafile.outputs).some(o=>o.imports.length))throw Error('Node Kit factory must have no external runtime imports');
 const api=compiled.outputFiles[0].contents;await immutable(join(out,'api.mjs'),api);files['api.mjs']=sha(api);
 lock.kits[kit.id]={source:kit.source,sourceCommit:kit.commit,wasm:kit.wasm,buildSha256:kit.buildSha256,api:'api.mjs',modules:kit.modules,files};
}
const text=JSON.stringify(lock,null,2)+'\n';await immutable(join(root,'modules/pro-animation/typography-kit-lock.json'),Buffer.from(text));
await immutable(join(root,'modules/pro-animation/typography-kit-identity.ts'),Buffer.from(`// Generated from the reviewed fixed SDK Kit lock.\nexport const typographyKitIntegrity=${JSON.stringify(sha(Buffer.from(text)))};\n`));
console.log(JSON.stringify({ok:true,kits:Object.keys(lock.kits),files:Object.values(lock.kits).reduce((n,k)=>n+Object.keys(k.files).length,0)}));
