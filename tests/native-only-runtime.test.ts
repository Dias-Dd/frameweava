import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {resolveStageEngine} from '../src/core/engine-inference.ts';
import {Stage} from '../src/core/authoring.ts';
import {nativeHostPolicy,selectedLogicEngine} from '../modules/spidermonkey-host/policy.ts';
import {assertNativeExecution,assertWasmOption} from '../src/runtime/execution-policy.ts';
import {validatePackage} from '../src/packages/manifest.ts';
import {initProject} from '../src/workflow.ts';
import {buildProject} from '../src/compiler/build.ts';

test('the default Stage engine is Native and removed Web choices never fall back',()=>{
 assert.equal(resolveStageEngine('scene',undefined,[]),'native-gpu');
 for(const run of [()=>resolveStageEngine('old','web',[]),()=>Stage({id:'old',engine:'web'}),()=>assertNativeExecution([{id:'old',engine:'web'}])])assert.throws(run,{code:'E_WEB_REMOVED',stageId:'old'});
 assert.throws(()=>nativeHostPolicy({manifest:{stages:[{id:'old',engine:'web'}]}} as any),{code:'E_WEB_REMOVED'});
 for(const host of ['chromium','v8','auto'])assert.throws(()=>selectedLogicEngine(host),{code:'E_NATIVE_LOGIC_HOST'});
 assert.equal(selectedLogicEngine('spidermonkey'),'spidermonkey');
});

test('WASM authorization remains explicit and strictly boolean',()=>{
 for(const value of [undefined,false,true])assert.doesNotThrow(()=>assertWasmOption(value));
 for(const value of ['true',1,null,{}])assert.throws(()=>assertWasmOption(value),{code:'E_ARGUMENT'});
});

test('Chromium dependencies, old browser SDK and executable browser runtimes are absent',async()=>{
 const pkg=JSON.parse(await readFile('package.json','utf8')),lock=JSON.parse(await readFile('package-lock.json','utf8'));
 for(const name of ['playwright','playwright-core','react-dom','pixi.js']){
  assert.equal(pkg.dependencies[name],undefined);assert.equal(lock.packages['node_modules/'+name],undefined);
 }
 assert.equal(pkg.exports['./web'],undefined);
 for(const file of ['src/web/api.ts','src/web/bootstrap.ts','src/render/web-adapter.ts','src/render/server.ts','src/render/compositor.ts','modules/native-gpu/web-bridge.ts'])await assert.rejects(access(file),{code:'ENOENT'});
 for(const file of ['modules/servo/index.ts','modules/servo/native/lib.rs','modules/servo/clock.ts','modules/spidermonkey-host/transport.ts','modules/spidermonkey-host/src/main.rs'])await access(file);
 for(const file of ['src/render/renderer.ts','modules/native-gpu/logic-host.ts','modules/native-gpu/logic-bootstrap.ts','modules/spidermonkey-host/transport.ts']){
  const source=await readFile(file,'utf8');assert.doesNotMatch(source,/from\s*['"]playwright|chromium\.launch|chromiumTransport|new WebAdapter|new NativeWebBridge|window\.addEventListener/);
 }
 const protocol=await readFile('modules/native-gpu/src/protocol.rs','utf8');assert.doesNotMatch(protocol,/BridgeRead|pub bridge:/);
});

test('Native R1 bindings remain valid and old Web bindings are explicitly refused',async()=>{
 const source=JSON.parse(await readFile('modules/native-effects/frameweave.package.json','utf8'));validatePackage(source);
 const legacy:any=structuredClone(source);legacy.bindings={...legacy.bindings,schemaVersion:1,engine:'web',gpuApi:'webgpu'};
 assert.throws(()=>validatePackage(legacy),{code:'E_WEB_REMOVED'});
});

test('new-project scaffolding compiles a real SpiderMonkey Native Stage without a browser SDK',async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');
 const base=resolve('.frameweave/native-only-runtime-test');await mkdir(base,{recursive:true});
 const parent=await mkdtemp(join(base,'project-')),created=await initProject([join(parent,'scene')]);
 const build=await buildProject(created.entry);assert.equal(build.manifest.stages.length,1);assert.equal(build.manifest.stages[0].engine,'native-gpu');
 const bundle=await readFile(join(build.dir,build.stageBundles.artwork),'utf8');assert.doesNotMatch(bundle,/new WebAdapter|chromiumTransport|frameweave-connect/);
 assert.match(bundle,/__frameweaveNativeHost/);
});
