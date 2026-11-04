// Freeze a completed campaign and original failures without republishing native
// DLLs. Their local receipt/provenance is retained; redistribution is unqualified.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),raw=join(root,'artifacts/servo-module'),out=join(root,'modules/servo/validation/checkpoint');
if(existsSync(out))throw Error('Refusing to overwrite frozen evidence');
const sha=b=>createHash('sha256').update(b).digest('hex'),json=p=>JSON.parse(readFileSync(p,'utf8'));
const campaign=json(join(raw,'final-v5/campaign.json'));if(campaign.steps.length!==10||campaign.steps.some(s=>s.status!==0))throw Error('Complete final-v5 scoped campaign required');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const files=execFileSync('git',['ls-files','modules/servo','modules/native-gpu','tests/native-module.test.ts','prototypes/servo-gpu-interop'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
const sourceHashes=Object.fromEntries(files.map(f=>[f,sha(readFileSync(join(root,f)))]));
const native=json(join(raw,'final-v5/build-check.json'));
for(const r of native.native)for(const [f,hash]of Object.entries(r.inputHashes))if(sha(readFileSync(join(root,'modules/native-gpu',f)))!==hash)throw Error('Native build inputs no longer match');
for(const [f,hash]of Object.entries(native.servoBuild.inputHashes))if(sha(readFileSync(join(root,'modules/servo/native',f)))!==hash)throw Error('Servo build inputs no longer match');
mkdirSync(out,{recursive:true});const copied=[];
function copy(from,to){const bytes=readFileSync(from);mkdirSync(dirname(to),{recursive:true});copyFileSync(from,to);copied.push({file:to.slice(out.length+1).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}
for(const name of readdirSync(raw)){if(name.endsWith('.log'))copy(join(raw,name),join(out,'development-logs',name+'.txt'));}
for(const name of ['final','final-v2','final-v3','final-v4','final-v5'])for(const file of readdirSync(join(raw,name)))copy(join(raw,name,file),join(out,name,file));
for(const file of ['performance.json','performance.log'])copy(join(raw,file),join(out,file.endsWith('.log')?file+'.txt':file));
for(const file of ['chain.png','hdr-overlay.exr','chain.mp4'])copy(join(raw,'media',file),join(out,'media',file));
writeFileSync(join(out,'receipt.json'),JSON.stringify({version:1,sourceCommit,sourceHashes,evidence:copied,finalCampaign:'final-v5/campaign.json',earlierCampaignsAreNotPassing:true,scope:'Windows/Vulkan reviewed-local SDR Servo native module; separate debug diagnostics and production media/benchmark',unverified:['Public native-binary redistribution/provenance and full dependency notices','OS sandbox qualification for untrusted HTML/JS','Installed R1/CLI/Capsule wiring for optional Servo DLLs (Main integration)','Canvas GPU input, arbitrary WebGL, CSS transitions/animation event state, arbitrary history-dependent frameworks','Linux/macOS and other GPU adapters','Physical peak memory and 10ms preview/scanout target'],buildNote:'Binaries were built from working-tree inputs before source commit; exact input hashes bind them to this frozen source, rather than claiming a clean-commit build.'},null,2)+'\n');
console.log(JSON.stringify({ok:true,sourceCommit,out,files:copied.length}));
