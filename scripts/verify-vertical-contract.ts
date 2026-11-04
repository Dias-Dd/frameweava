import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {buildGraphicsPackage} from '../modules/graphics-contracts/scripts/build-package.ts';
import {buildNativeAnimationPackage} from '../modules/pro-animation/scripts/build-native-package.ts';
import {createGlyphAnimator} from '../modules/pro-animation/src/glyph-animation.ts';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {prepared as historical} from '../modules/pro-animation/validation/text-layout-scene/prepared.ts';
import {installPackages,buildProject,Renderer} from '../src/node.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';
import {mediaPreview} from '../src/media/node.ts';
import {linear709,srgb,pixelsFromSurface} from '../src/media/surface.ts';
import type {TextLayoutData} from '../modules/graphics-contracts/types.ts';

// One focused integration, not the complete vertical typesetting qualification.
// Uses frozen original HarfRust TTB metrics + existing authentic CJK meshes.
const root=resolve('.'),out=resolve('artifacts/vertical-contract',Date.now().toString());await mkdir(out,{recursive:true});
const exec=promisify(execFile),start=performance.now(),receipt:{checks:unknown[];[key:string]:unknown}={checks:[]};
async function phase<T>(name:string,fn:()=>Promise<T>){const start=performance.now();try{const result=await fn();receipt.checks.push({name,ok:true,elapsedMs:performance.now()-start});return result;}catch(e){receipt.checks.push({name,ok:false,elapsedMs:performance.now()-start,error:String(e)});throw e;}}
const proof=JSON.parse(await readFile('docs/pro-animation/font-execution-validation/vertical-examples.json','utf8'));
const original=proof.cases[0].candidate as TextLayoutData,layout=structuredClone(original);layout.id='vertical.native';layout.text='日本語';layout.paragraphs[0].end=layout.lines[0].end=3;
layout.glyphs=[0,2,4].map((index,i)=>({...original.glyphs[index],id:'glyph.'+i,cluster:{start:i,end:i+1},y:original.glyphs[0].y+i*48}));
graphics.validateTextLayoutData(layout);
try{
 const pkg=await phase('build-pure-graphics-1.1.0',()=>buildGraphicsPackage(resolve('.frameweave/graphics-distribution-tests','vertical-'+Date.now(),'package')));
 await phase('outside-offline-npm-install-and-public-import',async()=>{
  let npm:string|undefined;for(const p of [dirname(process.execPath),...(process.env.PATH??'').split(delimiter)]){try{const path=join(p,'node_modules/npm/bin/npm-cli.js');await readFile(path);npm=path;break;}catch{}}
  assert.ok(npm,'existing local npm required');const consumer=await mkdtemp(join(tmpdir(),'frameweave-vertical-'));await writeFile(join(consumer,'package.json'),'{"private":true,"type":"module"}');
  const {stdout}=await exec(process.execPath,[npm,'pack',pkg,'--json','--pack-destination',consumer],{windowsHide:true,timeout:30000,maxBuffer:1024**2});const archive=join(consumer,JSON.parse(stdout)[0].filename);
  await exec(process.execPath,[npm,'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false'],{cwd:consumer,windowsHide:true,timeout:30000,maxBuffer:1024**2});
  const data=JSON.stringify(layout),script=`import {validateTextLayoutData,createTextLayoutGeometry} from '@frameweave/graphics-contracts';const value=validateTextLayoutData(${data});console.log(JSON.stringify({axes:createTextLayoutGeometry(value).lineAxes('line'),layout:value}));`;
  const result=JSON.parse((await exec(process.execPath,['--input-type=module','--eval',script],{cwd:consumer,windowsHide:true,timeout:10000})).stdout);assert.deepEqual(result.layout,layout);assert.equal(result.axes.baselineAxis,'x');receipt.consumer=consumer;
 });
 const work=await mkdtemp(resolve('.frameweave','vertical-project-'));process.env.FRAMEWEAVE_HOME=join(work,'home');const catalog=join(work,'catalog'),project=join(work,'project');await mkdir(catalog);await mkdir(project);
 const animation=await phase('build-native-animation-0.1.1',()=>buildNativeAnimationPackage(join(catalog,'animation')));
 const positions:number[]=[],vertexUnits:number[]=[],source=historical.index.source;
 for(const [index,glyph]of layout.glyphs.entries()){
  const global=historical.layout.glyphs.findIndex(g=>g.glyphId===glyph.glyphId&&historical.layout.fonts.find(f=>f.id===historical.layout.styles.find(s=>s.id===g.styleId)!.fontId)!.source.sha256===layout.fonts[0].source.sha256);
  assert.ok(global>=0,'frozen real CJK glyph must exist');const from=historical.layout.glyphs[global],unit=historical.units.findIndex(u=>u.glyphIndices.includes(global));assert.equal(historical.units[unit].glyphIndices.length,1);
  const size=historical.layout.styles.find(s=>s.id===from.styleId)!.fontSize,scale=48/size;
  for(let v=0;v<historical.vertexUnits.length;v++)if(historical.vertexUnits[v]===unit){positions.push((historical.positions[3*v]-from.x)*scale+glyph.x,(historical.positions[3*v+1]-from.y)*scale+glyph.y,.5);vertexUnits.push(index);}
 }
 const run={layout,glyphPaths:[],diagnostics:[],fontInstance:{source:layout.fonts[0].source,faceIndex:0,variations:{},normalizedCoordinates:[]}},units=createGlyphAnimator(graphics,run).units().map(u=>({...u,direction:'ltr'}));
 const geometry={layout,units,positions,vertexUnits};await writeFile(join(project,'geometry.json'),JSON.stringify(geometry));
 await phase('normal-R1-install-and-trust',()=>installPackages(project,[animation],{add:['pro-animation-native@0.1.1'],trust:['local:frameweave.animation']}));
 const entry=join(project,'project.tsx');await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';import {validateTextLayoutData} from '@frameweave/engine/graphics-contracts';import {createNativeGlyphRenderer} from 'pro-animation-native';import geometry from './geometry.json';
 export const text=defineNativeStage(async init=>{const draw=createNativeGlyphRenderer(init);const handle=await draw.prepare({...geometry,layout:validateTextLayoutData(geometry.layout),units:geometry.units.map(u=>({...u,direction:'ltr' as const,anchor:[u.anchor[0],u.anchor[1]] as const}))});return {renderAt(context){return draw.at(context).draw(handle,{ink:[.1,context.frame===1?.4:.8,1.5,1],format:'rgba32float'});},dispose:()=>draw.dispose()};});
 export default <Composition width={320} height={320} fps={24} durationInFrames={2} background="transparent"><Stage id="text" factory={text}/><Layer source={ref('text')}/></Composition>;`);
 await phase('managed-Native-real-CJK-random-repeat-PNG',async()=>{
  const renderer=await Renderer.create(await buildProject(entry),{allowWasm:true,nativeGpu:{executable:await nativeExecutable(),readback:'final-surface'}});try{
   const frames=[];for(const frame of [0,1,0]){const surface=await renderer.renderNativeSurface(frame),pixels=pixelsFromSurface(surface),png=await mediaPreview(surface,{workingColor:linear709,preview:{color:srgb,clip:true}}),rgba=await sharp(png).ensureAlpha().raw().toBuffer();let occupied=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i])occupied++;assert.ok(occupied>500,'actual glyph pixels required');assert.ok(pixels.some((v,i)=>i%4===2&&v>1),'HDR ink must survive in F32');frames.push({frame,occupied,sourceSha256:createHash('sha256').update(new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength)).digest('hex'),sha256:createHash('sha256').update(rgba).digest('hex')});await writeFile(join(out,'vertical-'+frame+'.png'),png);}
   assert.equal(frames[0].sha256,frames[2].sha256);assert.equal(frames[0].sourceSha256,frames[2].sourceSha256);assert.notEqual(frames[0].sha256,frames[1].sha256);receipt.frames=frames;receipt.device=await renderer.nativeStats();
  }finally{await renderer.close();}
 });
 receipt.ok=true;receipt.scope='Real original TTB CJK metrics with existing authentic glyph meshes; not new shaping, full vertical paragraph layout or all writing-system qualification.';
}catch(error){receipt.ok=false;receipt.error=String(error);process.exitCode=1;}
finally{receipt.elapsedMs=performance.now()-start;await writeFile(join(out,'result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({output:out,...receipt}));}
