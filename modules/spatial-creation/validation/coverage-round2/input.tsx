import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {gradientBackground,mappedParticleField,particleColorMap} from 'spatial-creation-candidate';
export const paint=defineNativeStage(()=>gradientBackground({kind:'linear',center:[keyframes([{frame:0,value:.1},{frame:23,value:2}]),.2,1.5],edge:'#ff6330',start:[0,0],end:[96,64]}));
export const field=defineNativeStage(()=>mappedParticleField({count:32,radius:.06,ephemeral:[{source:{input:'paint'},rules:particleColorMap()}]}));
export default Composition({id:'mapped-input',width:96,height:64,fps:24,durationInFrames:24,seed:9,background:'transparent',children:[Stage({id:'paint',factory:paint,outputs:{surface:'surface'}}),Stage({id:'field',factory:field,inputs:{paint:ref('paint')},inputTypes:{paint:'surface'},outputs:{surface:'surface'}}),Layer({source:ref('field')})]});
