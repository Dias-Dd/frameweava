// SPDX-License-Identifier: Apache-2.0
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';import {resolve,join,relative,isAbsolute} from 'node:path';import {createHash} from 'node:crypto';
const kitLockSha='d3d9f1f6283a572b01ef00f8663039c61ee6aa2e580ad92cf6b3b6f47ec675b0',fontSha='a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da',hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
/** Build-time carrier of the fixed public preparation SDK Kit bytes, into the
 * existing R1 module records. It never executes that SDK or downloads a font. */
export async function carryRuntimeAssets(output:string,options:{typographySdk:string;font:string;fontLicense:string}){
 const root=resolve(options.typographySdk,'modules/pro-animation'),lockBytes=await readFile(join(root,'typography-kit-lock.json'));if(hash(lockBytes)!==kitLockSha)throw Error('Reviewed typography Kit lock differs');const lock=JSON.parse(lockBytes.toString()),modules:Record<string,{format:'javascript'|'resource';path:string}>={},sources:any[]=[];
 await mkdir(join(output,'runtime/typography'),{recursive:true});
 for(const id of ['font','paths','itemizer']){const kit=lock.kits[id],source=join(root,'typography-kits',id),target=join(output,'runtime/typography',id);await mkdir(target,{recursive:true});
  for(const [file,expected]of Object.entries(kit.files)){const input=resolve(source,file),rel=relative(source,input);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Kit file escapes fixed SDK');const bytes=await readFile(input);if(hash(bytes)!==expected)throw Error('Kit asset checksum differs: '+id+'/'+file);const to=join(target,file);await mkdir(resolve(to,'..'),{recursive:true});await writeFile(to,bytes);}
  const prefix='typography'+id[0].toUpperCase()+id.slice(1);modules[prefix+'Api']={format:'javascript',path:'./runtime/typography/'+id+'/'+kit.api};
  for(const [name,entry]of Object.entries(kit.modules) as [string,{format:'javascript'|'resource';path:string}][])modules[prefix+name[0].toUpperCase()+name.slice(1)]={format:entry.format,path:'./runtime/typography/'+id+'/'+entry.path.replace(/^\.\//,'')};
  sources.push({id,source:kit.source,sourceCommit:kit.sourceCommit,wasm:kit.wasm,kitLockSha256:kitLockSha});
 }
 const font=await readFile(options.font);if(hash(font)!==fontSha)throw Error('Reviewed unmodified Noto Sans SC source differs');await writeFile(join(output,'runtime/default-font.ttf'),font);const config={schemaVersion:1,defaultFont:'default',defaultLanguage:'zh-Hans',defaultScript:'Hani',fonts:[{id:'default',module:'defaultFont',variations:{wght:400}}]};await writeFile(join(output,'runtime/default-font.json'),JSON.stringify(config)+'\n');
 modules.defaultFont={format:'resource',path:'./runtime/default-font.ttf'};modules.defaultFontConfig={format:'resource',path:'./runtime/default-font.json'};
 const license=await readFile(options.fontLicense);if(createHash('sha1').update('blob '+license.byteLength+'\0').update(license).digest('hex')!=='1c9f43281b8f216c5461fe9ac729afbade7724e4')throw Error('Pinned font OFL license differs');await mkdir(join(output,'licenses/default-font'),{recursive:true});await cp(options.fontLicense,join(output,'licenses/default-font/OFL.txt'));
 await writeFile(join(output,'runtime/SOURCE.json'),JSON.stringify({sources,font:{repository:'https://github.com/google/fonts',commit:'6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec',path:'ofl/notosanssc/NotoSansSC[wght].ttf',sha256:fontSha,bytes:font.byteLength,license:'OFL-1.1',modifications:'none'},runtime:'existing R1 ModuleLoader, original Kit data-v1 and original PA clients; explicit WASM authorization'},null,2)+'\n');return modules;
}
