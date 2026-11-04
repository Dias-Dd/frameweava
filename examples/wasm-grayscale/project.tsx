import {Composition,Stage,Resource,Layer,ref} from '@frameweave/engine';
export default <Composition width={128} height={64} fps={12} durationInFrames={24} background="transparent">
  <Resource id="wasmModule" kind="file" src="./assets/grayscale.wasm" />
  <Resource id="wasmGlue" kind="file" src="./assets/grayscale.js" />
  <Resource id="wasmWorker" kind="file" src="./assets/worker.js" />
  <Stage id="direct" entry="./stage.ts" exportName="direct" width={64} height={64} outputs={{surface:'surface',stats:'json'}} />
  <Stage id="worker" entry="./stage.ts" exportName="worker" width={64} height={64} outputs={{surface:'surface',stats:'json'}} />
  <Layer id="left" source={ref('direct')} />
  <Layer id="right" source={ref('worker')} x={64} />
</Composition>;
