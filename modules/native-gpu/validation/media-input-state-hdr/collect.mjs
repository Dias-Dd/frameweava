import {readFile,writeFile,readdir,mkdir,copyFile,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const out=dirname(fileURLToPath(import.meta.url)),root=resolve(out,'../../../..');
const raw=join(out,'raw'),media=join(out,'media');await mkdir(raw,{recursive:true});await mkdir(media,{recursive:true});
for(const name of await readdir(join(root,'.frameweave')))if(/^media-gap-.*\.txt$/.test(name))await copyFile(join(root,'.frameweave',name),join(raw,name));
const log=await readFile(join(raw,'media-gap-delivery-tests-freeze.txt'),'utf8');
// node:test TAP doubles diagnostic backslashes; this is not CLI JSON.
const measurements=log.split(/\r?\n/).filter(l=>l.startsWith('# {"case":')).map(l=>JSON.parse(l.slice(2).replaceAll(String.fromCharCode(92,92),String.fromCharCode(92))));
const hdr=measurements.find(m=>m.case==='accurate-hdr');
const hdrDir=dirname(hdr.result.output);
for(const name of ['hevc_nvenc.mp4','av1_nvenc.mp4','hlg.mov','linear.exr','aces2-hevc.mp4','cli-av1.mp4','hdr.json']){
 await copyFile(join(hdrDir,name),join(media,name));
 const report=join(hdrDir,name+'.media.json');try{await copyFile(report,join(media,name+'.media.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
}
const candidates=await Promise.all((await readdir(join(root,'artifacts/native-media-delivery'))).filter(n=>n.startsWith('video-')).map(async n=>({path:join(root,'artifacts/native-media-delivery',n),time:(await stat(join(root,'artifacts/native-media-delivery',n))).mtimeMs})));
const video=candidates.sort((a,b)=>b.time-a.time)[0].path;
for(const name of ['native-preview.png','roundtrip.mp4','fast-hevc_nvenc.mp4','fast-av1_nvenc.mp4'])await copyFile(join(video,name),join(media,name));
const changed=execFileSync('git',['diff','--name-only','--','src','modules/native-gpu','tests'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
const files=[...new Set([...changed,'modules/native-gpu/video-decoder.ts','src/media/hdr-metadata.ts','tests/native-media-delivery.test.ts','tests/hdr-metadata.test.ts'])].filter(n=>n&&!n.includes('/validation/'));
const hashes=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(join(root,file))).digest('hex')])));
await writeFile(join(out,'measurements.json'),JSON.stringify({version:1,baseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),testedSourceHashes:hashes,measurements},null,2)+'\n');
const probe=join(out,'unqualified-mf-probe');await mkdir(probe,{recursive:true});
for(const [source,target]of [['probe.cpp','probe.cpp'],['result-seek.json','result.json'],['build-seek.log','build.log']])await copyFile(join(root,'.frameweave/native-video-probe',source),join(probe,target));
await copyFile(join(root,'.frameweave/native-target/debug/native-build.json'),join(out,'native-build.json'));
console.log(JSON.stringify({version:1,out,measurements:measurements.length,sourceFiles:files.length}));
