/* Apache-2.0. Prebuilt classic worker; all dependency URLs arrive through declared Resources. */
let session;
self.onmessage = async ({data}) => {
  const {id, method} = data;
  try {
    if (method === 'init') {
      if (session) throw Error('Worker already initialized');
      importScripts(data.glueUrl);
      session = await self.createFrameWeaveGrayscale(data.wasmUrl, data.byteLength);
      self.postMessage({id, result: true});
    } else if (method === 'process') {
      if (!session) throw Error('Worker not initialized');
      const result = session.process(new Uint8Array(data.pixels));
      self.postMessage({id, result: {...result, pixels: result.pixels.buffer}}, [result.pixels.buffer]);
    } else if (method === 'dispose') {
      const result = session?.dispose() ?? {remainingBuffers: 0}; session = undefined;
      self.postMessage({id, result});
      self.close();
    } else throw Error('Unknown grayscale worker method');
  } catch (error) {
    self.postMessage({id, error: error instanceof Error ? error.message : String(error)});
  }
};
