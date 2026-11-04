import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {servoStage} from '../../index.ts';
import {document} from './generated/document.ts';
export const card=servoStage({document,defaults:{title:'Frameweave',opacity:1},variables:{'--card-opacity':'opacity'}});
export default <Composition width={480} height={240} fps={24} durationInFrames={72}>
 <Stage id="card" factory={card} props={{opacity:keyframes([{frame:0,value:0},{frame:12,value:1}])}}/>
 <Layer source={ref('card')}/>
</Composition>;
