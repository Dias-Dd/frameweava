import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {buildNativeAnimationPackage} from './build-native-package.ts';
import {buildProAnimationSuite} from './build-suite.ts';
import {buildSpatialCreation} from '../../spatial-creation/scripts/build.ts';
import {readFile,writeFile,readdir,copyFile,rename} from 'node:fs/promises';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join,dirname,basename,relative} from 'node:path';import {fileURLToPath} from 'node:url';
import {buildNativeImagePackage} from '../../native-effects/scripts/build-package.ts';
import {officialFunctions} from '../../../src/capabilities/official-functions.ts';
import {discoverPackages,packageRef} from '../../../src/packages/manifest.ts';
import {catalogFunctionNames} from '../../../src/packages/official-catalog.ts';
import {CATALOG_API_INDEX} from '../../../src/capabilities/catalog-api.ts';
import {buildCatalogApi} from './build-catalog-api.ts';
import {RELEASE_CATALOG,verifyReleaseCatalogPin,type ReleaseCatalogPin} from '../../../src/packages/release-catalog.ts';
const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),base=join(workspace,'.frameweave/native-catalog');await mkdir(base,{recursive:true});
const catalog=await mkdtemp(join(base,'delivery-'));await buildNativeImagePackage(join(catalog,'native-image-effects'));await buildNativeAnimationPackage(join(catalog,'pro-animation-native'));const spatial=await buildSpatialCreation(join(catalog,'spatial-creation'));
async function formalize(directory:string,id:string,version:string,authority:string){
 const manifest=JSON.parse(await readFile(join(directory,'frameweave.package.json'),'utf8')),previous=manifest.id,previousVersion=manifest.version;
 manifest.id=id;manifest.version=version;manifest.name=id==='native-2d'?'Native 2D':'Spatial Creation';manifest.source.authority=authority;
 await writeFile(join(directory,'frameweave.package.json'),JSON.stringify(manifest,null,2)+'\n');
 // Keep copied authoring examples and guides aligned with the installable identity.
 // Original algorithm/source hashes in provenance receipts are retained unchanged.
 async function rewrite(folder:string){for(const e of await readdir(folder,{withFileTypes:true})){const file=join(folder,e.name);if(e.isDirectory()){if(e.name==='examples')await rewrite(file);continue;}if(!/\.(?:tsx|md)$/.test(e.name)&&!['guide.json','creation-guide.json'].includes(e.name))continue;const text=await readFile(file,'utf8');await writeFile(file,text.replaceAll(previous+'@'+previousVersion,id+'@'+version).replaceAll(previous,id));}}
 await rewrite(directory);
}
await formalize(spatial,'spatial-creation','1.1.1','frameweave.spatial');
const drawing=join(catalog,'native-2d');
// The formal drawing capability uses explicit services. The optional local
// default-font carrier has its own identity and cannot change these bytes.
const drawingEnvironment={...process.env};
for(const name of ['NATIVE2D_VERSION','NATIVE2D_TYPOGRAPHY_SDK','NATIVE2D_DEFAULT_FONT','NATIVE2D_FONT_LICENSE'])delete drawingEnvironment[name];
await promisify(execFile)(process.execPath,['--import','tsx',join(workspace,'modules/native-2d/scripts/build.ts'),drawing],{cwd:workspace,env:drawingEnvironment,windowsHide:true,maxBuffer:4*1024**2});
await copyFile(join(workspace,'modules/native-2d/validation/phase1/evidence/fixtures/studio.png'),join(drawing,'studio.png'));
await formalize(drawing,'native-2d','0.2.0','frameweave.native-2d');
await Promise.all(['deep-exr','sparse-volume'].map(name=>promisify(execFile)(process.execPath,[join(workspace,'modules',name,'build.mjs'),join(catalog,name)],{cwd:workspace,windowsHide:true,maxBuffer:4*1024**2})));
const suite=await buildProAnimationSuite(catalog);
const records=await discoverPackages([catalog]);
const publicFunctions=catalogFunctionNames(records.map(record=>record.manifest));
for(const [reference,functions] of Object.entries(officialFunctions))for(const entry of functions)
 for(const name of [entry.name,...entry.imports??[]])
  if(!publicFunctions.get(reference)?.has(name))throw Error(`Official search entry has no callable public export: ${reference}#${name}`);
const api=buildCatalogApi(workspace,records);
await writeFile(join(catalog,CATALOG_API_INDEX),JSON.stringify({schemaVersion:1,packages:api})+'\n');
const delivery=basename(catalog),pointer=join(base,delivery+'.current');
let release: {asset:string;manifest:string}|undefined;
const releaseUrl=process.env.FRAMEWEAVE_OFFICIAL_CATALOG_URL;
if(releaseUrl){
 const entries:Record<string,string>={};
 async function walk(directory:string){
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const file=join(directory,entry.name);
   if(entry.isDirectory())await walk(file);
   else if(entry.isFile())entries[relative(catalog,file).replaceAll('\\','/')]=(await readFile(file)).toString('base64');
   else throw Error('Official catalog requires ordinary files');
  }
 }
 await walk(catalog);
 const expanded=Buffer.from(JSON.stringify(entries)),archive=gzipSync(expanded);
 const pin:ReleaseCatalogPin={schemaVersion:1,url:releaseUrl,sha256:createHash('sha256').update(archive).digest('hex'),
  bytes:archive.length,expandedBytes:expanded.length,packages:Object.fromEntries(records.map(record=>[packageRef(record.manifest),record.integrity]))};
 verifyReleaseCatalogPin(pin);
 const folder=join(base,delivery+'-release');await mkdir(folder);
 const asset=join(folder,basename(new URL(releaseUrl).pathname)),manifest=join(folder,RELEASE_CATALOG);
 await writeFile(asset,archive);await writeFile(manifest,JSON.stringify(pin,null,2)+'\n');
 release={asset,manifest};
}
await writeFile(pointer,delivery+'\n');
await rename(pointer,join(base,'current'));
console.log(JSON.stringify({catalog,profile:'native-only',suite,release}));
