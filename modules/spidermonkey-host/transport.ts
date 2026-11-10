import {access,readFile,mkdtemp,mkdir,writeFile,unlink,rmdir,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {build as bundle} from 'esbuild';
import {EngineError} from '../../src/core/errors.ts';
import {decodeHostValue,encodeHostValue} from './codec.ts';
import {removeExitedRuntimeFile} from './exited-file.ts';
import {rethrowAfterCleanup} from '../../src/core/failure-cleanup.ts';
import {HostCollectionPressure} from './collection.ts';

export interface NativeLogicTransport {call(method:string,payload:unknown):Promise<unknown>;close():Promise<void>}
export interface TransportOptions {bundleFile:string;timeoutMs:number;stageId:string;seed?:number;allowWasm?:boolean;executable?:string;signal?:AbortSignal;maxMessageBytes?:number;maxMemoryBytes?:number}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export function hostByteBudgets(o:Pick<TransportOptions,'maxMessageBytes'|'maxMemoryBytes'>){const maxMessageBytes=o.maxMessageBytes??64*1024**2,maxMemoryBytes=o.maxMemoryBytes??1024**3;if(!Number.isSafeInteger(maxMessageBytes)||maxMessageBytes<1||maxMessageBytes>0xffffffff||!Number.isSafeInteger(maxMemoryBytes)||maxMemoryBytes<1)throw new EngineError('E_SPIDERMONKEY_BUDGET','Positive safe byte budgets and u32 framing required');return{maxMessageBytes,maxMemoryBytes};}
export class SpiderMonkeyTransport implements NativeLogicTransport{
 private child:ChildProcessWithoutNullStreams;private sequence=0;private pending?:{id:number;resolve:(v:any)=>void;reject:(e:Error)=>void};private input=Buffer.alloc(0);private replyHeader=Buffer.alloc(4);private headerBytes=0;private replyReceived=0;private closed=false;private fatal?:Error;private stderr='';private bytesIn=0;private bytesOut=0;
 private exitDone:Promise<void>;private exited!:()=>void;private closing?:Promise<void>;private binary?:string;private directory='';
 private collection?:HostCollectionPressure;private collections=0;private collectionMs=0;
 private constructor(child:ChildProcessWithoutNullStreams,private options:TransportOptions){
  this.exitDone=new Promise(resolve=>{this.exited=resolve;});
  this.child=child;child.stderr.on('data',b=>{this.stderr=(this.stderr+b).slice(-12000);});child.stdout.on('data',b=>{try{this.receive(b);}catch(e){this.stop(e as Error);}});
  child.on('error',e=>{this.stop(e);this.exited();});child.on('close',(code,signal)=>{if(!this.closing||code!==0)this.stop(new EngineError(/ReferenceError: (process|require) is not defined/.test(this.stderr)?'E_SPIDERMONKEY_NODE_GLOBAL':this.stderr.includes('E_SPIDERMONKEY_UNHANDLED_REJECTION')?'E_SPIDERMONKEY_UNHANDLED_REJECTION':'E_SPIDERMONKEY_EXIT',`Host exited ${code??signal}: ${this.stderr}`,{stageId:options.stageId}));this.closed=true;this.exited();});
  child.stdin.on('error',e=>this.stop(e));
 }
 static async create(o:TransportOptions){
  if(o.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','SpiderMonkey initialization cancelled');
  const windows=process.platform==='win32',linux=process.platform==='linux'&&process.arch==='x64';
  if(!windows&&!linux)throw new EngineError('E_SPIDERMONKEY_SANDBOX','Authored Native Stages require a qualified OS sandbox',{stageId:o.stageId,details:{platform:process.platform,arch:process.arch}});
  const osIsolation=windows?'appcontainer':'linux-bwrap-seccomp-v1';
  const name=windows?'frameweave-spidermonkey-host.exe':'frameweave-spidermonkey-host';
  const installed=join(root,'native-bin',process.platform+'-'+process.arch,name);
  const fallback=await access(installed).then(()=>installed,()=>join(root,'.frameweave/spidermonkey-target/debug',name));
  const executable=resolve(o.executable??process.env.FRAMEWEAVE_SPIDERMONKEY??fallback);
  let binary:Buffer;try{binary=await readFile(executable);}catch{throw new EngineError('E_SPIDERMONKEY_MISSING','Build the SpiderMonkey host explicitly; no V8 fallback');}
  let receipt:any;try{receipt=JSON.parse(await readFile(join(dirname(executable),'spidermonkey-build.json'),'utf8'));}catch{throw new EngineError('E_SPIDERMONKEY_INTEGRITY','Host build receipt missing or malformed');}
  if(!receipt||typeof receipt.executable?.sha256!=='string')throw new EngineError('E_SPIDERMONKEY_INTEGRITY','Host receipt has no executable identity');
  if(createHash('sha256').update(binary).digest('hex')!==receipt.executable.sha256)throw new EngineError('E_SPIDERMONKEY_INTEGRITY','Host binary differs from its build receipt');
  const moduleRoot=join(root,'modules/spidermonkey-host'),names=['Cargo.toml','Cargo.lock','build.mjs','UPSTREAM.json',...(await readdir(join(moduleRoot,'src'))).map(n=>'src/'+n)];
  if(receipt.version!==1||receipt.engine!=='spidermonkey'||linux&&receipt.osIsolation!==osIsolation||Object.keys(receipt.inputs??{}).sort().join('\n')!==names.sort().join('\n'))throw new EngineError('E_SPIDERMONKEY_INTEGRITY','Host receipt has an incompatible source set');
  for(const name of names)if(createHash('sha256').update(await readFile(join(moduleRoot,name))).digest('hex')!==receipt.inputs[name])throw new EngineError('E_SPIDERMONKEY_INTEGRITY','Host source differs from its build receipt: '+name);
  const limits=hostByteBudgets(o),modern=receipt.budgetProfile==='caller-bytes-v1';if(!modern&&(limits.maxMessageBytes!==64*1024**2||limits.maxMemoryBytes!==1024**3))throw new EngineError('E_SPIDERMONKEY_INCOMPATIBLE','Configured host budgets require a matching caller-bytes-v1 runtime receipt');
  const runs=windows?join(root,'.frameweave/sm'):tmpdir();if(windows)await mkdir(runs,{recursive:true});const directory=await mkdtemp(join(runs,'worker-')),worker=join(directory,windows?'sm.exe':'sm');try{await writeFile(worker,binary,{mode:0o700,flag:'wx'});}catch(error){await unlink(worker).catch(()=>{});await rmdir(directory).catch(()=>{});throw error;}

  const child=spawn(worker,modern?['--message-bytes',String(limits.maxMessageBytes),'--memory-bytes',String(limits.maxMemoryBytes)]:[],{windowsHide:true,stdio:['pipe','pipe','pipe'],cwd:directory}),host=new SpiderMonkeyTransport(child,o);host.binary=windows?executable:undefined;host.directory=directory;
  const cancel=()=>{void host.close();};o.signal?.addEventListener('abort',cancel,{once:true});
  try{
   const runtime=await bundle({entryPoints:[join(root,'modules/spidermonkey-host/runtime.ts')],bundle:true,format:'iife',platform:'browser',target:'es2022',write:false,logLevel:'silent',define:{__FRAMEWEAVE_ERROR_BYTES__:String(limits.maxMessageBytes)}});
   // This second pass links ONLY the compiler's sealed, already admitted JS
   // output/chunks. It does not resolve raw project/package source anew.
   const stage=await bundle({entryPoints:[o.bundleFile],bundle:true,format:'iife',platform:'browser',target:'es2022',write:false,logLevel:'silent'});
   const source='globalThis.__fw_osIsolation='+JSON.stringify(osIsolation)+';globalThis.__fw_seed='+JSON.stringify(o.seed??0)+';globalThis.__fw_allowWasm='+JSON.stringify(o.allowWasm===true)+';\n'+runtime.outputFiles[0].text+'\n'+stage.outputFiles[0].text;
   host.collection=new HostCollectionPressure(limits.maxMemoryBytes,Buffer.byteLength(source));
   const ack=await host.evaluate(source,0);
   if(ack?.engine!=='spidermonkey'||ack.osIsolation!==osIsolation)throw new EngineError('E_SPIDERMONKEY_HANDSHAKE','Host did not establish expected isolation');return host;
  }catch(e){return rethrowAfterCleanup(o.signal?.aborted?new EngineError('E_RENDER_CANCELLED','SpiderMonkey initialization cancelled'):e,()=>host.close());}finally{o.signal?.removeEventListener('abort',cancel);}
 }
 private receive(chunk:Buffer){
  this.bytesIn+=chunk.length;let at=0;
  if(this.headerBytes<4){const n=Math.min(4-this.headerBytes,chunk.length);chunk.copy(this.replyHeader,this.headerBytes,0,n);this.headerBytes+=n;at+=n;if(this.headerBytes<4)return;
   const length=this.replyHeader.readUInt32LE(0);if(!length||length>hostByteBudgets(this.options).maxMessageBytes)throw new EngineError('E_NATIVE_PROTOCOL','Reply exceeds configured maxMessageBytes');
   this.input=Buffer.allocUnsafe(length);this.replyReceived=0;
  }
  const n=Math.min(this.input.length-this.replyReceived,chunk.length-at);chunk.copy(this.input,this.replyReceived,at,at+n);this.replyReceived+=n;at+=n;if(this.replyReceived<this.input.length)return;
  if(at!==chunk.length)throw new EngineError('E_NATIVE_PROTOCOL','Unsolicited trailing reply bytes');
  const reply=decodeHostValue(this.input,hostByteBudgets(this.options).maxMessageBytes) as any,pending=this.pending;this.input=Buffer.alloc(0);this.headerBytes=0;this.replyReceived=0;
  if(!pending||reply?.id!==pending.id)throw new EngineError('E_NATIVE_PROTOCOL','Unsolicited or mismatched host reply');this.pending=undefined;
  if(reply.error)pending.reject(new EngineError(reply.error.code??'E_NATIVE_LOGIC',String(reply.error.message),{stageId:this.options.stageId,details:reply.error.details,
   ...typeof reply.error.frame==='number'&&Number.isFinite(reply.error.frame)?{frame:reply.error.frame}:{},...typeof reply.error.hint==='string'?{hint:reply.error.hint}:{}}));else pending.resolve(reply.result);
 }
 private async evaluate(source:string|Uint8Array,id:number,gc=false){
  if(this.closed)throw this.fatal??new EngineError('E_NATIVE_LOGIC_CLOSED','SpiderMonkey transport is closed');if(this.pending)throw new EngineError('E_STAGE_BUSY','Await the preceding host call');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await new Promise<any>((resolve,reject)=>{this.pending={id,resolve,reject};timer=setTimeout(()=>this.stop(new EngineError('E_STAGE_TIMEOUT','SpiderMonkey execution deadline exceeded',{stageId:this.options.stageId})),this.options.timeoutMs);const data=typeof source==='string'?Buffer.from(JSON.stringify({source,gc})):Buffer.concat([Buffer.from([255]),source]);if(data.length>hostByteBudgets(this.options).maxMessageBytes){this.stop(new EngineError('E_NATIVE_PROTOCOL','Request exceeds configured maxMessageBytes'));return;}const header=Buffer.alloc(4);header.writeUInt32LE(data.length);this.bytesOut+=data.length+4;this.child.stdin.write(Buffer.concat([header,data]));});}
  finally{clearTimeout(timer);}
 }
 async call(method:string,payload:unknown){const id=++this.sequence,before=this.bytesIn,result=await this.evaluate(encodeHostValue({id,method,payload},hostByteBudgets(this.options).maxMessageBytes),id);
  if(this.collection?.due(method,result,this.bytesIn-before))await this.collectGarbage();return result;
 }
 async collectGarbage(){const id=++this.sequence,start=performance.now(),result=await this.evaluate(`void __fw_request(${id},'native.diagnostics',{});`,id,true);this.collection?.collected();this.collections++;this.collectionMs+=performance.now()-start;return result;}
 /** Diagnostics only, no image readback and no private GPU handles. */
 stats(){return {engine:'spidermonkey',pid:this.child.pid,closed:this.closed,requests:this.sequence,bytesIn:this.bytesIn,bytesOut:this.bytesOut,collections:this.collections,collectionMs:this.collectionMs,binaryReplies:true,stderr:this.stderr};}
 private stop(error:Error){if(this.closed)return;this.closed=true;this.fatal=error;const pending=this.pending;this.pending=undefined;this.child.kill();pending?.reject(error);}
 close(){return this.closing??=(async()=>{const pending=this.pending;if(pending)this.stop(new EngineError('E_NATIVE_LOGIC_CLOSED','Host closed during execution'));else if(!this.closed)this.child.stdin.end();const timeout=setTimeout(()=>this.stop(new EngineError('E_NATIVE_LOGIC_CLOSED','Host did not close within deadline')),2000);try{await this.exitDone;}finally{clearTimeout(timeout);}if(this.binary&&this.child.pid)await promisify(execFile)(this.binary,['--cleanup',String(this.child.pid)],{windowsHide:true,timeout:5000});if(this.directory){await removeExitedRuntimeFile(join(this.directory,process.platform==='win32'?'sm.exe':'sm'));await rmdir(this.directory);}})();}
}
export const spiderMonkeyTransport=(o:TransportOptions)=>SpiderMonkeyTransport.create(o);
