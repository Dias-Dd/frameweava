import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {commandArguments,transpileReplInput} from '../modules/repl/index.ts';
import {createReplSession} from '../modules/repl/session.ts';
const root=resolve('.'),proof=join(root,'artifacts/dx-1d');
test('REPL arguments are not shell code and TS syntax errors are rejected',()=>{
  assert.deepEqual(commandArguments('--trusted-local-code "a folder/scene.tsx"'),['--trusted-local-code','a folder/scene.tsx']);
  assert.deepEqual(commandArguments('C:\\test\\scene.tsx'),['C:\\test\\scene.tsx']);
  assert.throws(()=>commandArguments('"broken'),SyntaxError);
  assert.match(transpileReplInput('let x: number = 1'),/let x = 1/);assert.throws(()=>transpileReplInput('let x: = ;'),SyntaxError);
});
async function pipe(lines:string[]){
  const child=spawn(process.execPath,['--import','tsx','scripts/frameweave-repl.ts'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const result=new Promise<{code:number|null;stdout:string;stderr:string}>((r,j)=>{child.once('error',j);child.once('close',code=>r({code,stdout,stderr}));});
  child.stdin.end(lines.join('\n')+'\n');return result;
}
test('Node REPL keeps TS bindings, rejects unsupported await, recovers from errors and exits on .exit or EOF',{timeout:30000},async()=>{
  const result=await pipe(['1+1','let total: number=5','total+=2','total','await Promise.resolve(9)','let bad: = ;','throw Error("REPL_SENTINEL")','3+4','.exit']);
  assert.equal(result.code,0,result.stderr);assert.match(result.stdout,/fw> 2/);assert.match(result.stdout,/fw> 7/);assert.match(result.stdout,/Top-level await is not supported/);assert.match(result.stdout,/SyntaxError/);assert.match(result.stdout,/REPL_SENTINEL/);
  await mkdir(proof,{recursive:true});await writeFile(join(proof,'repl-expressions.log'),result.stdout+result.stderr);
  assert.equal((await pipe(['21*2'])).code,0);
});
test('Project commands require explicit local-code consent, reuse actual frames/parameters and forget state',{timeout:90000},async()=>{
  await mkdir(join(root,'.frameweave/dx-repl'),{recursive:true});const dir=await mkdtemp(join(root,'.frameweave/dx-repl/','case-')),entry=join(dir,'scene.tsx'),marker=join(dir,'executed.txt');
  await writeFile(entry,`import {writeFileSync} from 'node:fs';import {Composition,Stage,Rect,keyframes} from '@frameweave/engine';writeFileSync(${JSON.stringify(marker)},'explicit local code');export default <Composition width={96} height={64} fps={12} durationInFrames={13} background="#091222"><Stage id="box" props={{gain:keyframes([{frame:0,value:0},{frame:12,value:12}])}}><Rect x={keyframes([{frame:0,value:4},{frame:12,value:64}])} y={20} width={20} height={20} fill="#55eccc"/></Stage></Composition>;`);
  const session=createReplSession({cwd:dir,outputRoot:join(dir,'inspections')});
  const denied=await session.execute('open',['scene.tsx']);assert.equal(denied.ok,false);assert.equal(denied.diagnostics[0].code,'E_REPL_TRUST');await assert.rejects(()=>readFile(marker),{code:'ENOENT'});
  assert.equal((await session.execute('open',['--trusted-local-code','scene.tsx'])).ok,true);assert.equal(await readFile(marker,'utf8'),'explicit local code');
  const params=await session.execute('params',['6']);assert.equal(params.ok,true);if(params.ok){const data=params.data as {stages:{props:{gain:number};nodes:{x:number}[]}[]};assert.equal(data.stages[0].props.gain,6);assert.equal(data.stages[0].nodes[0].x,34);}
  const rendered=await session.execute('frame',['6']);assert.equal(rendered.ok,true);if(rendered.ok)assert.equal((rendered.data as {ok:boolean}).ok,true);
  const data=await session.execute('time');assert.equal(data.ok,true);await session.execute('close');assert.equal((await session.execute('stages')).ok,false);session.close();assert.equal((await session.execute('modules')).ok,false);
  const piped=await pipe([`.open --trusted-local-code "${entry}"`,'.stages','.params 6','.close','.exit']);assert.equal(piped.code,0);assert.match(piped.stdout,/"gain": 6/);assert.match(piped.stdout,/"closed": true/);
  await writeFile(join(proof,'repl-project.log'),piped.stdout+piped.stderr);
});
test('REPL frame preserves structured Inspection errors and WASM authorization is per invocation',{timeout:90000},async()=>{
  const dir=await mkdtemp(join(root,'.frameweave/dx-repl/','wasm-'));
  await writeFile(join(dir,'empty.wasm'),Buffer.from([0,97,115,109,1,0,0,0]));
  await writeFile(join(dir,'scene.tsx'),`import {Composition,Stage,Resource} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';export const native=defineWebStage(async({container,width,height,resources})=>{await WebAssembly.compile(await(await fetch(resources.code)).arrayBuffer());const c=document.createElement('canvas');c.width=width;c.height=height;container.append(c);return {renderAt(){const x=c.getContext('2d')!;x.fillStyle='#62efca';x.fillRect(0,0,width,height);}};});export default <Composition width={96} height={64} fps={12} durationInFrames={13}><Resource id="code" kind="file" src="./empty.wasm"/><Stage id="wasm" factory={native}/></Composition>;`);
  const session=createReplSession({cwd:dir});assert.equal((await session.execute('open',['--trusted-local-code','scene.tsx'])).ok,true);
  const denied=await session.execute('frame',['0']);assert.equal(denied.ok,false);assert.equal(denied.diagnostics[0].severity,'error');
  const details=denied.diagnostics[0].details as {inspection:{policy:{allowWasm:boolean};diagnostics:{code:string}[]}};assert.equal(details.inspection.policy.allowWasm,false);assert.ok(details.inspection.diagnostics.some(d=>d.code==='E_INSPECTION_WASM_AUTH'));
  assert.equal((await session.execute('frame',['0','--allow-wasm'])).ok,true);
  assert.equal((await session.execute('frame',['0'])).ok,false);session.close();
});
