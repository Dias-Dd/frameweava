import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {ribbonScene,type FinishPreset} from 'spatial-creation-candidate';
const shot=(finish:FinishPreset)=>defineNativeStage(()=>ribbonScene({particles:false,ribbon:{segments:32,width:.5},finish}));
export const clean=shot('clean'),cinema=shot('cinema'),dream=shot('dream'),neon=shot('neon'),noir=shot('noir');
export const warm=shot('warm'),cool=shot('cool'),pastel=shot('pastel'),poster=shot('poster'),sepia=shot('sepia');
const choices={clean,cinema,dream,neon,noir,warm,cool,pastel,poster,sepia};
export default Composition({id:'finish-gallery',width:1600,height:360,fps:24,durationInFrames:24,
 children:Object.entries(choices).flatMap(([id,factory],i)=>[
  Stage({id,factory,width:320,height:180,outputs:{surface:'surface'}}),
  Layer({source:ref(id),x:(i%5)*320,y:Math.floor(i/5)*180}),
 ])});
