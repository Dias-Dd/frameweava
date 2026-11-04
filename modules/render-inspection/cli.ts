import {writeCLIResult} from '../../src/cli-output.ts';
import {stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectProject} from './inspect.ts';
import {compareInspections,compareImageFiles} from './compare.ts';
import {readInspectionImage,serveInspectionImages} from './images.ts';
import {inspectIteration} from './session.ts';
import {fail,finite,issues,suggestions} from './common.ts';
import type {InspectOptions,CompareOptions} from './types.ts';

const booleans=new Set(['json','storyboard','no-cache','allow-wasm','allow-lossy','allow-policy-difference']);
function parse(args:string[],allowed:string[]){
  const flags:Record<string,string|boolean>={};
  for(let i=0;i<args.length;i++){const raw=args[i],key=raw.slice(2);if(!raw.startsWith('--')||!allowed.includes(key)||Object.hasOwn(flags,key))fail('E_ARGUMENT',`Unknown or duplicate inspect option ${raw}`);
    if(booleans.has(key))flags[key]=true;else{const v=args[++i];if(v===undefined||v.startsWith('--'))fail('E_ARGUMENT',`${raw} needs a value`);flags[key]=v;}
  }return flags;
}
const text=(flags:Record<string,string|boolean>,key:string)=>typeof flags[key]==='string'?flags[key] as string:undefined;
function numeric(flags:Record<string,string|boolean>,key:string){return flags[key]===undefined?undefined:finite(Number(flags[key]),key,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER);}
const renderFlags=['frames','times','frame','time','output','stage','width','height','mode','timeout','browser','json','allow-wasm','no-cache','storyboard'];
function request(project:string,flags:Record<string,string|boolean>):InspectOptions {
  const frameFlags=['frames','times','frame','time'].filter(k=>flags[k]!==undefined);if(frameFlags.length>1)fail('E_ARGUMENT','Choose one frame/time selection flag');
  const list=(name:string)=>{const s=text(flags,name);if(s===undefined)return;const values=s.split(',');if(values.some(x=>!x.trim()))fail('E_ARGUMENT',`${name} has an empty item`);return values.map(Number);};
  return {project,output:text(flags,'output'),stageId:text(flags,'stage'),frames:flags.frame!==undefined?[Number(flags.frame)]:list('frames'),times:flags.time!==undefined?[Number(flags.time)]:list('times'),width:numeric(flags,'width'),height:numeric(flags,'height'),mode:text(flags,'mode') as InspectOptions['mode'],timeoutMs:numeric(flags,'timeout'),executablePath:text(flags,'browser'),allowWasm:flags['allow-wasm']===true,cache:flags['no-cache']!==true,storyboard:flags.storyboard===true};
}
export async function inspectionCLI(args:string[]):Promise<unknown>{
  const emit=(result:unknown)=>writeCLIResult(result);
  try{
    if(!args.length||args[0]==='--help')return emit({schemaVersion:1,kind:'frameweave.inspection-help',ok:true,usage:['inspect <project> --json','inspect <project> --frames 0,6,12 --storyboard --output <new-directory> --json','inspect compare --before <directory-or-image> --after <directory-or-image> --json','inspect image <directory> --id <image-id> --json','inspect serve <directory>','inspect iterate <project> --session <directory> --max-iterations 3 --frames 0,6,12 --json']});
    if(args[0]==='compare'){
      const f=parse(args.slice(1),['before','after','output','max-diff','mae','alpha-diff','allow-lossy','allow-policy-difference','json']),a=text(f,'before'),b=text(f,'after');if(!a||!b)fail('E_ARGUMENT','compare needs --before and --after');
      const options:CompareOptions={output:text(f,'output'),allowLossy:f['allow-lossy']===true,allowPolicyDifference:f['allow-policy-difference']===true};
      if(['max-diff','mae','alpha-diff'].some(k=>f[k]!==undefined))options.tolerance={maxChannelDifference:numeric(f,'max-diff'),mae:numeric(f,'mae'),maxAlphaDifference:numeric(f,'alpha-diff')};
      const [sa,sb]=await Promise.all([stat(a),stat(b)]);if(sa.isDirectory()!==sb.isDirectory())fail('E_ARGUMENT','Both compare inputs must be inspection directories, or both must be still images');
      const result=sa.isDirectory()?await compareInspections(a,b,options):await compareImageFiles(a,b,options);if(!result.ok)process.exitCode=1;return emit(result);
    }
    if(args[0]==='image'){
      const directory=args[1];if(!directory)fail('E_ARGUMENT','image needs an inspection directory');const f=parse(args.slice(2),['id','json']),id=text(f,'id');if(!id)fail('E_ARGUMENT','image needs --id');
      const image=await readInspectionImage(directory,id);return emit({schemaVersion:1,kind:'frameweave.inspection-image',ok:true,reference:image.reference,content:[image.content]});
    }
    if(args[0]==='serve'){
      if(args.length!==2)fail('E_ARGUMENT','serve needs exactly one inspection directory');const server=await serveInspectionImages(args[1]);emit({schemaVersion:1,kind:'frameweave.inspection-images',ok:true,images:server.images});
      await new Promise<void>(r=>{const stop=()=>{process.off('SIGINT',stop);process.off('SIGTERM',stop);void server.close().then(r);};process.once('SIGINT',stop);process.once('SIGTERM',stop);});return;
    }
    const iteration=args[0]==='iterate',project=args[iteration?1:0];if(!project||project.startsWith('--'))fail('E_ARGUMENT','A project entry is required');
    const f=parse(args.slice(iteration?2:1),iteration?[...renderFlags.filter(k=>k!=='output'),'session','max-iterations']:renderFlags),options=request(project,f);
    const session=text(f,'session');if(iteration&&!session)fail('E_ARGUMENT','iterate needs --session');
    const result=iteration?await inspectIteration({...options,session:session!,maxIterations:numeric(f,'max-iterations')}):await inspectProject(options);
    if(!result.ok)process.exitCode=1;return emit(result);
  }catch(e){const diagnostics=issues(e,'request');process.exitCode=1;return emit({schemaVersion:1,kind:'frameweave.inspection-error',ok:false,diagnostics,suggestedActions:suggestions(diagnostics)});}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)void inspectionCLI(process.argv.slice(2));
