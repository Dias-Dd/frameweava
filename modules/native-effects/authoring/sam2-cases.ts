import {evaluate,keyframes} from '../../../src/core/animation.ts';
import {videoRotoModel,trackVideoRoto,withPreparedEffects,withImageSources,compose,exposure,offsetRGB,type ImageEffect,type VideoRotoFrames} from './index.ts';
import bundle from './examples/assets/sam2-bundle.json';import {photo,seedMask} from './sam2-fixture.ts';
export const model=videoRotoModel(bundle),softness=keyframes([{frame:0,value:.1},{frame:102,value:.2}]);
export const frames:readonly VideoRotoFrames[]=[[photo,photo,photo],{totalFrames:3,read:async()=>photo,sources:[photo]},[photo,undefined,photo]];
const finish=(effect:ImageEffect)=>compose(effect,exposure(1),offsetRGB({offset:[-.1,-.1,-.1]}));
export const cases=[0,1,2].map(index=>({name:['seed','reader','missing'][index],effect:finish(trackVideoRoto(model,frames[index],{frame:()=>index,seedMask,softness,segmentFrames:1})),direct:finish(withImageSources(withPreparedEffects(model,async(i,f,frame)=>{
 const width=index===2?[photo,undefined,photo]:[photo,photo,photo],soft=evaluate(softness,frame.context!);if(typeof soft!=='number')throw Error('Expected numeric softness');
 const result=await f.trackVideoRoto(i,async n=>width[n]===undefined?undefined:frame.input(width[n]),{id:'subject',seedFrame:0,frame:index,totalFrames:3,seedMask:await frame.input(seedMask),softness:soft,segmentFrames:1});
 if(result.observedFrames!==(index===2?2:index+1)||result.missingFrames!==(index===2?1:0))throw Error('Original missing observation behavior changed');return result.image;
 }),seedMask,photo))}));
