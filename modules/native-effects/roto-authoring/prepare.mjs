import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
const root=resolve('.'),out=join(root,'.frameweave/roto-models/slimsam-c16');await mkdir(out,{recursive:true});
const command=['modules/native-effects/roto-authoring/prepare-model.py','--source','.frameweave/source-intake/slimsam','--output',out,'--point-capacity','16'];
const child=spawn(process.env.FRAMEWEAVE_MODEL_PYTHON??'python',command,{cwd:root,windowsHide:true,stdio:'inherit'});const code=await new Promise((ok,bad)=>{child.once('error',bad);child.once('exit',ok);});if(code!==0)process.exit(Number(code)||1);
const receipt=JSON.parse(await readFile(join(out,'derivation.json'),'utf8'));await writeFile(join(process.env.FRAMEWEAVE_ROTO_AUTHORING_RUN,'result.json'),JSON.stringify({ok:true,phase:'model',receipt,executed:false},null,2)+'\n');
