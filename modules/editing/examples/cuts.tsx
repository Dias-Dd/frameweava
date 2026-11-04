import {keyframes} from '@frameweave/engine';
import {video,image,clip,sequence,at,editComposition,editingStage} from '@frameweave/engine/editing';

// Run validation/prepare.ts once to create these tiny, real media fixtures.
// Replace the paths and source sizes with your own tagged Rec709 footage.
const footage=video('footage','./footage.mp4',{width:320,height:180});
const badge=image('badge','./badge.png',{width:80,height:80,missingProfile:'assume-srgb'});
export const edited=editingStage({fps:24,
 tracks:[
  sequence(clip(footage,{from:12,duration:12}),clip(footage,{from:0,duration:12})),
  [at(6,clip(badge,{duration:12,transform:{scale:.25,x:keyframes([{frame:0,value:160},{frame:23,value:220}]),y:90}}))]
 ]
});
export default editComposition({id:'cuts',width:640,height:360,factory:edited});
