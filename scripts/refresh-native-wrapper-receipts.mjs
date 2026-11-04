// Explicit comment-only integration review. Never bless changed Rust, worker
// outputs, licenses or executable JS. A real semantic change still needs a build.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const root=resolve('.'),frozen='6c5dee0f74820fb9670a92fb0443f0040b84e60f',sha=b=>createHash('sha256').update(b).digest('hex'),reviews=[];
for(const module of ['puppet-effects','rigid-body-effects','deformable-effects']){
 const base=join(root,'modules',module),file=join(base,'dist/build.json'),bytes=await readFile(file),receipt=JSON.parse(bytes);
 for(const [name,expected]of Object.entries(receipt.outputs))if(sha(await readFile(join(base,name)))!==expected)throw Error('Changed solver output '+module+'/'+name);
 const changes=[];for(const [name,expected]of Object.entries(receipt.inputs)){
  const current=await readFile(join(base,name));if(sha(current)===expected)continue;
  if(!/^runtime\/.+\.ts$/.test(name))throw Error('Executable/build input requires full rebuild: '+module+'/'+name);
  const original=execFileSync('git',['show',frozen+':modules/'+module+'/'+name],{windowsHide:true,maxBuffer:8*1024**2});if(sha(original)!==expected)throw Error('Frozen input differs from original receipt '+name);
  const emit=b=>ts.transpileModule(b.toString('utf8'),{fileName:name,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,removeComments:true}}).outputText;
  if(emit(current)!==emit(original))throw Error('Runtime semantics changed; rebuild required: '+name);
  changes.push({path:name,originalSha256:expected,currentSha256:sha(current),identicalExecutableSha256:sha(emit(current))});receipt.inputs[name]=sha(current);
 }
 if(changes.length){receipt.integrationReview={frozenSource:frozen,previousReceiptSha256:sha(bytes),method:'Original bytes verified, TypeScript emitted JS exactly identical after comment removal; all original output hashes retained',changes};await writeFile(file,JSON.stringify(receipt,null,2));reviews.push({module,changes});}
}
console.log(JSON.stringify({reviews}));
