import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {packagesCLI} from '../lib/packages/cli.js';
import {distributionDoctor} from '../lib/runtime/distribution.js';
import {mediaPython} from '../lib/media/python.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),exec=promisify(execFile),require=createRequire(import.meta.url);
if(process.platform!=='win32'||process.arch!=='x64')throw Error('This full bundle supports Windows x64.');
const home=process.env.FRAMEWEAVE_HOME;if(!home)throw Error('Installer must supply its private data directory.');
const inventory=JSON.parse(await readFile(join(root,'install-components.json'),'utf8'));
for(const item of inventory.models){
 const file=item.home?join(home,item.path):join(root,item.path),data=await readFile(file);
 if(data.length!==item.bytes||createHash('sha256').update(data).digest('hex')!==item.sha256)throw Error('Default model integrity mismatch: '+item.id);
}
const python=mediaPython('E_INSTALL_MEDIA');
const vips=join(dirname(require.resolve('@img/sharp-win32-x64/package')),'lib');
await exec(python,['-I','-c',"import os,sys; os.environ['PATH']=sys.argv[1]+os.pathsep+os.environ.get('PATH',''); dll_directory=os.add_dll_directory(sys.argv[1]); import numpy,OpenEXR,PyOpenColorIO,pyvips; print(numpy.__version__,OpenEXR.__version__,PyOpenColorIO.__version__,pyvips.version(0))",vips],{windowsHide:true,timeout:20000});
for(const variable of ['FRAMEWEAVE_FFMPEG','FRAMEWEAVE_FFPROBE']){if(!process.env[variable])throw Error(variable+' was not resolved by the installer.');await exec(process.env[variable],['-version'],{windowsHide:true,timeout:10000});}
for(const component of ['servo/servo-runtime.json','media/media-runtime.json','inference/inference-runtime.json'])await access(join(root,'native-bin/win32-x64',component));
console.log('Installing all official libraries…');
const index=JSON.parse(await readFile(join(root,'registry/index.json'),'utf8'));
const trust=[...new Set(index.packages.map(record=>'local:'+record.manifest.source.authority))];
const roots=['pro-animation@1.1.0','deep-image@0.1.0','sparse-volume@0.1.0','pro-animation-native@0.2.3'];
const packages=await packagesCLI(['install',roots[0],...roots.slice(1).flatMap(ref=>['--add',ref]),...trust.flatMap(source=>['--trust',source])]);
if(packages.installed.length!==index.packages.length)throw Error('The full official library set was not installed.');
const verified=await packagesCLI(['verify']);if(!verified.valid)throw Error('Installed library verification failed.');
const doctor=await distributionDoctor();
if(!doctor.distribution.verified)throw Error('Installed engine inventory verification failed.');
const receipt={ok:true,profile:'full-windows-x64',node:process.version,python,components:inventory.components,models:inventory.models.map(m=>({id:m.id,bytes:m.bytes,sha256:m.sha256})),packages:packages.installed,distribution:doctor.distribution,runtimePin:doctor.runtimePin};
await mkdir(home,{recursive:true});await writeFile(join(home,'full-installation.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
