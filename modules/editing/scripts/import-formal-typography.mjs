import {copyFile,readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join,dirname} from 'node:path';import {createHash} from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const file=process.argv[2];if(!file)throw Error('Provide the reviewed frozen preparation SDK archive');
const expected='569d235809c2006d6da49705d7b936314e9a6f213d3bc7b01262e2496119cd97',root=resolve('.frameweave/editing/formal-typography-consumer');await mkdir(root,{recursive:true});
const sha=createHash('sha256').update(await readFile(file)).digest('hex');if(sha!==expected)throw Error('Frozen typography SDK checksum differs');const archive=join(root,'typography-preparation.tgz');await copyFile(file,archive);
await writeFile(join(root,'package.json'),JSON.stringify({name:'editing-typography-consumer',version:'0.0.0',private:true,type:'module'})+'\n');
const result=await promisify(execFile)(process.execPath,[join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),'install','--offline','--ignore-scripts','--no-package-lock','--no-audit','--no-fund',archive],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:4*1024**2});
await writeFile(join(root,'installation.json'),JSON.stringify({copiedFrom:resolve(file),sha256:sha,root,stdout:result.stdout,stderr:result.stderr,scope:'independent frozen Node preparation SDK; original Core SDK untouched'},null,2)+'\n');
console.log(JSON.stringify({root,sha256:sha,...result}));
