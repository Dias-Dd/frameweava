import{readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync}from'node:fs';
import{resolve,join,basename,dirname}from'node:path';
import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import os from'node:os';
const root=resolve('.'),source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
const local=join(root,'.frameweave/native-capacity'),evidence=join(root,'modules/native-gpu/validation/capacity/evidence'),delivery=join(root,'outputs/deliveries/native-capacity-'+source.slice(0,8));
mkdirSync(evidence,{recursive:true});mkdirSync(delivery,{recursive:true});
function copy(from,to){mkdirSync(dirname(to),{recursive:true});copyFileSync(from,to);}
for(const f of readdirSync(local))if(f.endsWith('.txt')||f==='campaign.json')copy(join(local,f),join(evidence,f));
for(const part of['numeric','host','media'])copy(join(local,part,'result.json'),join(evidence,part+'-result.json'));
const media=JSON.parse(readFileSync(join(local,'media/result.json'),'utf8')),origin=dirname(media.entry);
for(const f of['project.tsx','long.mp4','accurate.exr','hdr10.mp4','decoded-1.png','decoded-2.png','decoded-3.png','decoded-4.png'])copy(join(origin,f),join(evidence,'media',f));
const runtimes=[['native','.frameweave/native-target/debug/frameweave-native-gpu.exe','native-build.json'],['spidermonkey','.frameweave/spidermonkey-target/debug/frameweave-spidermonkey-host.exe','spidermonkey-build.json'],['media','.frameweave/native-media/runtime/frameweave_media.dll','media-runtime.json']];
const identities=[];
for(const[name,file,receiptName]of runtimes){const from=join(root,file),sha256=createHash('sha256').update(readFileSync(from)).digest('hex'),receipt=JSON.parse(readFileSync(join(dirname(from),receiptName),'utf8'));
 const expected=name==='media'?receipt.files[basename(file)]:receipt.executable.sha256;if(sha256!==expected)throw Error('Mismatched runtime receipt: '+name);
 const target=join(delivery,name,basename(file));copy(from,target);copy(join(dirname(from),receiptName),join(dirname(target),receiptName));copy(join(dirname(from),receiptName),join(evidence,'runtime-receipts',receiptName));identities.push({name,file:target,sha256,receipt:receiptName});}
const campaign=JSON.parse(readFileSync(join(local,'campaign.json'),'utf8'));
const manifest={version:1,baseCommit:campaign.baseCommit,sourceCommit:source,productionFeatureBuild:true,compilerProfile:'debug',runtimes:identities,environment:{platform:process.platform,architecture:process.arch,release:os.release(),cpu:os.cpus()[0].model,memoryBytes:os.totalmem(),adapter:JSON.parse(readFileSync(join(local,'numeric/result.json'),'utf8')).stats.adapter},qualified:{suite:'accepted-source',tests:55,failed:0,typescript:'final-source-types',numeric:'Exact F16/F32; negative RGB, HDR and alpha; random frames 100/0/100',media:'Four decoded visible frames, exact linear EXR, PQ/BT2020 10-bit HEVC NVENC; no CPU image readbacks on GPU HDR export'},knownBaseline:{suite:'native-only-rendering',failures:4,proof:'baseline-web-regression-11.txt'},unverified:['Non-Windows/NVIDIA hardware','Maximum VRAM allocation','17 real simultaneous Servo instances','Broad six-mode exports and independent installation','Inference output-into and inference continuation'],notes:['All raw failed attempts retained. Do not combine earlier runs into this final pass.','No throughput or FPS comparison is claimed.','Main owns final SDK Pin/catalog/immutable package qualification.','Matching Core/SDK and all three runtime receipts are required.']};
writeFileSync(join(evidence,'delivery.json'),JSON.stringify(manifest,null,2)+'\n');writeFileSync(join(delivery,'delivery.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({sourceCommit:source,delivery,evidence,previousCampaignSeconds:campaign.seconds}));
