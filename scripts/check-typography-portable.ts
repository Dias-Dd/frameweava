import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,copyFile,rename} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {buildProject} from '../src/compiler/build.ts';
import {exportProject} from '../src/compiler/export.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';
const base=resolve('artifacts/main-typography-provider'),out=await mkdtemp(join(base,'portable-')),origin=join(out,'origin'),hidden=join(out,'original-hidden');await mkdir(origin);
for(const p of [origin,hidden])assert.equal(dirname(resolve(p)),out);
for(const name of ['project.tsx','paragraph.json','OFL.txt'])await copyFile(join('examples/typography',name),join(origin,name));
const entry=join(origin,'project.tsx'),rows:any[]=[];
async function frame(path:string){const build=await buildProject(path),renderer=await Renderer.create(build,{nativeGpu:{executable:process.env.FRAMEWEAVE_NATIVE_GPU!,readback:'final-surface',slots:1}});try{const surface=await renderer.renderNativeSurface(3),values=pixelsFromSurface(surface);assert.ok(values.some(v=>v>1));return {hash:createHash('sha256').update(Buffer.from(values.buffer,values.byteOffset,values.byteLength)).digest('hex'),format:surface.format};}finally{await renderer.close();}}
const reference=await frame(entry),targets=[];
for(const mode of ['directory','flat']as const){const report=await exportProject(entry,{output:join(out,mode==='directory'?'carried':'single.tsx'),...mode==='flat'?{singleFile:true}:{}});targets.push({mode,entry:report.entry});}
await rename(origin,hidden);
try{for(const t of targets){const result=await frame(t.entry);assert.equal(result.hash,reference.hash);rows.push({...t,...result,originalUnavailable:true});console.log('PASS typography',t.mode);}}finally{await rename(hidden,origin);}
const half=join(origin,'half.tsx');await writeFile(half,(await readFile(entry,'utf8')).replaceAll("format:'rgba32float'","format:'rgba16float'"));rows.push({mode:'F16 draw',...await frame(half)});
const forbidden=join(origin,'node-in-stage.tsx');await writeFile(forbidden,`import{Composition,Stage,Layer,ref}from'@frameweave/engine';import{defineNativeStage}from'@frameweave/engine/native';import{createTypography}from'@frameweave/engine/typography/node';export const invalid=defineNativeStage(async()=>{await createTypography({allowWasm:true,coordinates:{spaceId:'x',unit:'px',origin:'top-left',x:'right',y:'down',width:10,height:10},fonts:[{id:'forbidden',path:'font.ttf'}]});return{renderAt(){throw Error('must not execute')}}});export default <Composition width={10} height={10} fps={24} durationInFrames={1}><Stage id="bad" factory={invalid}/><Layer source={ref('bad')}/></Composition>;`);
await assert.rejects(buildProject(forbidden),e=>e instanceof Error&&'code'in e&&e.code==='E_COMPILE'&&/node:|Could not resolve/.test(e.message));rows.push({mode:'Node-only SDK in Native Stage',rejected:true});
await writeFile(join(base,'portable.json'),JSON.stringify({ok:true,runtimePin,rows},null,2)+'\n');
