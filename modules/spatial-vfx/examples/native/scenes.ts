import {defineNativeStage} from '../../../native-gpu/authoring.ts';
import {orbitalWorld,crystalSanctum,emberPlume,causticLagoon} from '../../native.ts';
export const orbitalScene=defineNativeStage(init=>({
 renderAt(c){const angle=.25+c.time*.3;return orbitalWorld(init.gpu,c,{
  width:init.width,height:init.height,steps:64,seed:71,
  camera:{position:[5*Math.sin(angle),1.4,5*Math.cos(angle)],target:[0,0,0],near:.01,far:18,verticalFov:40},
  planet:{planetRadius:.7,thickness:.18,color:[.15,.5,1],sunStrength:12},
  stars:{starDensity:.65,starRadius:.05},trails:{orbits:12,color:[2,.55,.1],exposure:1.8,trailDuration:1.8}
 });}
}));
export const galleryScene=defineNativeStage(init=>({
 renderAt(c){const options={width:init.width,height:init.height,steps:48,seed:71};
  switch(c.frame%4){case 0:return orbitalWorld(init.gpu,c,options);case 1:return crystalSanctum(init.gpu,c,options);case 2:return emberPlume(init.gpu,c,options);default:return causticLagoon(init.gpu,c,options);}
 }
}));
