// Independent consumer: invokes installed bin/public exports, never repository internals.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),parent=join(root,'artifacts/professional-media');await mkdir(parent,{recursive:true});
const proof=await mkdtemp(join(parent,'installed-')),app=await mkdtemp(join(tmpdir(),'frameweave-pme-')),project=join(app,'editable scene 中文');await mkdir(project);
assert.ok(relative(root,app).startsWith('..'));for(const name of ['FRAMEWEAVE_HOME','FRAMEWEAVE_MEDIA_PYTHON','FRAMEWEAVE_FFPROBE','PLAYWRIGHT_BROWSERS_PATH'])assert.ok(process.env[name],`Explicit ${name} required`);
const env={...process.env};delete env.FRAMEWEAVE_ENGINE_ROOT;
const exec=promisify(execFile),commands=[];
async function run(file,args,cwd=project){let r;try{r={exit:0,...await exec(file,args,{cwd,env,windowsHide:true,timeout:240000,maxBuffer:8*1024*1024})};}catch(e){r={exit:e.code,stdout:e.stdout??'',stderr:e.stderr??''};}commands.push({file,args,cwd,...r});await writeFile(join(proof,'commands.json'),JSON.stringify(commands,null,2));assert.equal(r.exit,0,r.stderr||r.stdout);return r;}
await writeFile(join(app,'package.json'),JSON.stringify({name:'professional-media-independent-consumer',private:true,type:'module'}));
const npm=process.env.npm_execpath??join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
await run(process.execPath,[npm,'install',join(root,'artifacts/frameweave-engine-0.1.0.tgz'),'--prefer-offline','--no-audit','--no-fund'],app);
for(const file of ['project.tsx','stages.ts','settings.json'])await copyFile(join(root,'examples/professional-media',file),join(project,file));
const installed=join(app,'node_modules/@frameweave/engine'),bin=join(installed,'bin/frameweave.mjs');
const cli=async args=>{const value=JSON.parse((await run(process.execPath,[bin,...args])).stdout);assert.equal(value.ok,true,JSON.stringify(value));return value;};
const doctor=await cli(['doctor','--require-browser','--json']);assert.equal(doctor.data.distribution.verified,true);await writeFile(join(proof,'doctor.json'),JSON.stringify(doctor,null,2));
const inventory=JSON.parse(await readFile(join(installed,'distribution.json'),'utf8'));assert.ok(inventory.files['lib/media/ocio_bridge.py']);assert.ok(inventory.files['tools/professional-media/requirements-pyvips.txt']);
await cli(['media','capabilities','--json']);
await cli(['media','frame','project.tsx','--settings','settings.json','--frame','5','--output','frame-5.exr','--json']);
await cli(['media','render','project.tsx','--settings','settings.json','--output','hdr10.mp4','--json']);
await writeFile(join(project,'inspect.mjs'),`
import assert from 'node:assert/strict';
import {openRenderSession,readProfessionalSettings,readExr,pixelsFromSurface,inspectMediaFile,readMediaVideo} from '@frameweave/engine/node';
import sharp from 'sharp';
const settings=await readProfessionalSettings('settings.json'),s=await openRenderSession('project.tsx',{media:settings.media});
try{const r=await s.inspect({frames:[0,3,5,3],storyboard:true,output:'inspection'});assert.equal(r.ok,true);assert.equal(r.rendered,true);}finally{await s.close();}
const exr=await readExr('frame-5.exr'),p=pixelsFromSurface(exr.surface);assert.ok(Math.min(...p)<0);assert.ok(Math.max(...p)>1);
const video=await inspectMediaFile('hdr10.mp4');assert.equal(video.streams[0].profile,'Main 10');assert.equal(video.streams[0].color_transfer,'smpte2084');
const decoded=await readMediaVideo('hdr10.mp4',{metadataPolicy:'validate'});assert.equal(decoded.surface.width,128);assert.ok(pixelsFromSurface(decoded.surface).every(Number.isFinite));
const png=await sharp('inspection/images/frame-000-0.png').metadata();assert.equal(png.width,128);assert.equal(png.height,64);
console.log(JSON.stringify({ok:true,exr:{width:exr.surface.width,minimum:Math.min(...p),maximum:Math.max(...p)},video:video.streams[0],png:{width:png.width,height:png.height},decodedPixels:decoded.surface.width*decoded.surface.height}));
`);
const result=JSON.parse((await run(process.execPath,['inspect.mjs'])).stdout);
await writeFile(join(proof,'results.json'),JSON.stringify({ok:true,app,project,installed,inventoryFiles:Object.keys(inventory.files).length,result},null,2));
await writeFile(join(parent,'installed-latest.json'),JSON.stringify({directory:proof,app,project},null,2));console.log(JSON.stringify({ok:true,proof,app,project}));
