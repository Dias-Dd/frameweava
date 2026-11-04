import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {puppetImage,puppetSway,puppetBend,puppetStretch,puppetBreathe,puppetWave,puppetJelly,puppetFlutter,puppetReach,puppetSquash} from 'spatial-creation-candidate';
const image={resource:'plant',size:[320,400] as const};
export const still=defineNativeStage(()=>puppetImage({image,pins:{base:{at:[.5,.95]}}}));
export const sway=defineNativeStage(()=>puppetSway({image})),bend=defineNativeStage(()=>puppetBend({image})),stretch=defineNativeStage(()=>puppetStretch({image}));
export const breathe=defineNativeStage(()=>puppetBreathe({image})),wave=defineNativeStage(()=>puppetWave({image})),jelly=defineNativeStage(()=>puppetJelly({image}));
export const flutter=defineNativeStage(()=>puppetFlutter({image})),reach=defineNativeStage(()=>puppetReach({image})),squash=defineNativeStage(()=>puppetSquash({image}));
export default Composition({id:'image-puppet-gallery',width:1280,height:640,fps:24,durationInFrames:24,background:'#101927',children:[
 Resource({id:'plant',kind:'image',src:'./puppet-plant.png'}),
 ...Object.entries({still,sway,bend,stretch,breathe,wave,jelly,flutter,reach,squash}).flatMap(([id,factory],i)=>[
  Stage({id,factory,width:256,height:320,outputs:{surface:'surface'}}),Layer({source:ref(id),x:i%5*256,y:Math.floor(i/5)*320}),
 ]),
]});
