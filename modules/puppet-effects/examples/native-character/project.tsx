import {Composition,Stage,Layer,ref,keyframes,evaluate} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createCharacterRig,createNativeCharacterRenderer,validateCharacterAsset} from '../../native.ts';
import file from './character.json';
export const actor=defineNativeStage(async init=>{
 const asset=validateCharacterAsset(file),rig=createCharacterRig(asset,{chains:[{id:'right-hand',effector:'hand.r',links:['forearm.r','arm.r'],iterations:32},{id:'left-hand',effector:'hand.l',links:['forearm.l','arm.l'],iterations:32}],limits:{'forearm.r':{min:[0,0,-2.5],max:[0,0,2.5],axis:[0,0,1]},'forearm.l':{min:[0,0,-2.5],max:[0,0,2.5],axis:[0,0,1]}}}),draw=await createNativeCharacterRenderer(init.gpu,asset,{width:init.width,height:init.height,camera:{projection:'orthographic',position:[0,0,5],target:[0,0,0],near:.01,far:20,viewHeight:3},color:[.15,2.4,1,.8]});
 const x=keyframes([{frame:0,value:1.02},{frame:12,value:.7},{frame:23,value:1}]),y=keyframes([{frame:0,value:-.15},{frame:12,value:.95},{frame:23,value:.2}]);
 return {async renderAt(context){const pose=rig.sample(context,{bones:{head:{rotation:[0,0,.13*Math.sin(context.time*4)]},'leg.r':{rotation:[0,0,.12*Math.sin(context.time*6)]},'leg.l':{rotation:[0,0,-.12*Math.sin(context.time*6)]}},targets:{'right-hand':{position:[evaluate(x,context) as number,evaluate(y,context) as number,0]},'left-hand':{position:[-1+.1*Math.sin(context.time*5),.25+.3*Math.sin(context.time*4),0],weight:.8}}});return draw.render(pose);},async dispose(){rig.dispose();await draw.dispose();}};
});
export default Composition({id:'native-puppet-character',width:640,height:360,fps:24,durationInFrames:24,background:'transparent',children:[Stage({id:'actor',factory:actor,outputs:{surface:'surface'}}),Layer({source:ref('actor')})]});
