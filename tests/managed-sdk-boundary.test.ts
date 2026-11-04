import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import type {PluginBuild,OnResolveArgs,OnResolveResult} from 'esbuild';
import {installPackages} from '../src/packages/manager.ts';
import {managedContext} from '../src/compiler/managed.ts';

test('managed imports admit the existing locked SDK dependencies but still reject package-private npm, escapes and Node',async()=>{
 const root=resolve('.'),parent=resolve('.frameweave/managed-sdk-boundary');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'case-')),pkg=join(dir,'package'),project=join(dir,'project');await mkdir(pkg);await mkdir(project);
 await writeFile(join(pkg,'main.js'),'export const value=1;');
 await writeFile(join(pkg,'frameweave.package.json'),JSON.stringify({schemaVersion:1,apiVersion:1,id:'test.sdk-boundary',version:'1.0.0',name:'SDK dependency boundary fixture',description:'No execution or permissions',source:{kind:'local',authority:'test.sdk-boundary'},compatible:'0.1.0',platforms:['web','node'],capabilities:[],permissions:{filesystem:false,network:false,process:false},entry:'main',modules:{main:{format:'javascript',path:'./main.js'}}}));
 await installPackages(project,[pkg],{add:['test.sdk-boundary@1.0.0'],trust:['local:test.sdk-boundary']});
 const sdk=join(dir,'sdk');await mkdir(join(sdk,'src'),{recursive:true});await mkdir(join(sdk,'modules'));
 const version=JSON.parse(await readFile(new URL('../node_modules/three/package.json',import.meta.url),'utf8')).version;await writeFile(join(sdk,'package.json'),JSON.stringify({name:'test-sdk',dependencies:{three:version}}));await writeFile(join(sdk,'npm-shrinkwrap.json'),JSON.stringify({packages:{'node_modules/three':{version}}}));
 const context=await managedContext(project,sdk,{}),record=context.state.records[0];assert.ok(record);
 let callback:((args:OnResolveArgs)=>Promise<OnResolveResult|void>)|undefined,resolved='';
 context.plugin().setup({onResolve(_options:unknown,handler:unknown){callback??=handler as typeof callback;},onLoad(){},async resolve(){return {path:resolved,namespace:'file',errors:[],warnings:[],external:false,sideEffects:true,suffix:'',pluginData:undefined};}} as unknown as PluginBuild);
 assert.ok(callback);const args={importer:join(record.directory,'main.js'),path:'three',resolveDir:record.directory,kind:'import-statement',namespace:'file'} as OnResolveArgs;
 resolved=createRequire(import.meta.url).resolve('three');assert.equal((await callback(args))?.path,resolved,'SDK-pinned Three is not a private dependency inside the package');
 const nested=join(record.directory,'node_modules/private/index.js');await mkdir(resolve(nested,'..'),{recursive:true});await writeFile(nested,'export default 1;');resolved=nested;
 await assert.rejects(()=>callback!(args),{code:'E_PLUGIN_PACKAGE'});
 resolved=join(dir,'escape.js');await writeFile(resolved,'export default 2;');await assert.rejects(()=>callback!(args),{code:'E_PLUGIN_PATH'});
 await assert.rejects(()=>callback!({...args,path:'node:fs'}),{code:'E_PACKAGE_PERMISSION'});
 const sdkPrivate=join(sdk,'src/node_modules/private/index.js');await mkdir(resolve(sdkPrivate,'..'),{recursive:true});await writeFile(sdkPrivate,'export default 3;');resolved=sdkPrivate;await assert.rejects(()=>callback!(args),{code:'E_PLUGIN_PACKAGE'});
});
