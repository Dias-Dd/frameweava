import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';import {resolve,join} from 'node:path';
import {prepareServo,writeServoDocument} from '../modules/servo/node.ts';
import {servoStage} from '../modules/servo/index.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import type {FrameContext} from '../src/core/types.ts';
const context:FrameContext={frame:0,globalFrame:0,time:0,globalTime:0,dt:1/24,progress:0,fps:{num:24,den:1},durationInFrames:24,seed:1};
async function fixture(html='<div>hello</div>'){
 const parent=resolve('.frameweave/servo-authoring-unit');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'p-'));await writeFile(join(root,'index.html'),html);return root;
}
test('servoStage creates one existing module, forwards evaluated props, and disposes idempotently',async()=>{
 const scope=new NativeRecordingScope(),factory=servoStage({html:'<div>Hello</div>',css:'div{opacity:var(--opacity)}',javascript:'window.frameweaveRender=(c,p)=>{};',defaults:{opacity:.25},variables:{'--opacity':'opacity'}});
 const instance=await factory({gpu:scope.api,width:16,height:8,seed:1,resources:{}});scope.sealInitialization();
 for(const opacity of [.5,1]){scope.beginFrame();scope.publish(await instance.renderAt(context,{}, {opacity}));const p=scope.packet();assert.equal(p.modules?.length,opacity===.5?1:0);if(p.modules?.length){assert.ok(p.modules[0].javascript?.includes('--fw-time'));assert.ok(p.modules[0].javascript?.includes('--opacity'));assert.equal(p.modules[0].profile,'sdr-srgb8');}const words=p.parameters[0],buffer=Buffer.alloc((words.length-1)*4);words.slice(1).forEach((v,i)=>buffer.writeUInt32LE(v,i*4));assert.equal(JSON.parse(buffer.subarray(0,words[0]).toString()).parameters.opacity,opacity);}
 await instance.dispose?.();await instance.dispose?.();assert.throws(()=>instance.renderAt(context,{}, {opacity:.5}),{code:'E_NATIVE_MODULE_CLOSED'});await scope.api.dispose();
 assert.throws(()=>servoStage({variables:{'--fw-time':'bad'}}),{code:'E_SERVO_OPTIONS'});
 assert.equal(Object.hasOwn(new NativeRecordingScope().packet(false),'residentLive'),false,'legacy packets must not acquire host-only resident metadata');
 const missing=await servoStage({input:'source'})({gpu:new NativeRecordingScope().api,width:16,height:8,seed:1,resources:{}});assert.throws(()=>missing.renderAt(context,{},{}),{code:'E_SERVO_INPUT'});await missing.dispose?.();
});
test('prepared local HTML/CSS/JS closure is self contained, deterministic and typed-source writable',async()=>{
 const root=await fixture('<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head><body><img src="./logo.png"><div class="box">hello</div><script type="module" src="./main.js"></script></body></html>');
 await writeFile(join(root,'style.css'),'@import "./theme.css";.box > b{background-image:url("./logo.png")}@font-face{font-family:local;src:url("./font.woff2")}');await writeFile(join(root,'theme.css'),'.box{color:red}');await writeFile(join(root,'logo.png'),Buffer.of(137,80,78,71));await writeFile(join(root,'font.woff2'),'fixture-only-unit-font');await writeFile(join(root,'main.js'),'import {answer} from "./values.js";window.frameweaveRender=(c,p)=>{document.body.dataset.answer=String(answer)};');await writeFile(join(root,'values.js'),'export const answer=42;');
 const resources={page:'index.html',style:'style.css',theme:'theme.css',logo:'logo.png',font:'font.woff2',main:'main.js',values:'values.js'},document=await prepareServo({root,entry:'page',resources});
 assert.deepEqual(document,await prepareServo({root,entry:'page',resources}));assert.equal(document.resources.length,7);assert.ok(document.html.includes('data:image/png;base64,'));assert.ok(document.html.includes('data:font/woff2;base64,'));assert.ok(document.html.includes('.box>b'));assert.ok(!document.html.includes('&gt;'));assert.ok(!document.html.includes('<script'));assert.ok(document.javascript.includes('42'));assert.ok(!JSON.stringify(document).includes(root));
 await writeServoDocument(join(root,'generated/document.ts'),document);assert.ok((await readFile(join(root,'generated/document.ts'),'utf8')).includes('as const'));
 await writeFile(join(root,'LICENSE'),'Fixture notice');const notices=await prepareServo({root,entry:'page',resources:{...resources,license:'LICENSE'},notices:['license']});assert.deepEqual(notices.notices,[{id:'license',text:'Fixture notice'}]);
 await assert.rejects(prepareServo({root,entry:'page',resources:{page:'index.html'}}),{code:'E_SERVO_UNDECLARED_RESOURCE'});
 await assert.rejects(prepareServo({root,entry:'page',resources,maxSourceBytes:4}),{code:'E_SERVO_BUDGET'});
 await assert.rejects(prepareServo({root,entry:'page',resources,maxPreparedBytes:4}),{code:'E_SERVO_BUDGET'});
});
test('preparation explicitly rejects remote, undeclared, dynamic and unsupported content',async()=>{
 for(const [html,code]of [['<img src="https://example.invalid/logo.png">','E_SERVO_RESOURCE_URL'],['<img src="../escape.png">','E_SERVO_RESOURCE_URL'],['<script>import("./later.js")</script>','E_SERVO_DYNAMIC_IMPORT'],['<div onclick="alert(1)">bad</div>','E_SERVO_INLINE_HANDLER'],['<iframe src="./x.html"></iframe>','E_SERVO_HTML_FEATURE'],['<img srcset="a 1x">','E_SERVO_HTML_FEATURE'],['<script async src="./main.js"></script>','E_SERVO_SCRIPT_ORDER']]){const root=await fixture(html);await assert.rejects(prepareServo({root,entry:'page',resources:{page:'index.html'}}),{code});}
});
