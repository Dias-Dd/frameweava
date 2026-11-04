// Independent consumer. Node built-ins only; no Frameweave source/API imports.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),[tarball,directory]=process.argv.slice(2),npm=JSON.parse(process.env.DX_NPM_JSON??'[]');
if(!tarball||!directory||!npm.length)throw Error('Pass <tarball> <new-directory>; DX_NPM_JSON=[node,npm-cli.js]');
const root=resolve(directory);await mkdir(root);await writeFile(join(root,'package.json'),JSON.stringify({name:'frameweave-independent-consumer',private:true,type:'module'}));
let install;try{const value=await exec(npm[0],[...npm.slice(1),'install','--prefer-offline','--no-audit','--no-fund','--package-lock=false',resolve(tarball)],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});install={exit:0,...value};}catch(e){install={exit:e.code,stdout:e.stdout,stderr:e.stderr};}
let manifest=null;try{manifest=JSON.parse(await readFile(join(root,'node_modules/@frameweave/engine/package.json'),'utf8'));}catch{}
const bin=typeof manifest?.bin==='string'?manifest.bin:manifest?.bin?.frameweave;
const result={schemaVersion:1,kind:'dx-1d.install-audit',installationSucceeded:install.exit===0,install,package:manifest?{name:manifest.name,version:manifest.version,private:manifest.private,bin:manifest.bin??null,exports:manifest.exports}:null,publicLauncher:bin?[process.execPath,join(root,'node_modules/@frameweave/engine',bin)]:null,developerPreviewReady:install.exit===0&&!!bin,gaps:bin?[]:['No public frameweave bin in this package; do not bypass it by invoking private src/cli.ts. Installed-package rendering is NOT verified.']};
await writeFile(join(root,'installation-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
if(!result.developerPreviewReady)process.exitCode=2;
