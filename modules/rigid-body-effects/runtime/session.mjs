// SPDX-License-Identifier: Apache-2.0
// bytes-v1 is a small optional Rust binding ABI, not the P4 or R1 ABI.
export class ModuleError extends Error {
  constructor(code, message) { super(message); this.name = 'ModuleError'; this.code = code; }
}
const fail = (code, message) => { throw new ModuleError(code, message); };
export const MAX_BYTES = 16 * 1024 * 1024;
export function bindInstance(instance) {
  let api = instance?.exports;
  const names = ['fw_abi_version', 'fw_init', 'fw_alloc', 'fw_free', 'fw_call', 'fw_dispose', 'fw_buffer_count'];
  if (!(api?.memory instanceof WebAssembly.Memory) || names.some(name => typeof api[name] !== 'function'))
    fail('E_WASM_EXPORT', `bytes-v1 requires memory and functions: ${names.join(', ')}`);
  if (api.fw_abi_version() !== 1) fail('E_WASM_ABI', 'Unsupported bytes ABI; expected version 1');
  if (api.fw_init() !== 0) fail('E_WASM_INIT', 'Rust module initialization failed');
  let disposed = false;
  const view = (pointer, length) => {
    if (!Number.isInteger(pointer) || pointer <= 0 || pointer + length > api.memory.buffer.byteLength)
      fail('E_WASM_MEMORY', 'Rust returned an invalid memory range');
    return new Uint8Array(api.memory.buffer, pointer, length);
  };
  return {
    call(operation, input, capacity) {
      if (disposed) fail('E_WASM_DISPOSED', 'Module is disposed');
      if (!Number.isInteger(operation) || operation < 0 || operation > 0xffffffff || !(input instanceof Uint8Array) ||
          input.length > MAX_BYTES || !Number.isInteger(capacity) || capacity < 1 || capacity > MAX_BYTES)
        fail('E_WASM_ARGUMENT', 'Expected u32 operation, bounded Uint8Array and positive output capacity');
      let source = 0, target = 0, result, failure;
      try {
        if (input.length) { source = api.fw_alloc(input.length); if (!source) fail('E_WASM_MEMORY', 'Input allocation failed'); }
        target = api.fw_alloc(capacity);
        if (!target || target === source) fail('E_WASM_MEMORY', 'Output allocation failed or aliased input');
        // Allocation can grow Memory: obtain every borrowed view after both allocations.
        if (source) view(source, input.length).set(input);
        view(target, capacity);
        const written = api.fw_call(operation, source, input.length, target, capacity);
        if (!Number.isInteger(written) || written < 0) fail('E_WASM_CALL', `Rust operation ${operation} failed (${written})`);
        if (written > capacity) fail('E_WASM_MEMORY', 'Rust output exceeds capacity');
        result = view(target, written).slice(); // Never expose a live view into Rust memory.
      } catch (error) { failure = error; }
      finally {
        let bad = false;
        for (const pointer of new Set([source, target])) if (pointer) {
          try { if (api.fw_free(pointer) !== 0) bad = true; } catch { bad = true; }
        }
        if (bad) failure = new ModuleError('E_WASM_MEMORY', `Buffer release failed${failure ? ` after ${failure.message}` : ''}`);
      }
      if (failure) throw failure;
      return result;
    },
    diagnostics() {
      if (disposed) return {disposed: true, buffers: 0};
      return {disposed: false, buffers: api.fw_buffer_count()};
    },
    dispose() {
      if (disposed) return {remainingBuffers: 0};
      disposed = true;
      try {
        const status = api.fw_dispose(), remainingBuffers = api.fw_buffer_count();
        if (status !== 0 || remainingBuffers !== 0) fail('E_WASM_DISPOSE', 'Rust module did not release its buffers');
        return {remainingBuffers};
      } finally { api = undefined; instance = undefined; }
    },
  };
}
export async function instantiateModule(bytes) {
  let compiled;
  try { compiled = await WebAssembly.compile(bytes); }
  catch (error) { fail('E_WASM_BINARY', `Cannot compile WASM: ${error.message}`); }
  if (WebAssembly.Module.imports(compiled).length)
    fail('E_WASM_IMPORTS', 'R1 core-v1 requires no host imports; see wasm-bindgen compatibility notes');
  return bindInstance(await WebAssembly.instantiate(compiled, {}));
}
