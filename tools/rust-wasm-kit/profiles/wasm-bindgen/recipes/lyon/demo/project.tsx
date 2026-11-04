import {Composition,keyframes} from '@frameweave/engine';
import {PluginStage,plugin} from '@frameweave/engine/plugins';
export default <Composition width={128} height={96} fps={12} durationInFrames={12}>
  <PluginStage id="lyon" pipeline={[plugin('__REFERENCE__',{shape:{scale:keyframes([{frame:0,value:0.5},{frame:6,value:0.8},{frame:11,value:0.65}])}})]}/>
</Composition>;
