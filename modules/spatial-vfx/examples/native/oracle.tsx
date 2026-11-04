import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {orbitalTrails,planetAtmosphere,waterCaustics,voronoiCrystal} from '../../index.ts';
import {orbitalWorld,causticLagoon,crystalSanctum} from '../../native.ts';
const camera={position:[0,0,5] as [number,number,number],target:[0,0,0] as [number,number,number],near:.01,far:18,verticalFov:40};
export const oracle=defineNativeStage(init=>({renderAt(c){
 const context={...c,frame:12,time:.5,globalFrame:12,globalTime:.5},base={width:init.width,height:init.height,camera,steps:48,seed:71};
 if(c.frame<3)return orbitalTrails(init.gpu,context,{...base,orbits:8,eccentricity:.12,...c.frame===0?{}:{occluderRadius:c.frame===1?0:3}});
 if(c.frame===3)return orbitalWorld(init.gpu,context,{...base,stars:false,trails:false});
 if(c.frame===4)return planetAtmosphere(init.gpu,context,{...base,planetRadius:.7,thickness:.18});
 if(c.frame===5)return causticLagoon(init.gpu,context,{...base,fog:false,beam:false});
 if(c.frame===6)return waterCaustics(init.gpu,context,{...base,color:[.04,.4,.65],exposure:1.5,focus:.1});
 if(c.frame===7)return crystalSanctum(init.gpu,context,{...base,stars:false,glow:false,crystal:{color:[2,.5,.25],exposure:2,opacity:.5}});
 return voronoiCrystal(init.gpu,context,{...base,format:c.frame===8?'rgba16float':'rgba32float',color:[2,.5,.25],exposure:2,opacity:.5,facets:24});
}}));
export default Composition({id:'native-spatial-oracles',width:96,height:64,fps:24,durationInFrames:10,background:'transparent',children:[Stage({id:'oracle',factory:oracle,outputs:{surface:'surface'}}),Layer({source:ref('oracle')})]});
