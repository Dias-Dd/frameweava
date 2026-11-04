import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {linear709} from '../../../src/media/surface.ts';
import {publish} from '../composite/stage.ts';
import {fixtureKernels} from '../keying-pro/stage.ts';
import {createNativeProKeyEffects} from '../keying-pro/index.ts';
export const finalKeyStage=defineNativeStage<Record<string,never>,{format?:'rgba16float'|'rgba32float'}>(init=>{
 const g=init.gpu,fx=createNativeProKeyEffects(init);
 return {async renderAt(c,_i,p){const alpha=c.globalFrame===2?'straight':'premultiplied',source=await g.run(await g.compile(fixtureKernels.source),[],{output:{width:init.width,height:init.height,format:p.format??'rgba32float',color:linear709,alpha},parameters:Uint32Array.of(Number(alpha==='straight'),0,0,0)});await publish(g,'source',source);
 return fx.processImage(source,async(i,f)=>{let out=i;for(const view of ['corrected-source','colour-correction-edges'] as const)for(const graded of [false,true]){out=await f.keyAdvanced(i,{view,despillBias:[1.2,.8,1.1],useAlphaBiasForDespill:false,balance:.3,foreground:graded?{exposure:.5,saturation:.8}:undefined,edge:graded?{saturation:.5}:undefined,edgeWidth:1.7});await publish(g,view+'-'+Number(graded),out);}return out;},{context:c});},async dispose(){await fx.dispose();await fx.dispose();}};
});
