import {Composition,keyframes} from '@frameweave/engine';
import {PluginStage,plugin} from '@frameweave/engine/plugins';
export default <Composition width={128} height={96} fps={12} durationInFrames={12}>
  <PluginStage id="bindings" pipeline={[plugin('__REFERENCE__',{settings:{label:'Rust → WASM',factor:keyframes([{frame:0,value:0.5},{frame:6,value:1.5},{frame:11,value:1}])}})]}/>
</Composition>;
