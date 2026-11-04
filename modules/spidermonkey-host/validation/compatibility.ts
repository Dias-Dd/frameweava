import {resolve,join} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {buildProject} from '../../../src/compiler/build.ts';
import {renderNativeProject} from '../../native-gpu/service.ts';
import {ffmpegPath} from '../../../src/encoding/ffmpeg.ts';
const dir=resolve('modules/spidermonkey-host/validation/current'),out=resolve('modules/spidermonkey-host/validation/compatibility');await mkdir(out,{recursive:true});const start=performance.now(),rows:any[]=[];
try{
 const project='modules/spidermonkey-host/examples/hooks.tsx',native=resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'.frameweave/spidermonkey-check/native-bin/frameweave-native-gpu.exe');
 delete process.env.FRAMEWEAVE_JS_HOST;const build=await buildProject(project,{outputDir:resolve('.frameweave/spidermonkey-check/compatibility-build')});
 for(const host of ['spidermonkey','v8']){process.env.FRAMEWEAVE_JS_HOST=host;delete process.env.FRAMEWEAVE_CHROMIUM;rows.push(await renderNativeProject(project,{build,native,start:0,end:1,output:join(out,host+'.png'),timeoutMs:15000}));}
 const a=await sharp(join(out,'spidermonkey.png')).raw().toBuffer(),b=await sharp(join(out,'v8.png')).raw().toBuffer();assert.deepEqual(a,b);rows.push({name:'SM/V8 real React and same Native GPU lossless RGBA',rgbaBytes:a.length,equal:true});
 const decoded=await promisify(execFile)(ffmpegPath(),['-v','error','-i',join(dir,'ball.mp4'),'-f','rawvideo','-pix_fmt','rgba','-'],{windowsHide:true,timeout:10000,encoding:'buffer',maxBuffer:32*1024**2});
 const bytes=640*360*4,diffs=[];assert.equal(decoded.stdout.length,bytes*24);
 for(const f of [0,12,23]){const raw=decoded.stdout.subarray(f*bytes,(f+1)*bytes);await sharp(raw,{raw:{width:640,height:360,channels:4}}).png().toFile(join(out,`decoded-${f}.png`));const png=await sharp(join(dir,`frame-${f}.png`)).ensureAlpha().raw().toBuffer();let sum=0,max=0;for(let i=0;i<raw.length;i++)if(i%4!==3){const d=Math.abs(raw[i]-png[i]);sum+=d;max=Math.max(max,d);}diffs.push({frame:f,RGB_mean_abs_error:sum/(640*360*3),RGB_max_abs_error:max,comparison:'lossy H.264 decoded RGB vs lossless PNG; not pixel identity'});}
 rows.push({name:'decoded video',frames:24,seconds:.4,diffs});
 await sharp({create:{width:1920,height:360,channels:4,background:'#000'}}).composite(await Promise.all([0,12,23].map(async(f,i)=>({input:await readFile(join(out,`decoded-${f}.png`)),left:i*640,top:0})))).png().toFile(join(out,'decoded-storyboard.png'));
 await writeFile(join(out,'results.json'),JSON.stringify({ok:true,wallMs:performance.now()-start,rows},null,2));console.log('PASS real React SM/V8 native output identical; 24 video frames decoded; first/middle/last extracted');
}catch(e:any){await writeFile(join(out,'results.json'),JSON.stringify({ok:false,wallMs:performance.now()-start,rows,error:{code:e.code,message:e.message,stack:e.stack}},null,2));throw e;}
