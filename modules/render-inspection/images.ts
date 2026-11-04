import {assertMediaPolicy} from '../../src/media/compositor.ts';
import {mkdir,writeFile,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import type {ImageReference,InspectionPolicy} from './types.ts';
import {LIMITS,hash,fail,plain,within,boundedFile} from './common.ts';

export async function writeImage(directory:string,name:string,png:Buffer):Promise<ImageReference>{
  if(!/^[a-z0-9-]+$/.test(name))fail('E_INSPECTION_IMAGE','Invalid generated image name');
  if(png.length>LIMITS.imageBytes)fail('E_INSPECTION_LIMIT','Image byte budget exceeded');
  if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('E_INSPECTION_IMAGE','Inspection captures must be PNG');
  const decoded=await sharp(png,{limitInputPixels:LIMITS.pixels}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const file=`images/${name}.png`,root=await realpath(directory);await mkdir(join(root,'images'),{recursive:true});const imageDirectory=await realpath(join(root,'images'));if(!within(root,imageDirectory))fail('E_INSPECTION_PATH','Image output directory escapes inspection root');await writeFile(join(imageDirectory,`${name}.png`),png,{flag:'wx'});
  return {id:name,uri:`inspection-image:${name}`,file,mime:'image/png',sha256:hash(png),rgbaSha256:hash(decoded.data),bytes:png.length,width:decoded.info.width,height:decoded.info.height};
}
export interface LoadedInspection {
  kind:'frameweave.render-inspection'|'frameweave.inspection-comparison';
  project:string;policy?:InspectionPolicy;images:ImageReference[];
  frames:{frame:number;stageId?:string;ok:boolean;image?:ImageReference}[];
}
function imageRef(v:unknown):ImageReference {
  if(!plain(v)||typeof v.id!=='string'||!/^[-a-z0-9]{1,100}$/.test(v.id)||v.uri!==`inspection-image:${v.id}`||typeof v.file!=='string'||!/^images\/[a-z0-9-]+\.png$/.test(v.file)||v.mime!=='image/png'||typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256)||typeof v.rgbaSha256!=='string'||!/^[a-f0-9]{64}$/.test(v.rgbaSha256)||typeof v.bytes!=='number'||!Number.isInteger(v.bytes)||v.bytes<1||v.bytes>LIMITS.imageBytes||typeof v.width!=='number'||!Number.isInteger(v.width)||v.width<1||typeof v.height!=='number'||!Number.isInteger(v.height)||v.height<1||v.width*v.height>LIMITS.pixels)fail('E_INSPECTION_IMAGE','Malformed allowlisted image reference');
  return {id:v.id,uri:v.uri,file:v.file,mime:v.mime,sha256:v.sha256,rgbaSha256:v.rgbaSha256,bytes:v.bytes,width:v.width,height:v.height};
}
export async function loadInspection(directory:string):Promise<LoadedInspection>{
  const root=await realpath(directory);let report:string;try{report=await realpath(join(root,'inspection.json'));}catch{fail('E_INSPECTION_REPORT','Inspection manifest is missing or unavailable');}
  if(!within(root,report))fail('E_INSPECTION_PATH','Inspection manifest escapes its directory');
  let v:unknown;try{v=JSON.parse((await boundedFile(report,LIMITS.reportBytes)).toString('utf8'));}catch(e){if(e instanceof SyntaxError)fail('E_INSPECTION_REPORT','Invalid inspection JSON');throw e;}
  if(!plain(v)||v.schemaVersion!==1||v.kind!=='frameweave.render-inspection'&&v.kind!=='frameweave.inspection-comparison'||!Array.isArray(v.images)||v.images.length>512)fail('E_INSPECTION_REPORT','Unsupported inspection report');
  const images=v.images.map(imageRef);if(new Set(images.map(x=>x.id)).size!==images.length)fail('E_INSPECTION_REPORT','Duplicate image IDs');
  let policy:InspectionPolicy|undefined;
  if(v.kind==='frameweave.render-inspection'){
    const p=v.policy;if(!plain(p)||p.mode!=='accurate'&&p.mode!=='preview'||p.capture!=='png'||p.gpuPolicy!=='swiftshader'&&p.gpuPolicy!=='auto'||typeof p.cache!=='boolean'||typeof p.allowWasm!=='boolean'||!plain(p.environment))fail('E_INSPECTION_REPORT','Invalid recorded render policy');
    const e=p.environment;for(const key of ['platform','arch','node','engineVersion','sdkIntegrity'])if(typeof e[key]!=='string'||String(e[key]).length>256)fail('E_INSPECTION_REPORT','Invalid render environment');
    if(typeof e.browserVersion!=='string'||! /^(?:not-exposed|[0-9]+(?:\.[0-9]+){1,4})$/.test(e.browserVersion)||e.browserVersion.length>64||e.gpuDevice!=='not-probed'||e.browserExecutable!==undefined&&typeof e.browserExecutable!=='string')fail('E_INSPECTION_REPORT','Invalid browser environment');
    if(p.media)assertMediaPolicy(p.media as import('../../src/media/compositor.ts').MediaPolicy);
    policy={...p.media?{media:p.media as import('../../src/media/compositor.ts').MediaPolicy}:{},mode:p.mode as InspectionPolicy['mode'],capture:'png',gpuPolicy:p.gpuPolicy as InspectionPolicy['gpuPolicy'],cache:p.cache,allowWasm:p.allowWasm,environment:{platform:String(e.platform),arch:String(e.arch),node:String(e.node),engineVersion:String(e.engineVersion),sdkIntegrity:String(e.sdkIntegrity),browserVersion:e.browserVersion,gpuDevice:'not-probed',...(typeof e.browserExecutable==='string'?{browserExecutable:e.browserExecutable}:{})}};
  }
  const frames:LoadedInspection['frames']=[];
  if(v.kind==='frameweave.render-inspection'){
    if(!Array.isArray(v.frames)||v.frames.length>LIMITS.frames)fail('E_INSPECTION_REPORT','Invalid frame list');
    for(const raw of v.frames){if(!plain(raw)||!Number.isInteger(raw.frame)||Number(raw.frame)<0||typeof raw.ok!=='boolean'||raw.stageId!==undefined&&typeof raw.stageId!=='string')fail('E_INSPECTION_REPORT','Invalid frame record');
      const image=raw.image===undefined?undefined:imageRef(raw.image);if(image&&!images.some(x=>JSON.stringify(x)===JSON.stringify(image)))fail('E_INSPECTION_REPORT','Frame image is not allowlisted');
      if(raw.ok&&!image)fail('E_INSPECTION_REPORT','Successful frame has no image');frames.push({frame:Number(raw.frame),ok:raw.ok,...(typeof raw.stageId==='string'?{stageId:raw.stageId}:{}),...(image?{image}:{})});
    }
  }
  return {kind:v.kind as LoadedInspection['kind'],project:typeof v.project==='string'?v.project:'',...(policy?{policy}:{}),images,frames};
}
/** Verify whitelist, real path, encoded bytes, dimensions and raw pixels before delivering an image. */
export async function readInspectionImage(directory:string,id:string):Promise<{reference:ImageReference;content:{type:'image';mimeType:'image/png';data:string};bytes:Buffer}>{
  const root=await realpath(directory),report=await loadInspection(root),reference=report.images.find(x=>x.id===id||x.uri===id);
  if(!reference)fail('E_INSPECTION_IMAGE','Image is not declared by this inspection');
  let path:string;try{path=await realpath(resolve(root,reference.file));}catch{fail('E_INSPECTION_IMAGE',`Declared image is missing or unavailable: ${reference.id}`);}if(!within(root,path))fail('E_INSPECTION_PATH','Image escapes the inspection directory');
  const bytes=await boundedFile(path,LIMITS.imageBytes);if(bytes.length!==reference.bytes||hash(bytes)!==reference.sha256)fail('E_INSPECTION_INTEGRITY','Inspection image bytes changed');
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('E_INSPECTION_IMAGE','Allowlisted image is not PNG');
  const decoded=await sharp(bytes,{limitInputPixels:LIMITS.pixels}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(decoded.info.width!==reference.width||decoded.info.height!==reference.height||hash(decoded.data)!==reference.rgbaSha256)fail('E_INSPECTION_INTEGRITY','Inspection image pixels or dimensions changed');
  return {reference,content:{type:'image',mimeType:'image/png',data:bytes.toString('base64')},bytes};
}
/** Ephemeral loopback image delivery. No project server, arbitrary path route or wildcard file access. */
export async function serveInspectionImages(directory:string){
  const report=await loadInspection(directory),token=randomBytes(24).toString('hex');let origin='';
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const url=new URL(req.url??'/',origin||'http://127.0.0.1');
    if(url.searchParams.get('token')!==token){res.writeHead(403);res.end();return;}
    if(req.method!=='GET'||!/^\/image\/[a-z0-9-]+$/.test(url.pathname)){res.writeHead(404);res.end();return;}
    try{const image=await readInspectionImage(directory,url.pathname.slice(7));res.setHeader('Content-Type','image/png');res.end(image.bytes);}catch{res.writeHead(404);res.end();}
  });
  await new Promise<void>((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});const address=server.address();if(!address||typeof address==='string')throw Error('No image server address');origin=`http://127.0.0.1:${address.port}`;
  return {images:report.images.map(ref=>({...ref,url:`${origin}/image/${ref.id}?token=${token}`})),close:async()=>{server.closeAllConnections();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}};
}
