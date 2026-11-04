import {Composition,Stage,Layer,Resource,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {puppetImage,puppetPositionPin,puppetOverlapPin,puppetStarchPin,puppetBendPin,puppetAdvancedPin} from 'spatial-creation-candidate';
export const flower=defineNativeStage(()=>puppetImage({
 image:{resource:'plant',size:[320,400]},pins:{base:{at:[.5,.95]}},
 controls:[
  puppetPositionPin({at:[.3,.7]}),
  puppetStarchPin({at:[.5,.85],amount:8,extent:.28}),
  puppetBendPin({at:[.3,.55],rotation:3,extent:.3,strength:.5}),
  puppetAdvancedPin({at:[.5,.2],to:[keyframes([{frame:0,value:.48},{frame:23,value:.52}]),.2],rotation:keyframes([{frame:0,value:-3},{frame:23,value:3}]),extent:.4}),
  puppetOverlapPin({at:[.35,.45],inFront:2,extent:.4}),
 ],
}));
export default Composition({id:'puppet-controls',width:640,height:360,fps:24,durationInFrames:24,background:'#101927',children:[Resource({id:'plant',kind:'image',src:'./puppet-plant.png'}),Stage({id:'flower',factory:flower,outputs:{surface:'surface'}}),Layer({source:ref('flower')})]});
