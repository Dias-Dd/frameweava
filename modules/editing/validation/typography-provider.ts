/** Independent validation adapter, NOT a formal Node/R1 provider. Uses copied, verified build inputs only. */
import {readFile} from 'node:fs/promises';import {resolve,join,relative,isAbsolute} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import type {ModuleLoader} from '../../../src/packages/runtime.ts';import {EngineError} from '../../../src/core/errors.ts';
import * as graphics from '../../graphics-contracts/index.ts';
import {createFontExecutionFont,type FontExecutionFactory} from '../../pro-animation/src/font-execution/kernel.ts';
import {createTextItemizerFromKernel,type TextKernel} from '../../pro-animation/src/text-itemizer.ts';
import {createPathOperationsFromKernel,type PathOpsKernel} from '../../pro-animation/src/path-operations.ts';
import type {TextPreparationOptions} from '../text-node.ts';
export async function validationTypography(options:{allowWasm:boolean;width:number;height:number;font:string}){
 if(options.allowWasm!==true)throw new EngineError('E_PACKAGE_PERMISSION','Typography preparation requires explicit local --allow-wasm');
 const base=resolve('.frameweave/editing/typography-v2'),receipt=JSON.parse(await readFile(join(base,'receipt.json'),'utf8')),sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 const kernel=async(id:string)=>{const record=receipt.kits.find((k:any)=>k.id===id);if(!record)throw Error('Missing reviewed '+id);const folder=join(base,id),modules=JSON.parse(await readFile(join(folder,'bundle.json'),'utf8')).modules;
  for(const [path,hash]of Object.entries(record.files))if(sha(await readFile(join(folder,path)))!==hash)throw Error('Unreviewed local provider bytes '+id+'/'+path);
  const load:ModuleLoader=async(request:any)=>{if(request.dependency)throw Error('No undeclared provider dependency');const m=modules[request.module];if(!m||m.format!==request.format)throw Error('Undeclared provider module '+request.module);const file=resolve(folder,m.path),rel=relative(folder,file);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Unsafe provider path');const bytes=await readFile(file);if(sha(bytes)!==record.files[rel.replaceAll('\\','/')])throw Error('Provider module changed');if(m.format==='resource')return new Uint8Array(bytes)as any;if(request.module!=='binding')throw Error('Only reviewed binding JS is executable');return import(pathToFileURL(file).href)as any;};
  const apiFile=join(folder,'generated/api.ts');if(sha(await readFile(apiFile))!==record.files['generated/api.ts'])throw Error('Generated client changed');const {createEngineApi}=await import(pathToFileURL(apiFile).href);return createEngineApi(load,{worker:false});
 };
 const coordinates={spaceId:'canvas',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:options.width,height:options.height},bytes=new Uint8Array(await readFile(resolve(options.font))),source={kind:'font' as const,resourceId:'caption-font',bytes:bytes.length,sha256:sha(bytes)};
 const owned:{dispose:()=>Promise<unknown>}[]=[];try{const itemizer=await createTextItemizerFromKernel(graphics,await kernel('itemizer')as TextKernel);owned.push(itemizer);const paths=await createPathOperationsFromKernel(graphics,await kernel('paths')as PathOpsKernel);owned.push(paths);const font=await createFontExecutionFont((()=>kernel('font'))as FontExecutionFactory,{bytes,source,coordinates,variations:{wght:400}});owned.push(font);
  return {services:{itemizer,font,pathOperations:paths} satisfies TextPreparationOptions['services'],source,async dispose(){const results=await Promise.allSettled([...owned].reverse().map(s=>s.dispose()));return results.map(r=>r.status==='fulfilled'?r.value:{error:String(r.reason)});}};
 }catch(e){await Promise.allSettled(owned.reverse().map(s=>s.dispose()));throw e;}
}
