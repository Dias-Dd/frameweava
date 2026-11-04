import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {sourceOnly,oneEffect} from '../stages.ts';
export {sourceOnly,oneEffect};
// Exactly matched algorithms/options/order. Only Stage/RPC grouping differs.
export default <Composition width={1920} height={1080} fps={60} durationInFrames={240} background="transparent"><Stage id="source" factory={sourceOnly}/>{Array.from({length:20},(_,index)=><Stage id={'effect'+index} factory={oneEffect} props={{index}} inputs={{image:ref(index===0?'source':'effect'+(index-1)),original:ref('source')}} inputTypes={{image:'surface',original:'surface'}}/>)}<Layer source={ref('effect19')}/></Composition>;
