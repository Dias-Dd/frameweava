/** Embedded mozjs has no off-thread Promise dispatch initialized. Reuse its
 * real Module/Instance constructors, exposing the standard Promise result
 * shapes to existing loaders. Compilation blocks this isolated worker; the
 * controller's wall-time deadline/cancellation still terminates the process.
 * No streaming/network/WASI facility or WASM permission is added. */
export function installWasmPromiseAdapter(runtime:typeof WebAssembly){
 const Module=runtime.Module,Instance=runtime.Instance;
 Object.defineProperty(runtime,'compile',{configurable:true,writable:true,value:async function compile(bytes:BufferSource,options?:unknown){return new (Module as any)(bytes,options) as WebAssembly.Module;}});
 Object.defineProperty(runtime,'instantiate',{configurable:true,writable:true,value:async function instantiate(source:WebAssembly.Module|BufferSource,imports:WebAssembly.Imports={},options?:unknown){if(source instanceof Module)return new Instance(source,imports);const module=new (Module as any)(source,options) as WebAssembly.Module;return {module,instance:new Instance(module,imports)};}});
}
