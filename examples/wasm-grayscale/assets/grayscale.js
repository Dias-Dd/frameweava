/* Apache-2.0. Small audited glue for the demo's explicit Rust ABI; no eval or generated code. */
(() => {
  globalThis.createFrameWeaveGrayscale = async (url, byteLength) => {
    if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength % 4 !== 0 || byteLength > 64 * 1024 * 1024)
      throw Error('Invalid grayscale buffer length');
    const response = await fetch(url);
    if (!response.ok) throw Error(`WASM resource unavailable (${response.status})`);
    const bytes = await response.arrayBuffer();
    if (!WebAssembly.validate(bytes)) throw Error('Invalid Rust/WASM module');
    let instance = (await WebAssembly.instantiate(bytes, {})).instance;
    let api = instance.exports;
    if (typeof api.fw_abi_version !== 'function' || api.fw_abi_version() !== 1 || !(api.memory instanceof WebAssembly.Memory))
      throw Error('Unsupported grayscale Rust/WASM ABI');
    let pointer = api.fw_alloc(byteLength);
    if (!pointer) throw Error('Rust/WASM allocation failed');
    let disposed = false;
    return {
      process(pixels) {
        if (disposed) throw Error('Grayscale session is disposed');
        if (!(pixels instanceof Uint8Array) || pixels.length !== byteLength) throw Error('RGBA input length mismatch');
        // Recreate views after any allocation / memory growth; never retain a borrowed view.
        new Uint8Array(api.memory.buffer, pointer, byteLength).set(pixels);
        const status = api.fw_grayscale(pointer, byteLength);
        if (status !== 0) throw Error(`Rust/WASM grayscale failed (${status})`);
        return {pixels: new Uint8Array(api.memory.buffer, pointer, byteLength).slice(),
          checksum: api.fw_checksum(pointer), liveBuffers: api.fw_live_allocations()};
      },
      dispose() {
        if (disposed) return {remainingBuffers: 0};
        disposed = true;
        const released = api.fw_release(pointer), remainingBuffers = api.fw_live_allocations();
        pointer = 0; api = undefined; instance = undefined;
        if (released !== 1 || remainingBuffers !== 0) throw Error('Rust/WASM buffer cleanup failed');
        return {remainingBuffers};
      }
    };
  };
})();
