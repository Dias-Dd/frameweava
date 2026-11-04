import {readFile,realpath,stat,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {isUtf8} from 'node:buffer';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {build} from 'esbuild';
import {EngineError} from '../../src/core/errors.ts';
import type {ServoDocument} from './document.ts';
export type {ServoDocument} from './document.ts';

export interface PrepareServoOptions {
 root:string;entry:string;
 /** Explicit IDs and local paths, including every transitive CSS/JS/image/font. */
 resources:Readonly<Record<string,string>>;
 /** Declared UTF-8 license/notice IDs to retain in generated portable source. */
 notices?:readonly string[];
 maxSourceBytes?:number;maxPreparedBytes?:number;
}
const fail=(code:string,message:string):never=>{throw new EngineError(code,message);};
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const within=(root:string,path:string)=>{const r=relative(root,path);return r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!isAbsolute(r);};
const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf'};

/** Node-only preparation. No file access, bundler or downloads in the Stage. */
export async function prepareServo(options:PrepareServoOptions):Promise<ServoDocument> {
 try{return await prepare(options);}catch(error){if(error instanceof EngineError)throw error;throw new EngineError('E_SERVO_PREPARE',String((error as Error).message??error));}
}
async function prepare(options:PrepareServoOptions):Promise<ServoDocument> {
 const root=await realpath(resolve(options.root)),files=new Map<string,{id:string;bytes:Buffer}>(),used=new Set<string>();let sourceBytes=0;
 for(const budget of [options.maxSourceBytes,options.maxPreparedBytes])if(budget!==undefined&&(!Number.isSafeInteger(budget)||budget<1))fail('E_SERVO_BUDGET','Preparation budgets must be positive safe integers');
 for(const [id,name]of Object.entries(options.resources)){
  if(!id||typeof name!=='string')fail('E_SERVO_RESOURCE','Expected explicit resource IDs and paths');
  const path=resolve(root,name),actual=await realpath(path);if(!within(root,actual)||actual!==path)fail('E_SERVO_RESOURCE','Servo resources must be ordinary project-local files without symlink aliases');
  if(files.has(path))fail('E_SERVO_RESOURCE','Each resource path must have one identity');const info=await stat(path);if(!info.isFile())fail('E_SERVO_RESOURCE','Servo resources must be regular files');
  sourceBytes+=info.size;if(!Number.isSafeInteger(sourceBytes)||sourceBytes>(options.maxSourceBytes??Number.MAX_SAFE_INTEGER))fail('E_SERVO_BUDGET','Declared Servo resources exceed preparation budget');files.set(path,{id,bytes:await readFile(path)});
 }
 const entry=Object.entries(options.resources).find(([id])=>id===options.entry);if(!entry)fail('E_SERVO_RESOURCE','Entry must name a declared HTML resource ID');const page=resolve(root,entry![1]);
 const resource=(path:string)=>{const file=files.get(path);if(!file)fail('E_SERVO_UNDECLARED_RESOURCE',`Undeclared Servo dependency: ${relative(root,path)}`);used.add(path);return file!;};
 const text=(path:string)=>{const bytes=resource(path).bytes;if(!isUtf8(bytes))fail('E_SERVO_ENCODING',`Expected UTF-8 text: ${relative(root,path)}`);return bytes.toString('utf8');};
 const target=(url:string,base:string)=>{
  if(!url||/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|\\)/i.test(url))fail('E_SERVO_RESOURCE_URL','Only declared relative file references are prepared; no network, absolute paths or executable URLs');
  let decoded:string;try{decoded=decodeURIComponent(url.split(/[?#]/)[0]);}catch{return fail('E_SERVO_RESOURCE_URL','Invalid encoded resource path');}
  const path=resolve(dirname(base),decoded!);if(!within(root,path))fail('E_SERVO_RESOURCE_URL','Resource reference leaves project root');resource(path);return path;
 };
 const bundle=async(text:string,base:string,kind:'css'|'js')=>{
  try{const result=await build({stdin:{contents:text,sourcefile:base,resolveDir:dirname(base),loader:kind},bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',minifyWhitespace:true,legalComments:'inline',logLevel:'silent',plugins:[{name:'servo-declared-resources',setup(api){
   api.onResolve({filter:/.*/},args=>{
    if(args.kind==='dynamic-import')return fail('E_SERVO_DYNAMIC_IMPORT','Runtime dynamic imports are not part of the prepared Servo profile');
    if(args.path.startsWith('data:')||args.path.startsWith('#')){if(args.kind!=='url-token')fail('E_SERVO_IMPORT','Code imports must name declared files');return{path:args.path,external:true};}
    const path=target(args.path,args.importer||base);if(args.kind==='url-token'){const type=mime[extname(path).toLowerCase()];if(!type)fail('E_SERVO_RESOURCE_TYPE','Expected CSS image/font resource');return{path:`data:${type};base64,${resource(path).bytes.toString('base64')}`,external:true};}return{path,namespace:'servo-resource'};
   });
   api.onLoad({filter:/.*/,namespace:'servo-resource'},args=>{const file=resource(args.path),ext=extname(args.path).toLowerCase(),loader=ext==='.css'?'css':ext==='.ts'?'ts':ext==='.json'?'json':/\.[cm]?js$/.test(ext)?'js':mime[ext]?'dataurl':undefined;if(!loader)fail('E_SERVO_RESOURCE_TYPE',`Unsupported resource type: ${ext}`);return{contents:file.bytes,loader,resolveDir:dirname(args.path)};});
  }}]});return result.outputFiles[0].text;}catch(error){if(error instanceof EngineError)throw error;const e=error as {errors?:{detail?:unknown;text?:string}[]};const detail=e.errors?.find(e=>e.detail instanceof EngineError)?.detail;if(detail instanceof EngineError)throw detail;return fail('E_SERVO_BUNDLE',e.errors?.map(e=>e.text).join('\n')??String(error));}
 };
 const image=(url:string,base:string)=>{if(url.startsWith('data:')||url.startsWith('#')||url==='{{frameweave.input}}')return url;const path=target(url,base),file=resource(path),type=mime[extname(path).toLowerCase()];if(!type)fail('E_SERVO_RESOURCE_TYPE','Expected an image/font resource');return`data:${type};base64,${file.bytes.toString('base64')}${url.includes('#')?'#'+url.split('#')[1]:''}`;};
 const parseErrors:string[]=[];
 const doc=new DOMParser({errorHandler:{warning:()=>{},error:m=>parseErrors.push(m),fatalError:m=>parseErrors.push(m)}}).parseFromString(text(page),'text/html');
 if(parseErrors.length)fail('E_SERVO_HTML',parseErrors.join('\n'));
 const scripts:string[]=[],rawText=new Map<string,string>();
 const raw=(el:Element,text:string)=>{const token=`FW_PREPARED_${rawText.size}_${sha(Buffer.from(text))}`;rawText.set(token,text.replace(/<\/(style|script)/gi,'<\\/$1'));while(el.firstChild)el.removeChild(el.firstChild);el.appendChild(doc.createTextNode(token));};
 for(const el of Array.from(doc.getElementsByTagName('*'))){
  const tag=el.tagName.toLowerCase();
  for(const attribute of Array.from(el.attributes))if(/^on/i.test(attribute.name))fail('E_SERVO_INLINE_HANDLER','Inline event handlers are blocked; bind behavior in the declared initialization script');
  if(['base','iframe','object','embed','video','audio'].includes(tag))fail('E_SERVO_HTML_FEATURE',`Prepared Servo profile does not support <${tag}>`);
  if(el.hasAttribute('srcset'))fail('E_SERVO_HTML_FEATURE','srcset requires an explicit future resource profile; use src');
  if(tag==='script'){
   const type=el.getAttribute('type');if(type&&type!=='module'&&!['text/javascript','application/javascript'].includes(type)){if(type==='application/json'){raw(el,el.textContent??'');continue;}fail('E_SERVO_SCRIPT_TYPE','Unsupported script type');}
   if(el.hasAttribute('async')||el.hasAttribute('defer'))fail('E_SERVO_SCRIPT_ORDER','Prepared scripts initialize in document order; async/defer are unsupported');
   const src=el.getAttribute('src'),path=src?target(src,page):page;const code=src?text(path):el.textContent??'';scripts.push(await bundle(code,path,'js'));el.parentNode?.removeChild(el);continue;
  }
  if(tag==='link'){
   if(el.getAttribute('rel')!=='stylesheet')fail('E_SERVO_HTML_FEATURE','Only stylesheet links are prepared');const path=target(el.getAttribute('href')??'',page),style=doc.createElement('style');raw(style,await bundle(text(path),path,'css'));el.parentNode?.replaceChild(style,el);continue;
  }
  if(tag==='style')raw(el,await bundle(el.textContent??'',page,'css'));
  if(el.hasAttribute('style')){const css=await bundle(`:root{${el.getAttribute('style')}}`,page,'css');el.setAttribute('style',css.slice(css.indexOf('{')+1,css.lastIndexOf('}')).trim());}
  for(const attr of ['src','href','xlink:href'])if(el.hasAttribute(attr)){
   const value=el.getAttribute(attr)!;if(tag==='a'&&value.startsWith('#'))continue;
   if(!['img','image','use'].includes(tag))fail('E_SERVO_HTML_FEATURE',`Resource attribute ${tag}.${attr} is unsupported`);el.setAttribute(attr,image(value,page));
  }
 }
 let html=new XMLSerializer().serializeToString(doc);for(const [token,text]of rawText)html=html.replaceAll(token,text);
 const notices=(options.notices??[]).map(id=>{const name=options.resources[id];if(name===undefined)fail('E_SERVO_UNDECLARED_RESOURCE',`Undeclared notice: ${id}`);return{id,text:text(resolve(root,name))};});
 const result:ServoDocument={version:1,profile:'sdr-srgb8',html,javascript:scripts.join('\n;\n'),resources:[...used].map(path=>{const f=resource(path);return{id:f.id,bytes:f.bytes.length,sha256:sha(f.bytes)};}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),...notices.length?{notices}:{}};
 if(Buffer.byteLength(JSON.stringify(result))>(options.maxPreparedBytes??Number.MAX_SAFE_INTEGER))fail('E_SERVO_BUDGET','Prepared Servo document exceeds output budget');return result;
}

/** Generated pure TS contains all runtime bytes; original files are not runtime dependencies. */
export async function writeServoDocument(file:string,document:ServoDocument){await mkdir(dirname(resolve(file)),{recursive:true});await writeFile(file,`// Generated by prepareServo; resource provenance is included below.\nexport const document = ${JSON.stringify(document,null,2)} as const;\n`);}
