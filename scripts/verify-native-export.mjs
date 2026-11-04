import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject,Renderer,exportProject} from '../src/node.ts';
import {engineRoot} from '../src/compiler/build.ts';
const directory=process.argv[2]??join(engineRoot,'artifacts/extended/native-engines');await mkdir(directory,{recursive:true});
const entry=join(engineRoot,'examples/future-motion/project.tsx');
const exported=await exportProject(entry,{output:join(directory,'Native-Engines.tsx'),singleFile:true});
async function render(file){const renderer=await Renderer.create(await buildProject(file),{width:384,height:216,cache:false});try{const frame=await renderer.renderFrame(240);assert.equal(frame.diagnostics.length,0);return frame.png;}finally{await renderer.close();}}
const original=await render(entry),portable=await render(exported.entry),a=await sharp(original).ensureAlpha().raw().toBuffer(),b=await sharp(portable).ensureAlpha().raw().toBuffer();assert.deepEqual(a,b);
await writeFile(join(directory,'original-240.png'),original);await writeFile(join(directory,'portable-240.png'),portable);
await writeFile(join(directory,'verification.json'),JSON.stringify({pass:true,frame:240,width:384,height:216,engines:['native Three.js','native React','native PixiJS','FrameWeave JSX'],rawPixelTolerance:0,rgbaSHA256:createHash('sha256').update(a).digest('hex'),exported},null,2));
console.log('Native Three.js / React / PixiJS export: exact RGBA match');
