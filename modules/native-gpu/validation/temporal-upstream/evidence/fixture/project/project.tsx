import {Composition,Stage,Layer,ref,expr} from '@frameweave/engine';
import {linear709} from '@frameweave/engine/native';
import{blurAt}from'test.temporal-upstream';import{defineNativeStage}from'@frameweave/engine/native';const sample=defineNativeStage(()=>({renderAt(c){return blurAt(c);}}));
export {sample};
const source={version:1,kernel:{abiVersion:1,id:'example/temporal-upstream',version:'1.0.0',inputCount:0,parameterWords:3,code:'fn pixel(p:vec2u)->vec4f{let hit=abs(f32(p.x)+.5-(4.+3.*paramF32(0u)))<1.&&abs(f32(p.y)+.5-45.)<12.;return select(vec4f(0.),vec4f(2.,-.25,4.,.5),hit);}'},inputOrder:[],parameterTypes:['f32','f32','f32'],output:{format:'rgba32float',alpha:'premultiplied',color:linear709}};
export default <Composition width={160} height={90} fps={24} durationInFrames={12} background="transparent">
 <Stage id="source" engine="native-gpu" start={1} duration={11} offset={8} rate={{num:1,den:2}} props={{nativePixel:source,parameters:[expr.frame,expr.globalFrame,expr.time]}}/>
 <Stage id="retime" factory={sample} start={2} duration={10} offset={4} rate={2} inputs={{image:ref('source')}} inputTypes={{image:'surface'}}/>
 <Layer source={ref('retime')} start={2}/>
</Composition>;
