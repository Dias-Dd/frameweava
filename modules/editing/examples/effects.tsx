import {video,clip,withEffects,effect,transition,sequenceWithTransitions,editingStage,editComposition} from '../index.ts';
// Generate this one-second source with validation/prepare-effects.ts, or replace it with footage.
const footage=video('motion','./motion.mp4',{width:320,height:180});
const first=withEffects(clip(footage,{duration:18}),effect('exposure',{stops:.3}),effect('vignette',{amount:.3}));
const second=withEffects(clip(footage,{from:6,duration:18}),effect('hueSaturation',{hue:25}),effect('glow',{radius:2,intensity:.35,threshold:.5}));
// 18 + 18 - 12 overlap = 24 project frames. Each source sample remains explicit.
export const edited=editingStage({fps:24,tracks:[sequenceWithTransitions([first,second],transition('crossDissolve',{duration:12}))],effects:[effect('brightnessContrast',{contrast:1.05})]});
export default editComposition({id:'effect-edit',width:640,height:360,factory:edited});
