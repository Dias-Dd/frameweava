import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import type {ProfessionalSurface} from '../../src/media/surface.ts';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const frozen=join(root,'artifacts/performance-gpu-pixel-pass/v2-data/frozen');
export const sha256=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export const frozenManifestSha256='de1319612a0042d3286cff2511b56af2883d563f49d5b0ce05306f46372ff96f';
const originalCpuSha256='d29e44f51588f978c1097a90441cff6cf2b7eb181327b138837c8e7d5761fd18';
const cpuFixture=join(root,'tests/fixtures/gpu-float-pass-cpu-reference.ts');
let prepared:Promise<void>|undefined;
/** Strict data-only USTAR reader. Never execute/archive-import code, extract links,
 * accept traversal, trust sizes without bounds, or depend on Git/Python/a prior run. */
async function prepareData(){
 const archiveDirectory=join(root,'benchmarks/experiments/gpu-pixel-pass'),indexBytes=await readFile(join(archiveDirectory,'gaussian-v1-manifest.json'));
 assert.equal(sha256(indexBytes),'23153b01f8ab2bc0ce9a330a235d18dfc54460926a2a820198e4cb98c463feff');
 const index=JSON.parse(indexBytes.toString());assert.equal(index.containsExecutableCode,false);assert.equal(index.referenceCommit,'496b875fa05445e69382f3e57637ade94ed3e27e');assert.equal(index.frozenManifestSha256,frozenManifestSha256);
 const compressed=await readFile(join(archiveDirectory,'gaussian-v1-data.tar.gz'));assert.equal(compressed.length,index.archive.bytes);assert.equal(sha256(compressed),index.archive.sha256);assert.ok(compressed.length<=5*1024*1024);
 const archive=gunzipSync(compressed,{maxOutputLength:16*1024*1024}),expected=new Map<string,any>(index.files.map((entry:any)=>[entry.path,entry]));assert.equal(expected.size,index.files.length);assert.ok(expected.size<=4096);
 const seen=new Set<string>(),members=new Map<string,Buffer>();let offset=0,ended=false;
 const text=(header:Buffer,start:number,length:number)=>header.subarray(start,start+length).toString('ascii').split('\0')[0];
 const octal=(header:Buffer,start:number,length:number)=>{const value=text(header,start,length).trim();assert.match(value,/^[0-7]+$/);const n=parseInt(value,8);assert.ok(Number.isSafeInteger(n)&&n>=0);return n;};
 while(offset+512<=archive.length){
  const header=archive.subarray(offset,offset+512);if(header.every(value=>value===0)){assert.ok(archive.subarray(offset).every(value=>value===0));ended=true;break;}
  const prefix=text(header,345,155),name=(prefix?prefix+'/':'')+text(header,0,100),size=octal(header,124,12),mode=octal(header,100,8),type=header[156];
  assert.ok(name==='archive-index.json'||/^(?:frozen|run)\/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:json|f32|f64)$/.test(name),'Data-only member path: '+name);assert.ok(!seen.has(name),'Duplicate member');seen.add(name);
  assert.ok(type===0||type===48,'Regular files only');assert.equal(mode&0o111,0);assert.equal(text(header,157,100),'');assert.equal(text(header,257,6),'ustar');assert.ok(size<=8*1024*1024);
  let checksum=0;for(let i=0;i<512;i++)checksum+=i>=148&&i<156?32:header[i];assert.equal(octal(header,148,8),checksum,'USTAR checksum');
  assert.ok(offset+512+size<=archive.length);const bytes=archive.subarray(offset+512,offset+512+size);offset+=512+Math.ceil(size/512)*512;
  if(name==='archive-index.json'){const {archive:_archive,...withoutArchive}=index;assert.deepEqual(JSON.parse(bytes.toString()),withoutArchive);}
  else{const record=expected.get(name);assert.ok(record,'Unlisted archive member');assert.equal(bytes.length,record.bytes,name);assert.equal(sha256(bytes),record.sha256,name);members.set(name,bytes);}
 }
 assert.ok(ended,'Tar end marker required');assert.equal(seen.size,index.archive.members);assert.equal(members.size,expected.size);
 for(const name of expected.keys())assert.ok(members.has(name));
 const destination=join(root,'artifacts/performance-gpu-pixel-pass/v2-data');await mkdir(frozen,{recursive:true});
 for(const [name,bytes]of members)if(name.startsWith('frozen/')){
  const target=resolve(destination,name),path=relative(destination,target);assert.ok(path&&!path.startsWith('..')&&!isAbsolute(path));
  try{assert.equal(sha256(await readFile(target)),sha256(bytes),'Existing extracted data changed');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await writeFile(target,bytes,{flag:'wx'});}
 }
}
export async function loadOracle(){
 await(prepared??=prepareData());
 const raw=await readFile(join(frozen,'manifest.json'));assert.equal(sha256(raw),frozenManifestSha256);const manifest=JSON.parse(raw.toString());assert.equal(manifest.commit,'496b875fa05445e69382f3e57637ade94ed3e27e');assert.equal(manifest.cases.length,156);assert.equal(manifest.importOnlyReverseVerified,true);
 async function verified(record:any){const bytes=await readFile(join(frozen,record.file));assert.equal(bytes.length,record.bytes,record.file);assert.equal(sha256(bytes),record.sha256,record.file);return bytes;}
 assert.equal(manifest.sources[0].sha256,originalCpuSha256);
 const adapted=await readFile(cpuFixture);assert.equal(sha256(adapted),'a9541b98e8cea2163c871fa4e348b3d16eac692003d5439b1cd119136b4ee0cd');let imports=0;
 const original=adapted.toString().replace(/from '(\.\.\/\.\.\/src\/[^']+)'/g,(_all,from:string)=>{imports++;return `from '${from.replace('../../src/','../../../src/')}'`;});assert.equal(imports,5);assert.equal(sha256(original),originalCpuSha256,'Only five fixture import adaptations permitted');
 const cpu=await import(pathToFileURL(cpuFixture).href) as {blur:(input:ProfessionalSurface,options:any)=>ProfessionalSurface;glow:(input:ProfessionalSurface,options:any)=>ProfessionalSurface};
 return {manifest,verified,cpu};
}
export async function carryResource(directory:string,id:string,source:string){await mkdir(join(directory,'resources'),{recursive:true});const bytes=await readFile(source),name=id+source.slice(source.lastIndexOf('.')),target=join(directory,'resources',name);await copyFile(source,target);return {id,source:'./resources/'+name,ref:{resourceId:id,kind:'file' as const,bytes:bytes.length,sha256:sha256(bytes)}};}
export async function writeResource(directory:string,id:string,value:unknown){const file=join(directory,id+'.json');await writeFile(file,JSON.stringify(value)+'\n');const bytes=await readFile(file);return {id,source:'./'+id+'.json',ref:{resourceId:id,kind:'file' as const,bytes:bytes.length,sha256:sha256(bytes)}};}
export function compare(actual:ArrayLike<number>,expected:ArrayLike<number>,eps:number){assert.equal(actual.length,expected.length);let maxAbs=0,maxScaled=0,failures=0;for(let i=0;i<actual.length;i++){const difference=Math.abs(actual[i]-expected[i]),scaled=difference/Math.max(1,Math.abs(expected[i]));maxAbs=Math.max(maxAbs,difference);maxScaled=Math.max(maxScaled,scaled);if(!Number.isFinite(actual[i])||!Number.isFinite(expected[i])||scaled>eps)failures++;}return {eps,components:actual.length,maxAbs,maxScaled,failures,passes:failures===0};}
