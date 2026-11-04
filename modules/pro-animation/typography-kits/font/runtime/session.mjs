// SPDX-License-Identifier: Apache-2.0
export class BindgenError extends Error {constructor(code,message){super(message);this.name='BindgenError';this.code=code;}}
const fail=(code,message)=>{throw new BindgenError(code,message);};
const inventory=module=>WebAssembly.Module.imports(module).map(({module,name,kind})=>({module,name,kind})).sort((a,b)=>{const x=a.module+'\0'+a.name,y=b.module+'\0'+b.name;return x<y?-1:x>y?1:0;});
export async function createSession(bytes,profile,createBinding){
  if(profile?.id!=='wasm-bindgen-data-v1'||profile.revision!==1||profile.generator!=='0.2.129'||!Array.isArray(profile.methods)||!profile.methods.length)
    fail('E_BINDGEN_PROFILE','Unsupported wasm-bindgen data profile');
  let compiled;try{compiled=await WebAssembly.compile(bytes);}catch(error){fail('E_BINDGEN_BINARY',`Cannot compile WASM: ${error.message}`);}
  const imports=inventory(compiled);
  if(imports.some(i=>i.kind!=='function')||JSON.stringify(imports)!==JSON.stringify(profile.imports))fail('E_BINDGEN_IMPORTS','WASM imports disagree with the verified, reviewed data profile');
  if(typeof createBinding!=='function'||typeof profile.entryClass!=='string'||!/^\w+$/.test(profile.entryClass))fail('E_BINDGEN_EXPORT','Invalid generated binding factory/class');
  let binding=createBinding(),engine,exports;
  if(!Object.hasOwn(binding,profile.entryClass)||!Object.hasOwn(binding,'initSync')||!Object.hasOwn(binding,'live_sessions')||typeof binding.initSync!=='function'||typeof binding[profile.entryClass]!=='function'||typeof binding.live_sessions!=='function'||typeof binding[profile.entryClass].prototype?.free!=='function')fail('E_BINDGEN_EXPORT','Missing generated constructor/initSync/live_sessions/free');
  try{
    exports=binding.initSync({module:compiled});if(!(exports.memory instanceof WebAssembly.Memory)||!(exports.memory.buffer instanceof ArrayBuffer))fail('E_BINDGEN_PROFILE','Expected private non-shared WASM memory');engine=new binding[profile.entryClass]();
    if(profile.methods.some(name=>['free','__proto__','constructor','prototype','dispose','diagnostics'].includes(name)||typeof engine[name]!=='function'))fail('E_BINDGEN_EXPORT','Invalid public method declaration');
  }catch(error){try{engine?.free();}finally{engine=binding=exports=compiled=undefined;}throw new BindgenError('E_BINDGEN_INIT',String(error?.message??error));}
  let disposed=false;
  return {
    invoke(method,args){
      if(disposed)fail('E_BINDGEN_DISPOSED','Binding is disposed');
      if(!profile.methods.includes(method)||!Array.isArray(args))fail('E_BINDGEN_ARGUMENT','Undeclared public function or invalid arguments');
      try{return engine[method](...args);}catch(error){fail('E_BINDGEN_CALL',`${method}: ${error?.message??String(error)}`);}
    },
    diagnostics(){return disposed?{disposed:true,liveSessions:0,memoryBytes:0}:{disposed:false,liveSessions:binding.live_sessions(),memoryBytes:exports.memory.buffer.byteLength};},
    dispose(){
      if(disposed)return {remainingSessions:0};disposed=true;
      try{engine.free();const remainingSessions=binding.live_sessions();if(remainingSessions!==0)fail('E_BINDGEN_DISPOSE','Generated free did not release the owned Rust session');return {remainingSessions};}
      finally{engine=binding=exports=compiled=undefined;}
    },
  };
}
