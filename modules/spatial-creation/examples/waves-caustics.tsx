import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {waveWorld,heightCaustics,gradientBackground,waveLineSource,wavePointSource,waveImpulse,waveObstacle,waveTerrain} from 'spatial-creation-candidate';
export const floor=defineNativeStage(()=>gradientBackground({kind:'linear',center:[.14,.28,.3],edge:[.38,.22,.12]}));
export const waves=defineNativeStage(()=>waveWorld({
 dimensions:[80,54],size:[3,2],substeps:4,speed:1,damping:.2,
 terrain:waveTerrain({kind:'shore',level:1,elevation:.45,slope:[.55,0]}),
 sources:[waveLineSource({position:[-.9,0],radius:[.08,.65],amplitude:.075,frequency:2}),wavePointSource({position:[-.15,-.5],amplitude:.04,frequency:3})],
 obstacles:[waveObstacle({kind:'circle',position:[.35,.15],size:[.4,.5]})],
 initial:[waveImpulse({position:[-.3,.25],radius:.35,amplitude:.075})],
 edges:{left:'reflect',right:'reflect',top:'absorb',bottom:'absorb'},view:'height',
}));
export const water=defineNativeStage(()=>heightCaustics({
 surface:'waves',bottom:'floor',size:[3,2],depth:.8,ior:1.333,maxFocus:6,smoothing:5,
 surfaceColor:[.025,.24,.32],surfaceOpacity:.035,ambient:.8,diffuse:.2,specular:.12,sharpness:70,
}));
export default Composition({id:'waves-caustics',width:640,height:360,fps:24,durationInFrames:24,background:'#071322',children:[
 Stage({id:'floor',factory:floor,outputs:{surface:'surface'}}),
 Stage({id:'waves',factory:waves,outputs:{surface:'surface'}}),
 Stage({id:'water',factory:water,inputs:{waves:ref('waves'),floor:ref('floor')},inputTypes:{waves:'surface',floor:'surface'},outputs:{surface:'surface'}}),
 Layer({source:ref('water')}),
]});
