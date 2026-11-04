import {Composition,Stage,Layer,Resource,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {puppetSway} from 'spatial-creation-candidate';

// Change this to puppetBend/puppetWave/puppetBreathe, or use puppetImage for
// explicitly placed normalized pins. GPU and solver resources are automatic.
export const flower=defineNativeStage(()=>puppetSway({
 image:{resource:'plant',size:[320,400]},
 amount:keyframes([{frame:0,value:.09},{frame:23,value:.16}]),
 frequency:.65,
}));
export default Composition({id:'paper-flower',width:640,height:360,fps:24,durationInFrames:24,background:'#101927',children:[
 Resource({id:'plant',kind:'image',src:'./puppet-plant.png'}),
 Stage({id:'flower',factory:flower,outputs:{surface:'surface'}}),Layer({source:ref('flower')}),
]});
