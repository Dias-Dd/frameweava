import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {torus3D,box3D,studioLighting,softLighting,dramaticLighting,rimLighting,sunsetLighting,moonlightLighting,daylightLighting,neonLighting,warmLighting,coolLighting} from 'spatial-creation-candidate';
// Same object/material/camera in the first ten cells: only the light rig changes.
export const studio=defineNativeStage(()=>torus3D({material:'porcelain',camera:'front',rotation:[30,20,0],lighting:studioLighting()}));
export const soft=defineNativeStage(()=>torus3D({material:'porcelain',camera:'front',rotation:[30,20,0],lighting:softLighting()}));
export const dramatic=defineNativeStage(()=>torus3D({material:'porcelain',camera:'front',rotation:[30,20,0],lighting:dramaticLighting()}));
export const rim=defineNativeStage(()=>torus3D({material:'porcelain',camera:'front',rotation:[30,20,0],lighting:rimLighting()}));
export const sunset=defineNativeStage(()=>torus3D({material:'porcelain',camera:'front',rotation:[30,20,0],lighting:sunsetLighting()}));
export const moonlight=defineNativeStage(()=>torus3D({material:'porcelain',camera:'front',rotation:[30,20,0],lighting:moonlightLighting()}));
export const daylight=defineNativeStage(()=>torus3D({material:'porcelain',camera:'front',rotation:[30,20,0],lighting:daylightLighting()}));
export const neon=defineNativeStage(()=>torus3D({material:'porcelain',camera:'front',rotation:[30,20,0],lighting:neonLighting()}));
export const warm=defineNativeStage(()=>torus3D({material:'porcelain',camera:'front',rotation:[30,20,0],lighting:warmLighting()}));
export const cool=defineNativeStage(()=>torus3D({material:'porcelain',camera:'front',rotation:[30,20,0],lighting:coolLighting()}));
export const gold=defineNativeStage(()=>torus3D({material:'gold',camera:'hero',lighting:'studio'}));
export const rubber=defineNativeStage(()=>torus3D({material:'rubber',camera:'hero',lighting:'studio'}));
export const perspective=defineNativeStage(()=>box3D({material:'plastic',camera:'perspective',lighting:'soft'}));
export const top=defineNativeStage(()=>box3D({material:'silver',camera:'top',lighting:'daylight'}));
export default Composition({id:'studio-gallery',width:1680,height:360,fps:24,durationInFrames:24,seed:37,background:'#142033',children:Object.entries({studio,soft,dramatic,rim,sunset,moonlight,daylight,neon,warm,cool,gold,rubber,perspective,top}).flatMap(([id,factory],i)=>[Stage({id,factory,width:240,height:180,outputs:{surface:'surface'}}),Layer({source:ref(id),x:i%7*240,y:Math.floor(i/7)*180})])});
