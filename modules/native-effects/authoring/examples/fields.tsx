import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {imageStage,fractalNoise,compose,paintStroke,vectorField,vectorBlur,waveformData,waveformOverlay,crossBlur} from '../index.ts';
const width=320,height=180;
// Explicit control data, prepared once; no author GPU buffer or Shader code.
const motion=vectorField(Float32Array.from({length:width*height*2},(_,i)=>i%2?-.15:.7));
const samples=waveformData(Array.from({length:128},(_,i)=>Math.sin(i*.22)*(1+.4*Math.sin(i*.07))));
const stroke={id:'arc',points:[{id:'a',position:[35,130]},{id:'b',position:[150,35]},{id:'c',position:[280,120]}]} as const;
export const finished=imageStage(compose(
 paintStroke(stroke,{radius:8,hardness:.5,opacity:.8,color:[2.1,-.15,.8],end:keyframes([{frame:0,value:.1},{frame:11,value:1}])}),
 vectorBlur(motion,{samples:7}),
 crossBlur({radius:.5}),
 waveformOverlay(samples,{color:[.1,1.7,1.2],gain:.3,width:1.5}),
),{source:fractalNoise({scale:[50,50],seed:37,low:[-.35,.04,.1],high:[-.05,.25,.55]})});
export default <Composition width={width} height={height} fps={24} durationInFrames={12} background="transparent"><Stage id="finish" factory={finished}/><Layer source={ref('finish')}/></Composition>;
