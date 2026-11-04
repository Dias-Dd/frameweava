import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createTypography} from '@frameweave/engine/typography/node';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';
import {exportProject} from '../src/compiler/export.ts';
import {buildNativeAnimationPackage} from '../modules/pro-animation/scripts/build-native-package.ts';
import {installPackages} from '../src/packages/manager.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';

const root=resolve('.'),out=resolve('artifacts/main-typography-provider');await mkdir(out,{recursive:true});
const exec=promisify(execFile),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex'),rows:any[]=[];
const result={ok:false,runtimePin,rows},report=join(out,'result-'+Date.now()+'.json'),save=()=>writeFile(report,JSON.stringify(result,null,2)+'\n');
async function check(name:string,fn:()=>Promise<unknown>){if(process.env.TYPOGRAPHY_ONLY&&!new RegExp(process.env.TYPOGRAPHY_ONLY).test(name))return;const start=performance.now();try{const evidence=await fn();rows.push({name,ok:true,ms:performance.now()-start,evidence});await save();console.log('PASS',name);}catch(e){rows.push({name,ok:false,ms:performance.now()-start,error:String(e),stack:(e as Error).stack});await save();throw e;}}
const example=resolve('examples/typography'),fontPath=resolve('modules/pro-animation/validation/shaping-scene/fonts/notosansjp.ttf');
await check('official Node SDK prepares actual user text with fixed Kits and explicit font provenance',async()=>{
 const fonts=await createTypography({allowWasm:true,coordinates:{spaceId:'caption',unit:'px',origin:'top-left',x:'right',y:'down',width:640,height:180},fonts:[{id:'caption',path:fontPath}]});
 try{const mesh=await fonts.prepareParagraph('Frameweave · 字幕',{width:580,fontSize:36,x:30,baseline:80,wrap:'word',overflow:'error'});assert.ok(mesh.positions.length);assert.ok(mesh.layout.glyphs.length>10);await writeFile(join(example,'paragraph.json'),JSON.stringify(mesh)+'\n');await copyFile('modules/pro-animation/validation/shaping-scene/fonts/notosansjp-OFL.txt',join(example,'OFL.txt'));await writeFile(join(example,'FONT-SOURCE.json'),JSON.stringify({source:mesh.fontInstances[0].source,license:'OFL-1.1',kind:'prepared outlines, not a bundled font file'},null,2)+'\n');return {glyphs:mesh.layout.glyphs.length,triangles:mesh.preparation.triangles,source:mesh.fontInstances[0].source};}finally{await fonts.dispose();assert.equal(fonts.inspect().ownedClients,0);}
});
await check('frozen preparation SDK installs outside repo and runs with Main filesystem denied',async()=>{
 const delivery=JSON.parse(await readFile(join(out,'delivery.json'),'utf8')),consumer=await mkdtemp(join(tmpdir(),'frameweave-typography-'));
 await writeFile(join(consumer,'package.json'),JSON.stringify({private:true,type:'module'})+'\n');await copyFile(fontPath,join(consumer,'font.ttf'));
 const npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
 const packed=await exec(process.execPath,[npm,'pack',delivery.out,'--json','--pack-destination',out],{windowsHide:true,timeout:25000,maxBuffer:2*1024**2});const tarball=join(out,JSON.parse(packed.stdout)[0].filename);
 await exec(process.execPath,[npm,'install','--offline','--ignore-scripts','--no-audit','--no-fund','--no-package-lock',tarball],{cwd:consumer,windowsHide:true,timeout:25000,maxBuffer:2*1024**2});
 const child=join(consumer,'test.mjs');await writeFile(child,`import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{createTypography}from'@frameweave/typography-preparation';await assert.rejects(readFile(${JSON.stringify(fontPath)}),{code:'ERR_ACCESS_DENIED'});const p=await createTypography({allowWasm:true,coordinates:{spaceId:'caption',unit:'px',origin:'top-left',x:'right',y:'down',width:640,height:180},fonts:[{id:'font',path:'font.ttf'}]});try{const a=await p.prepareParagraph('Portable ffi 字幕',{width:580,fontSize:32});assert.ok(a.positions.length);console.log(JSON.stringify({ok:true,glyphs:a.layout.glyphs.length,source:a.fontInstances[0].source}));}finally{await p.dispose();assert.equal(p.inspect().ownedClients,0);}`);
 const run=()=>exec(process.execPath,['--experimental-permission','--allow-fs-read='+consumer,child],{cwd:consumer,windowsHide:true,timeout:15000,maxBuffer:2*1024**2});
 const executed=await run();const prepared=JSON.parse(executed.stdout.trim());assert.equal(prepared.ok,true);
 await writeFile(join(consumer,'types.ts'),`import{createTypography}from'@frameweave/typography-preparation';const p=await createTypography({allowWasm:true,coordinates:{spaceId:'caption',unit:'px',origin:'top-left',x:'right',y:'down',width:640,height:180},fonts:[{id:'font',path:'font.ttf'}]});await p.prepareParagraph('caption',{width:500,fontSize:24});\n// @ts-expect-error explicit consent must be true\ncreateTypography({allowWasm:false,coordinates:{spaceId:'x',unit:'px',origin:'top-left',x:'right',y:'down',width:1,height:1},fonts:[]});\n// @ts-expect-error fontSize retains a numeric type\np.prepareParagraph('bad',{width:50,fontSize:'large'});`);
 await exec(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--noEmit','--strict','--skipLibCheck','--moduleResolution','Bundler','--module','ESNext','--target','ES2022','--typeRoots',resolve('node_modules/@types'),join(consumer,'types.ts')],{cwd:consumer,windowsHide:true,timeout:20000,maxBuffer:2*1024**2});
 const installed=join(consumer,'node_modules/@frameweave/typography-preparation'),wasm=join(installed,'modules/pro-animation/typography-kits/font/dist/generated/module_bg.wasm'),bytes=await readFile(wasm),changed=Buffer.from(bytes);changed[20]^=1;
 try{await writeFile(wasm,changed);await assert.rejects(run(),e=>/E_TYPOGRAPHY_KIT_INTEGRITY/.test(String((e as any).stderr)));}finally{await writeFile(wasm,bytes);}
 const lock=join(installed,'modules/pro-animation/typography-kit-lock.json'),original=await readFile(lock);try{await writeFile(lock,original.toString().replace('"version": "1.0.0"','"version": "9.0.0"'));await assert.rejects(run(),e=>/E_TYPOGRAPHY_KIT_INTEGRITY/.test(String((e as any).stderr)));}finally{await writeFile(lock,original);}
 return {consumer,tarball,prepared,mainFilesystemDenied:true,workerAndChildProcessNotGranted:true,types:true,tamperRejections:2,scope:'Node preparation SDK delivery, not the full engine npm release'};
});
let reference='';
await check('public Stage SDK renders prepared geometry with real Native F32 HDR and repeat/random frames',async()=>{
 const build=await buildProject(join(example,'project.tsx')),renderer=await Renderer.create(build,{nativeGpu:{executable:process.env.FRAMEWEAVE_NATIVE_GPU!,readback:'final-surface',slots:1}}),hashes=[];
 try{for(const frame of [3,0,3]){const surface=await renderer.renderNativeSurface(frame),values=pixelsFromSurface(surface);let alpha=0,rgb=0;for(let i=0;i<values.length;i++)if(i%4===3)alpha=Math.max(alpha,values[i]);else rgb=Math.max(rgb,values[i]);if(frame===3)assert.ok(rgb>1&&alpha>.9,'Opaque frame retains HDR');else assert.ok(alpha>0&&alpha<=.200001,'Authored 0.2 opacity remains premultiplied');hashes.push(sha(Buffer.from(values.buffer,values.byteOffset,values.byteLength)));if(frame===3){const bytes=await renderer.renderFrame(frame);await sharp(bytes.png).png().toFile(join(out,'caption.png'));}}assert.equal(hashes[0],hashes[2]);assert.notEqual(hashes[0],hashes[1]);reference=hashes[0];return {hashes,stats:await renderer.nativeStats()};}finally{await renderer.close();}
});
await check('pro-animation-native@0.2.3 installs with actual service named imports and borrowed Native paragraph renderer',async()=>{
 const base=resolve('.frameweave/typography-r1');await mkdir(base,{recursive:true});const pack=await mkdtemp(join(base,'package-')); // builder requires a fresh absent target
 const packageDir=join(pack,'animation');await buildNativeAnimationPackage(packageDir);const project=join(out,'managed-0.2.3');await mkdir(project,{recursive:true});
 await installPackages(project,[pack],{add:['pro-animation-native@0.2.3'],trust:['local:frameweave.animation']});
 let code=await readFile(join(example,'project.tsx'),'utf8');code=code.replace("from '@frameweave/engine/typography'","from 'pro-animation-native'");code=code.replace('import prepared',"import {createTextItemizer,createPathOperations,createFontShaper} from 'pro-animation-native';\nimport prepared").replace('const renderer=createNativeParagraphRenderer(init)',"if(typeof createTextItemizer!=='function'||typeof createPathOperations!=='function'||typeof createFontShaper!=='function')throw Error('Missing service named imports');const renderer=createNativeParagraphRenderer(init)");await writeFile(join(project,'project.tsx'),code);await copyFile(join(example,'paragraph.json'),join(project,'paragraph.json'));
 const build=await buildProject(join(project,'project.tsx')),renderer=await Renderer.create(build,{allowWasm:true,nativeGpu:{executable:process.env.FRAMEWEAVE_NATIVE_GPU!,readback:'final-surface',slots:1}});try{const values=pixelsFromSurface(await renderer.renderNativeSurface(3));assert.equal(sha(Buffer.from(values.buffer,values.byteOffset,values.byteLength)),reference);return {packageDir,project,version:'0.2.3'};}finally{await renderer.close();}
});
await check('prepared-only TSX exports a real four-frame MP4 and fully decodes',async()=>{
 const output=join(out,'caption.mp4');await renderNativeProject(join(example,'project.tsx'),{output,start:0,end:4,encoder:'libx264'});const decoded=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{encoding:'buffer',windowsHide:true,timeout:15000,maxBuffer:4*1024**2});assert.equal(decoded.stdout.length,640*180*4*4);return {output,decodedBytes:decoded.stdout.length};
});
result.ok=true;await save();await writeFile(join(out,'latest-real.json'),JSON.stringify({report},null,2)+'\n');
