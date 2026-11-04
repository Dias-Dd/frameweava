import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {blur,glow,gpuImageStats} from 'test.gpu-images';
/** The verifier installs a temporary reviewed R1 binding named test.gpu-images.
 * Main owns the final package identity/manifest; no ambient GPU setup is needed. */
export const picture=defineMediaStage(init=>({async renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4);
 for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++){
  const dx=x-init.width*(.3+.2*ctx.progress),dy=y-init.height*.5,inside=dx*dx+dy*dy<(init.height*.16)**2;
  p.set(inside?[4,1.5,-.12,.85]:[-.015,.025,.05,1],(y*init.width+x)*4);
 }
 const input=surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'straight'});
 const softened=await blur(input,{radius:keyframes([{frame:0,value:.7},{frame:2,value:1.25}]),alpha:'premultiplied'},ctx);
 const surface=await glow(softened,{radius:3,threshold:.5,intensity:1.2},ctx);
 return {surface,stats:gpuImageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="transparent"><Stage id="image" factory={picture} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('image')}/></Composition>;
