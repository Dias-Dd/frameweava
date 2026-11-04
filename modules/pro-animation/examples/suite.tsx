import {Composition,Layer,Stage,keyframes,ref} from '@frameweave/engine';
import {defineNativeStage,type GpuPixelImage} from '@frameweave/engine/native';
import {
  createPathAuthoring,crossDissolve,group,keyframeSpan,processRaster,rect,
  scene2D,solid,solidBackground,textGraphemes,
} from 'pro-animation';

const progress=keyframes([{frame:0,value:0},{frame:3,value:1}]);

export const card=defineNativeStage(init=>{
  const path=createPathAuthoring(init).rectanglePath({size:[28,14]});
  const letters=textGraphemes('Frameweave');
  if(!path||letters.length!==10)throw Error('Unexpected vector or typography result');
  return scene2D(init,group({id:'card',children:[
    rect({id:'background',width:96,height:54,fill:solid([.008,.025,.065])}),
    rect({id:'stripe',x:20,y:16,width:28,height:14,fill:solid([.12,1.25,.6])}),
  ]}),{format:'rgba32float'});
});

export const backdrop=defineNativeStage(()=>solidBackground({color:[.5,.08,.24],format:'rgba32float'}));

export const blend=defineNativeStage<{from:GpuPixelImage;to:GpuPixelImage}>(init=>{
  const range=keyframeSpan(progress);
  if(range.duration!==3)throw Error('Unexpected timing range');
  return {async renderAt(context,{from,to}){
    const mixed=await crossDissolve(init,from,to,{progress,format:'rgba32float'},context);
    try{
      return await processRaster(mixed,(image,filters)=>filters.glow(image,{radius:1.5,threshold:1,intensity:.15}),{context});
    }finally{
      await init.gpu.release(mixed);
    }
  }};
});

export default <Composition width={96} height={54} fps={24} durationInFrames={4}>
  <Stage id="card" factory={card}/>
  <Stage id="backdrop" factory={backdrop}/>
  <Stage id="blend" factory={blend}
    inputs={{from:ref('card'),to:ref('backdrop')}}
    inputTypes={{from:'surface',to:'surface'}}/>
  <Layer source={ref('blend')}/>
</Composition>;
