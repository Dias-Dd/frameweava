import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {imageStage,fractalNoise,compose,screen,glow,crossBlur,vignette} from '../index.ts';
const mist=fractalNoise({scale:[60,60],octaves:4,seed:37,low:[-.45,.01,.1],high:[-.1,1.8,3],evolution:keyframes([{frame:0,value:0},{frame:11,value:.3}])});
const clouds=fractalNoise({scale:[25,40],octaves:3,seed:91,low:[.02,.01,.04],high:[1.8,.3,.1],opacity:.4});
export const nebula=imageStage(compose(
 screen(mist,{opacity:.08}), // This same primary source evaluates once per frame.
 screen(clouds,{opacity:.25}), // Same generator family; independent result lease.
 glow({radius:2,threshold:1,intensity:.12,boundary:'clamp'}),
 crossBlur({radius:.5}),
 vignette({amount:.15}),
),{source:mist});
export default <Composition width={320} height={180} fps={24} durationInFrames={12} background="transparent"><Stage id="nebula" factory={nebula}/><Layer source={ref('nebula')}/></Composition>;
