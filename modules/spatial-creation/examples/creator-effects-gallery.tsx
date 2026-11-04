import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {characterWave,neonRing,solidBackground,stackCreations,placeCreation,blurCreation,glowCreation,shadowCreation,innerShadowCreation,outlineCreation,sharpenCreation,pixelateCreation,chromaKeyCreation,lumaKeyCreation,wobbleCreation,maskCreation} from 'spatial-creation-candidate';
export const blur=defineNativeStage(()=>blurCreation(characterWave(),{radius:2}));
export const glow=defineNativeStage(()=>glowCreation(neonRing({ink:[.2,2,3],finish:false})));
export const shadow=defineNativeStage(()=>shadowCreation(characterWave(),{color:'#080d20',radius:3,offset:[6,8]}));
export const inner=defineNativeStage(()=>innerShadowCreation(characterWave(),{color:'#06213a',radius:2}));
export const outline=defineNativeStage(()=>outlineCreation(characterWave(),{width:3,color:'#ffedbf'}));
export const sharpen=defineNativeStage(()=>sharpenCreation(characterWave()));
export const pixelate=defineNativeStage(()=>pixelateCreation(characterWave(),{blockSize:[5,5]}));
export const keyed=defineNativeStage(()=>chromaKeyCreation(stackCreations([solidBackground({color:'#00ff00'}),characterWave()]),{color:'#00ff00'}));
export const luma=defineNativeStage(()=>lumaKeyCreation(characterWave(),{low:.02,high:.25}));
export const wobble=defineNativeStage(()=>wobbleCreation(characterWave(),{amount:4,frequency:3}));
export const masked=defineNativeStage(()=>maskCreation(solidBackground({color:'#18bad3'}),placeCreation(characterWave(),{rotation:-10})));
export default Composition({id:'creator-effects-gallery',width:1920,height:480,fps:24,durationInFrames:24,seed:37,background:'#637c91',children:[
 ...Object.entries({blur,glow,shadow,inner,outline,sharpen,pixelate,keyed,luma,wobble,masked}).flatMap(([id,factory],i)=>[Stage({id,factory,width:320,height:240,outputs:{surface:'surface'}}),Layer({source:ref(id),x:i%6*320,y:Math.floor(i/6)*240})]),
]});
