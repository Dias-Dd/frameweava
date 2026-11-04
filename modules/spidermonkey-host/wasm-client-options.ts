/** Explicit Native adapter: use the existing solver instance inside the
 * OS-isolated JS host. No Worker shim, second solver or automatic WASM grant. */
export function nativeWasmOptions<T extends object>(options:T):T&{worker:false}{
 if(typeof WebAssembly==='undefined')throw Object.assign(new Error('Native WASM requires the existing explicit allowWasm authorization'),{code:'E_WASM_PERMISSION'});
 if(!options||typeof options!=='object'||Array.isArray(options))throw Object.assign(new Error('Expected Native WASM client options'),{code:'E_WASM_ARGUMENT'});
 if((options as any).worker===true)throw Object.assign(new Error('Native WASM executes inside the isolated host; browser Workers are unavailable'),{code:'E_WASM_WORKER_UNAVAILABLE'});
 return {...options,worker:false};
}
