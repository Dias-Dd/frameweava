/** Acceptance-only, immutable local Git source overlay. No fetch/checkouts,
 * shared-file writes, runtime source injection, or SDK lock modifications. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {posix,join,resolve} from 'node:path';
import type {Plugin} from 'esbuild';
import {engineRoot} from '../../../src/compiler/build.ts';
export const mainOwnerCommit='083a1d02976a9bafd5289e378c19a32d46a90ade';
export function useMainOwner(value=process.env.FRAMEWEAVE_GPU_IMAGE_OWNER){
 if(value===undefined||value==='')return false;
 if(value!=='main-083a1d0')throw Error('Unknown acceptance owner; use main-083a1d0 or unset FRAMEWEAVE_GPU_IMAGE_OWNER');
 return true;
}
export type AcceptanceOwner='main-083a1d0'|'main-ae900b6';
export function mainOwnerOverlay(owner:AcceptanceOwner='main-083a1d0'){
 const commit=owner==='main-083a1d0'?mainOwnerCommit:owner==='main-ae900b6'?'ae900b627293ed75295f226e352485c52a3105e2':undefined;if(!commit)throw Error('Unknown fixed acceptance owner');
 const namespace='frozen-main-owner',prefix=engineRoot.replaceAll('\\','/'),sources=new Map<string,Buffer>(),packages=new Set<string>();
 const read=(path:string)=>{if(path.startsWith('../')||posix.isAbsolute(path))throw Error('Snapshot path escaped repository');let bytes=sources.get(path);if(!bytes){bytes=execFileSync('git',['show',`${commit}:${path}`],{cwd:engineRoot,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});sources.set(path,bytes);}return bytes;};
 const plugin:Plugin={name:'fixed-main-owner-acceptance-only',setup(build){
  build.onResolve({filter:/(?:professional|index)\.ts$/},args=>{
   if(args.namespace===namespace)return;
   const full=resolve(args.resolveDir,args.path).replaceAll('\\','/');
   if(full===prefix+'/modules/gpu-effects/professional.ts'||full===prefix+'/modules/gpu-effects/index.ts'&&args.importer.replaceAll('\\','/').endsWith('/gpu-image-effects/compositing.ts'))return {path:'modules/gpu-effects/professional.ts',namespace};
  });
  build.onResolve({filter:/.*/,namespace},async args=>{
   if(args.path.startsWith('.')){
    const base=posix.normalize(posix.join(posix.dirname(args.importer),args.path)),ext=posix.extname(base),candidates=ext==='.js'||ext==='.jsx'?[base,base.slice(0,-ext.length)+'.ts',base.slice(0,-ext.length)+'.tsx']:ext?[base]:[base+'.ts',base+'.tsx',base+'.js',base+'/index.ts'];
    for(const path of candidates)try{read(path);return {path,namespace};}catch(e){if(path===candidates.at(-1))throw e;}
   }
   packages.add(args.path);return build.resolve(args.path,{kind:args.kind,resolveDir:join(engineRoot,posix.dirname(args.importer))});
  });
  build.onLoad({filter:/.*/,namespace},args=>({contents:read(args.path),loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':'js',resolveDir:join(engineRoot,posix.dirname(args.path))}));
 }};
 return {plugin,provenance:()=>({kind:'acceptance-source-overlay',commit,root:'modules/gpu-effects/professional.ts',scope:'Closed static relative source dependencies at the fixed Main commit; current installed external packages. Not a Main SDK/Final/R1 release validation.',files:[...sources].sort(([a],[b])=>a.localeCompare(b)).map(([file,b])=>({file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')})),externalSpecifiers:[...packages].sort()})};
}
