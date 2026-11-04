import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {resolveStageEngine} from '../src/core/engine-inference.ts';
import {Composition,Stage} from '../src/core/authoring.ts';
import {validateTVG} from '../src/core/graph.ts';
import {Renderer} from '../src/render/renderer.ts';
import {validatePackage} from '../src/packages/manifest.ts';
import {nativeHostPolicy} from '../modules/spidermonkey-host/policy.ts';
import {defineNativeStage} from '../modules/native-gpu/authoring.ts';
import {createNativeProfessionalEffects} from '../modules/native-effects/extended.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';

test('visual inference selects Native and rejects explicit/required Web',()=>{
 assert.equal(resolveStageEngine('image',undefined,[]),'native-gpu');
 assert.throws(()=>resolveStageEngine('image','web',[]),{code:'E_WEB_REMOVED'});
 assert.throws(()=>resolveStageEngine('image',undefined,[{id:'old',engines:['web']}]),{code:'E_WEB_REMOVED'});
 assert.equal(resolveStageEngine('image',undefined,[{id:'both',engines:['web','native-gpu']}]),'native-gpu');
 assert.throws(()=>Stage({id:'old',engine:'web'}),{code:'E_WEB_REMOVED'});
 assert.throws(()=>Stage({id:'old',children:[]}),{code:'E_WEB_REMOVED'});
});
test('raw TVG cannot bypass Web retirement or launch a browser',async()=>{
 const manifest=Composition({width:16,height:16,fps:24,durationInFrames:2,children:[Stage({id:'image',factory:defineNativeStage(()=>({renderAt(){throw Error('unused');}}))})]});
 manifest.stages[0].engine='web';
 assert.ok(validateTVG(manifest).some(d=>d.code==='E_WEB_REMOVED'&&d.stageId==='image'));
 await assert.rejects(Renderer.create({manifest,dir:resolve('.'),hash:'old-web',assets:{},stageBundles:{}}),error=>error instanceof Error&&error.message.includes('E_WEB_REMOVED'));
});
test('Native package survives and Web managed bindings are explicitly refused',async()=>{
 const manifest=JSON.parse(await readFile('modules/native-effects/frameweave.package.json','utf8'));
 validatePackage(manifest);assert.ok(manifest.bindings);assert.equal(manifest.bindings.engine,'native-gpu');
 const legacy={...manifest,bindings:{...manifest.bindings,schemaVersion:1,engine:'web'}};
 assert.throws(()=>validatePackage(legacy),{code:'E_WEB_REMOVED'});
 assert.equal(typeof createNativeProfessionalEffects,'function');
});
test('Servo, SpiderMonkey and Native React remain; retired Web implementations and exports do not',async()=>{
 for(const file of ['modules/servo/index.ts','modules/spidermonkey-host/runtime.ts','modules/spidermonkey-host/transport.ts','modules/native-gpu/react.tsx'])await access(file);
 const packages=JSON.parse(await readFile('package.json','utf8'));assert.ok(packages.dependencies.react);assert.ok(packages.dependencies['react-reconciler']);assert.ok(!packages.exports['./web']);
 for(const file of ['src/web/api.ts','src/web/bootstrap.ts','src/web/declarative.ts','src/render/web-adapter.ts','src/render/compositor.ts','src/render/presentation.ts','modules/native-gpu/web-bridge.ts','modules/gpu-effects/core.ts','modules/gpu-effects/pixel-scope.ts','modules/gpu-image-effects/resident/processor.ts','modules/gpu-image-effects/resident/frameweave.package.json','modules/gpu-image-effects/frameweave.package.json'])await assert.rejects(access(file));
 const build={manifest:{stages:[{engine:'native-gpu',entry:'image.js'}]}} as Parameters<typeof nativeHostPolicy>[0];
 assert.equal(nativeHostPolicy(build,'spidermonkey').needsSpiderMonkey,true);
 assert.throws(()=>nativeHostPolicy(build,'chromium'),{code:'E_NATIVE_LOGIC_HOST'});
});
test('Native scopes expose no old Canvas presentation or per-effect image readback',async()=>{
 const scope=new NativeRecordingScope();
 await assert.rejects(scope.api.present(undefined as never,{profile:'aces2-sdr100-v1',clip:true}));await assert.rejects(scope.api.readback(undefined as never));
 await scope.api.dispose();
});
