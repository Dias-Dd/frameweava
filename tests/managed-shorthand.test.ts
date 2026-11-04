import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {installPackages} from '../src/packages/manager.ts';
import {writeLock} from '../src/plugins/registry.ts';
import {buildProject,alias,engineRoot} from '../src/compiler/build.ts';
import {managedContext} from '../src/compiler/managed.ts';
import {Renderer} from '../src/render/renderer.ts';
test('managed shorthand value symbols initialize shared aliased imports in two factories, without unrelated imports',{timeout:45000},async()=>{
 const base=resolve('artifacts/main-spatial-compute');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'shorthand-')),pack=join(dir,'package'),author=join(dir,'author');await mkdir(pack);await mkdir(author);process.env.FRAMEWEAVE_HOME=join(dir,'home');
 await writeFile(join(pack,'frameweave.package.json'),JSON.stringify({schemaVersion:1,apiVersion:1,id:'test.shorthand',version:'1.0.0',compatible:'0.1.0',name:'Shorthand regression',description:'Reviewed no-GPU numeric fixture',source:{kind:'local',authority:'test.shorthand'},platforms:['web'],capabilities:[],permissions:{filesystem:false,network:false,process:false},modules:{main:{format:'javascript',path:'./index.ts'}},bindings:{schemaVersion:1,module:'main',types:'./api.d.ts',engine:'web'}}));
 await writeFile(join(pack,'index.ts'),'export function first(){return 7;}export function second(){return 9;}export function unused(){throw Error("UNUSED");}');
 await writeFile(join(pack,'api.d.ts'),'export interface TypeOnly {value:number} export declare function first():number;export declare function second():number;export declare function unused():number;');
 const entry=join(author,'project.tsx');await writeFile(entry,`import {Composition,Stage} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';import {first as one,second,unused} from 'test.shorthand';import type {TypeOnly} from 'test.shorthand';const functions={one,second};export const a=defineWebStage(()=>({renderAt(){const typed:TypeOnly={value:functions.one()};return typed;}}));export const b=defineWebStage(()=>({renderAt(){return {value:functions.second()};}}));export const unrelated=defineWebStage(()=>({renderAt(){return {value:42};}}));export default <Composition width={2} height={2} fps={1} durationInFrames={1}><Stage id="a" factory={a} outputs={{surface:'surface',value:'number'}}/><Stage id="b" factory={b} outputs={{surface:'surface',value:'number'}}/></Composition>;`);
 await installPackages(author,[pack],{trust:['local:test.shorthand']});await writeLock(author);const built=await buildProject(entry),r=await Renderer.create(built,{cache:false});try{const frame=await r.renderFrame(0);assert.equal(frame.stageOutputs.a.value,7);assert.equal(frame.stageOutputs.b.value,9);}finally{await r.close();await r.close();}
 const managed=await managedContext(author,engineRoot,alias);for(const name of ['a','b']){const uses=await managed.factoryUses(entry,name);assert.deepEqual(uses,[{ref:'test.shorthand@1.0.0',names:['first','second']}]);}assert.deepEqual(await managed.factoryUses(entry,'unrelated'),[]);
});
