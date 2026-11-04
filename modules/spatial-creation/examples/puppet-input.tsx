import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {puppetSway,puppetBreathe} from 'spatial-creation-candidate';
export const sway=defineNativeStage(()=>puppetSway({image:{resource:'plant',size:[320,400]}}));
// Borrow the existing public image port. Margin0 preserves the upstream canvas
// framing; the second operation owns only its new result, not the input image.
export const breathe=defineNativeStage(()=>puppetBreathe({image:'art',margin:0,amount:.025}));
export default Composition({id:'composed-image-puppet',width:640,height:360,fps:24,durationInFrames:24,background:'#101927',children:[
 Resource({id:'plant',kind:'image',src:'./puppet-plant.png'}),
 Stage({id:'sway',factory:sway,outputs:{surface:'surface'}}),
 Stage({id:'breathe',factory:breathe,inputs:{art:ref('sway')},inputTypes:{art:'surface'},outputs:{surface:'surface'}}),
 Layer({source:ref('breathe')}),
]});
