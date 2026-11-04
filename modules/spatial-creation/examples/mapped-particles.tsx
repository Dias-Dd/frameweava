import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {mappedParticleField,particleColorMap,particleSizeMap,particlePropertyMap} from 'spatial-creation-candidate';
export const particles=defineNativeStage(()=>mappedParticleField({
 count:220,radius:.035,color:[2,.6,.15,.8],
 persistent:[{source:{gradient:{kind:'linear',center:[0,0,0],edge:[1,1,1],start:[0,0],end:[640,360]}},rules:[particlePropertyMap({property:'velocityY',channel:'r',range:[-.12,.18]})]}],
 ephemeral:[{source:{gradient:{center:'#20cce6',edge:'#ff632e',start:[keyframes([{frame:0,value:0},{frame:23,value:180}]),0],end:[640,360]}},rules:[...particleColorMap(),particleSizeMap({channel:'r',range:[.014,.052]})]}],
}));
export default Composition({id:'mapped-particles',width:640,height:360,fps:24,durationInFrames:24,seed:21,background:'#08101f',children:[Stage({id:'particles',factory:particles,outputs:{surface:'surface'}}),Layer({source:ref('particles')})]});
