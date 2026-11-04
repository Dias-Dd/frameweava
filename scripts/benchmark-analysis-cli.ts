import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,copyFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const engine=resolve(process.argv[2]??'.'),out=resolve(process.argv[3]??'outputs/dx1b/cli-current');await mkdir(out,{recursive:true});
const project=await mkdtemp(join(out,'project-'));await mkdir(join(project,'assets'));await copyFile(resolve('prototypes/analysis-job-mvp/assets/david.webm'),join(project,'assets/person.webm'));
const rows:any[]=[];let sequence=0;
async function invoke(label:string,args:string[],lean=false){const start=performance.now(),r=await promisify(execFile)(process.execPath,['--import','tsx',join(engine,lean?'src/analysis-tools/entry.ts':'src/cli.ts'),...lean?[]:['analyze'],...args,'--project',project,'--json'],{windowsHide:true,cwd:engine,maxBuffer:1024*1024});const value=JSON.parse(r.stdout),record={label,wallMs:performance.now()-start,entry:lean?'lean':'main',args,execution:value.execution,summary:value.artifact?.summary??value.summary};rows.push(record);const prefix=join(out,String(++sequence).padStart(2,'0')+'-'+label);await writeFile(prefix+'.stdout.json',r.stdout);await writeFile(prefix+'.stderr.jsonl',r.stderr);return value;}
const initial=await invoke('cold-analysis',['run','face-tracking','--input','assets/person.webm','--events']);
const id=initial.artifact.artifactId;await invoke('cache-analysis',['run','face-tracking','--input','assets/person.webm','--events']);
for(let i=0;i<3;i++)await invoke('single-'+i,['sample',id,'--time','4']);
await invoke('preview',['preview',id,'--time','4','--output','preview.png']);
try{await readFile(join(engine,'src/analysis-tools/entry.ts'));for(let i=0;i<3;i++)await invoke('lean-single-'+i,['sample',id,'--time','4'],true);await invoke('lean-batch',['sample-batch',id,'--times',Array.from({length:64},(_,i)=>String((i%64)/8)).join(',')],true);await invoke('lean-preview',['preview',id,'--time','4','--output','lean-preview.png'],true);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
await writeFile(join(out,'metrics.json'),JSON.stringify({engine,project,id,node:process.version,rows},null,2));console.log(JSON.stringify(rows,null,2));
