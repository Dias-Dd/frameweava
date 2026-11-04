import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {gradientBackground,foamField,shatterImage} from 'spatial-creation-candidate';

export const artwork=defineNativeStage(()=>gradientBackground({kind:'linear',center:[.02,.55,1.3],edge:[1.4,.15,.08]}));
export const broken=defineNativeStage(()=>shatterImage({
 image:'artwork',pattern:'glass',size:[2.8,1.4],cell:.65,thickness:.075,
 blasts:[{center:[0,.1,-.55],radius:2.6,strength:2.6,at:.12}],
 gravity:[0,-.3,0],drag:.5,tumble:3,randomness:.1,
 interior:[.015,.06,.11],camera:{projection:'orthographic',position:[0,0,5],target:[0,0,0],near:.01,far:50,viewHeight:2.2},
}));
export const bubbles=defineNativeStage(()=>foamField({
 initialCount:12,rate:12,lifetime:.85,frailty:.35,size:.085,area:[2.8,1.4],
 wind:[.15,.08],viscosity:.7,stickiness:.45,repulsion:1,popVelocity:.8,
 flow:{gradient:{kind:'linear',center:[0,0,0],edge:[1,1,1]}},flowStrength:.12,
 environment:{input:'artwork'},reflection:.35,color:[.25,.8,1.6],opacity:.8,highlight:2,
 viewHeight:2.2,substeps:2,
}));
export default Composition({id:'foam-shatter',width:640,height:360,fps:24,durationInFrames:24,background:'#071322',children:[
 Stage({id:'artwork',factory:artwork,outputs:{surface:'surface'}}),
 Stage({id:'broken',factory:broken,inputs:{artwork:ref('artwork')},inputTypes:{artwork:'surface'},outputs:{surface:'surface'}}),
 Stage({id:'bubbles',factory:bubbles,inputs:{artwork:ref('artwork')},inputTypes:{artwork:'surface'},outputs:{surface:'surface'}}),
 Layer({source:ref('broken')}),Layer({source:ref('bubbles')}),
]});
