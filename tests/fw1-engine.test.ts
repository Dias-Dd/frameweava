import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Composition,Stage,Rect,Group,defineManagedComponent,resolveStageEngine} from '../src/index.ts';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import sharp from 'sharp';
const root=join(engineRoot,'.frameweave/fw1-engine');
const req=(id:string,...engines:string[])=>({id,engines});
test('Engine intersections, ambiguity, explicit validation and verified Web default',()=>{
 assert.equal(resolveStageEngine('s',undefined,[]),'web');
 assert.equal(resolveStageEngine('s',undefined,[req('a','native')]),'native');
 assert.equal(resolveStageEngine('s',undefined,[req('a','web','other'),req('b','web')]),'web');
 assert.equal(resolveStageEngine('s','other',[req('a','web','other')]),'other');
 assert.throws(()=>resolveStageEngine('s',undefined,[req('a','native'),req('b','web')]),{code:'E_ENGINE_CONFLICT',stageId:'s'});
 assert.throws(()=>resolveStageEngine('s',undefined,[req('a','a','b')]),{code:'E_ENGINE_AMBIGUOUS'});
 assert.throws(()=>resolveStageEngine('s','a',[req('a','b')]),{code:'E_ENGINE_INCOMPATIBLE'});
});
test('Only called managed components contribute; helpers and Stage factories remain ordinary TS',()=>{
 const Unused=defineManagedComponent(Rect,req('unused','native'));void Unused;
 const A=defineManagedComponent(Rect,req('a','web','native'));
 const B=defineManagedComponent(Rect,req('b','web'));
 const helper=(x:number)=>A({width:x});
 const make=()=>Stage({id:'s',children:Group({children:[helper(10),B({height:3})]})});
 const tvg=Composition({width:32,height:24,fps:30,durationInFrames:1,children:make()});
 assert.equal(tvg.stages[0].engine,'web');assert.ok(!JSON.stringify(tvg).includes('engines'));
 assert.throws(()=>Stage({id:'bad',children:Unused({})}),{code:'E_ENGINE_CONFLICT'});
 assert.throws(()=>Stage({id:'dynamic',entry:'./opaque.ts',requires:[req('x','a','b')]}),{code:'E_ENGINE_AMBIGUOUS'});
 assert.equal(Stage({id:'explicit',entry:'./opaque.ts',engine:'a',requires:[req('x','a','b')]}).spec.engine,'a');
});
async function fixture(pipeline:string,engine?:string,other='web'){
 await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'case-'));
 const manifest=(id:string,engine:string)=>JSON.stringify({schemaVersion:1,id,name:id,version:'1.0.0',kind:'generator',engine,description:'test',apiVersion:1,compatible:'^0.1.0',inputs:{},outputs:{image:'image'},parameters:{}});
 await writeFile(join(dir,'project.tsx'),`import {Composition} from '@frameweave/engine';
 import {defineEffect,PluginStage} from '@frameweave/engine/plugins';
 export const a=defineEffect(${manifest('test.a','web')},{kind:'generator',create:()=>({render:()=>({image:document.createElement('canvas')})})});
 export const b=defineEffect(${manifest('test.b',other)},{kind:'generator',create:()=>({render:()=>({image:document.createElement('canvas')})})});
 const ordinary=()=>1;void ordinary;
 export default <Composition width={32} height={24} fps={30} durationInFrames={1}><PluginStage id="managed" ${engine?`engine="${engine}"`:''} pipeline={${pipeline}}/></Composition>;`);
 return {dir,entry:join(dir,'project.tsx')};
}
test('Actual P4 pipeline inference ignores unused imports, preserves structured conflicts and unavailable adapters',{timeout:120000},async()=>{
 const unused=await fixture('[a.use()]',undefined,'native');
 const built=await buildProject(unused.entry);assert.equal(built.manifest.stages[0].engine,'web');
 const multiple=await fixture('[a.use(),b.use()]');assert.equal((await buildProject(multiple.entry)).manifest.stages[0].engine,'web');
 const conflict=await fixture('[a.use(),b.use()]',undefined,'native');
 await assert.rejects(buildProject(conflict.entry),(e:any)=>e.code==='E_ENGINE_CONFLICT'&&e.stageId==='managed'&&e.details.requirements.length===2);
 const explicit=await fixture('[a.use()]','native');await assert.rejects(buildProject(explicit.entry),{code:'E_ENGINE_INCOMPATIBLE'});
 const unsupported=await fixture('[b.use()]',undefined,'native');await assert.rejects(buildProject(unsupported.entry),{code:'E_ENGINE_UNAVAILABLE'});
});
test('Inferred Web Adapter actually initializes and renders managed TSX deterministically',{timeout:120000},async()=>{
 await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'visual-'));
 await writeFile(join(dir,'project.tsx'),`import {Composition,Stage,Rect,defineManagedComponent,keyframes} from '@frameweave/engine';
 const Box=defineManagedComponent(Rect,{id:'managed.box',engines:['web','other']});
 const dynamicFactory=()=> <Stage id="visual"><Box width={12} height={12} x={keyframes([{frame:0,value:0},{frame:3,value:18}])} fill="#00ff88"/></Stage>;
 export default <Composition width={32} height={24} fps={30} durationInFrames={4}>{dynamicFactory()}</Composition>;`);
 const built=await buildProject(join(dir,'project.tsx'));const renderer=await Renderer.create(built,{cache:false});
 try{const frames=new Map<number,Buffer>();for(const frame of [0,2,3,0]){const image=(await renderer.renderFrame(frame)).png;assert.equal((await sharp(image).metadata()).width,32);if(frames.has(frame))assert.deepEqual(image,frames.get(frame));frames.set(frame,image);await writeFile(join(dir,`frame-${frame}.png`),image);}assert.notDeepEqual(frames.get(0),frames.get(3));}
 finally{await renderer.close();}
 await writeFile(join(root,'evidence.json'),JSON.stringify({dir,engine:built.manifest.stages[0].engine}));
});

test('A unique non-Web Engine dispatches only through the existing explicitly registered Adapter',{timeout:120000},async()=>{
 await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'adapter-'));
 await writeFile(join(dir,'project.ts'),`import {Composition,Stage,defineManagedComponent} from '@frameweave/engine';
 const MathNode=defineManagedComponent(()=>Stage({id:'math',outputs:{value:'number'}}),{id:'math.contract',engines:['fw1-arithmetic']});
 export default Composition({width:32,height:24,fps:30,durationInFrames:3,children:MathNode({})});`);
 const built=await buildProject(join(dir,'project.ts'));assert.equal(built.manifest.stages[0].engine,'fw1-arithmetic');
 await assert.rejects(Renderer.create(built),{code:'E_BACKEND_UNAVAILABLE'});
 let initialized=0,disposed=0;
 Renderer.registerAdapter('fw1-arithmetic',()=>({engine:'fw1-arithmetic',async init(){initialized++;},async renderAt(_stage,context){return {outputs:{value:context.frame*context.frame},diagnostics:[]};},async dispose(){disposed++;}}));
 const r=await Renderer.create(built,{cache:false});try{assert.equal(initialized,1);assert.equal((await r.evaluateFrame(2)).stageOutputs.math.value,4);assert.equal((await r.evaluateFrame(0)).stageOutputs.math.value,0);}finally{await r.close();}
 assert.equal(disposed,1);
});
