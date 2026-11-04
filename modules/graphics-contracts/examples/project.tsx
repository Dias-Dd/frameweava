import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {vectorProducer} from '../experiments/vector-producer.ts';
import {maskConsumer} from '../experiments/mask-consumer.ts';
import {trackReaderStage} from '../experiments/track-reader-stage.ts';
import {markerConsumer} from '../experiments/marker-consumer.ts';
import identities from './identities.json';
import {resourceReference} from '../validate.ts';
export {vectorProducer,maskConsumer,trackReaderStage,markerConsumer};

export default <Composition id="Graphics-Contracts" width={128} height={96} fps={16} durationInFrames={128} background="#102436">
  <Resource id="trackFile" kind="file" src="./track-mvp.json"/>
  <Stage id="vector" factory={vectorProducer} props={{fillRule:'evenodd'}} outputs={{path:'json'}}/>
  <Stage id="mask" factory={maskConsumer} inputs={{path:ref('vector','path')}} inputTypes={{path:'json'}} outputs={{surface:'surface',mask:'json'}}/>
  <Stage id="track" factory={trackReaderStage} props={{identity:resourceReference(identities.track),sourceStartSeconds:0,rate:1,target:{spaceId:'demo.canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:128,height:96}}} outputs={{motion:'json'}}/>
  <Stage id="marker" factory={markerConsumer} inputs={{motion:ref('track','motion')}} inputTypes={{motion:'json'}} outputs={{surface:'surface',drawn:'boolean',x:'number',y:'number'}}/>
  <Layer id="maskLayer" source={ref('mask')} opacity={.35}/>
  <Layer id="markerLayer" source={ref('marker')}/>
</Composition>;
