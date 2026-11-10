import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {discoverPackages,packageFiles,packageRef} from '../src/packages/manifest.ts';
import {validateRegistry,type RemoteRegistry} from '../src/packages/remote-registry.ts';
import {buildCatalogApi} from '../modules/pro-animation/scripts/build-catalog-api.ts';

const [catalogArg,outputArg,baseUrl]=process.argv.slice(2);
if(!catalogArg||!outputArg||!baseUrl)throw Error('Usage: build-package-registry <frozen-catalog> <fresh-output> <GitHub-release-download-base>');
const catalog=resolve(catalogArg),output=resolve(outputArg);await mkdir(output,{recursive:true});
const records=await discoverPackages([catalog]);
const packages=await Promise.all(records.map(async record=>{
  const files:Record<string,string>={};for(const file of await packageFiles(record.directory))files[relative(record.directory,file).replaceAll('\\','/')]=(await readFile(file)).toString('base64');
  const expanded=Buffer.from(JSON.stringify(files)),archive=gzipSync(expanded),ref=packageRef(record.manifest),name=record.manifest.id+'-'+record.manifest.version+'.json.gz';
  await writeFile(join(output,name),archive,{flag:'wx'});
  return {manifest:record.manifest,directory:'',integrity:record.integrity,moduleIntegrity:record.moduleIntegrity,
    functions:record.functions,creationGuide:record.creationGuide,
    archive:{schemaVersion:1 as const,url:baseUrl+'/'+name,sha256:createHash('sha256').update(archive).digest('hex'),bytes:archive.length,expandedBytes:expanded.length,packages:{[ref]:record.integrity}}};
}));
const api=buildCatalogApi(process.cwd(),records);
const index:RemoteRegistry={schemaVersion:1,packages,api};
const config={schemaVersion:1 as const,repository:'Dias-Dd/frameweava',channel:'dev',indexUrl:'https://raw.githubusercontent.com/Dias-Dd/frameweava/dev/registry/index.json'};
validateRegistry(index,config);
await writeFile(join(output,'index.json'),JSON.stringify(index)+'\n');
const bundled=resolve('registry');await mkdir(bundled,{recursive:true});await copyFile(join(output,'index.json'),join(bundled,'index.json'));
console.log(JSON.stringify({output,indexBytes:(await readFile(join(output,'index.json'))).length,archiveBytes:packages.reduce((n,p)=>n+p.archive.bytes,0),packages:packages.map(p=>({reference:packageRef(p.manifest),bytes:p.archive.bytes}))}));
