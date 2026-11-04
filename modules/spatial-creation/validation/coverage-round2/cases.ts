import {particleColorMap,particleSizeMap,particlePositionMap,particleVelocityMap,particlePropertyMap,type ParticlePropertyRule,type ParticleMapOptions} from '../../particle-mapping.ts';
export const positions=[-.75,.75,0,.75,.75,.4,-.75,-.75,-.4,.75,-.75,0,2,0,.1,0,0,0];
export const velocities=Array.from({length:6},()=>[.3,-.1,.2]).flat();
export const rgba=[.05,.1,.15,.5,1,.5,.25,1,1,-.125,.25,.5,-.125,.1875,.5,.25];
export function config(frame:number):{rules:ParticlePropertyRule[];sampling:ParticleMapOptions;integrate:boolean}{
 const kind=frame%12,sampling:ParticleMapOptions={sampling:'nearest'};let rules:ParticlePropertyRule[];
 switch(kind){
  case 0:rules=particleColorMap();break;
  case 1:rules=[particleSizeMap({channel:'r',range:[0,.15]})];break;
  case 2:rules=particlePositionMap();break;
  case 3:rules=particleVelocityMap({range:[-.3,.3]});break;
  case 4:rules=[particlePropertyMap({property:'alpha',channel:'r',operation:'add',range:[-.3,.2],strength:.75})];break;
  case 5:rules=[particlePropertyMap({property:'positionX',channel:'r',operation:'multiply',range:[-2,2]})];break;
  case 6:rules=[...particleVelocityMap(),...particleColorMap(),particleSizeMap({channel:'luma',range:[.02,.12]})];break;
  default:rules=particleColorMap();break;
 }
 if(kind===5)sampling.alphaWeight=true;if(kind===7)sampling.boundary='zero';if(kind===8){sampling.boundary='clamp';sampling.axes='xz';}if(kind===9)sampling.boundary='repeat';if(kind===10)sampling.sampling='linear';if(kind===11){sampling.at='birth';sampling.axes='yz';}
 return {rules,sampling,integrate:kind===11};
}
