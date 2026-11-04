import {Composition,Stage,Layer,ref,linear709} from '@frameweave/engine';
import {defineNativeStage,type GpuPixelImage,type GpuDataBuffer} from '@frameweave/engine/native';

/** Geometry is CPU-authored once. Its GPU buffers are first prepared in renderAt. */
export const grid=defineNativeStage(({gpu,width,height})=>{
 const n=32,vertices=new Float32Array(n*n*6*3),index=new Uint32Array(n*n*6);
 let k=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(const [dx,dy]of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]){vertices[k*3]=(x+dx)/n*2-1;vertices[k*3+1]=(y+dy)/n*2-1;index[k]=k;k++;}
 let positions:GpuDataBuffer|undefined,indices:GpuDataBuffer|undefined,revision=-1;
 const field={type:'f32' as const,dimensions:[index.length,1,1]as const,components:3 as const,semantic:'position' as const,space:'clip',units:'ndc'};
 return {async renderAt(c,_inputs,props):Promise<GpuPixelImage>{
  const resident=props.resident!==false,target=c.globalFrame>=4?1:0;
  if(target!==revision){for(let i=0;i<index.length;i++)vertices[i*3]=((Math.floor(i/6)%n+[[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]][i%6][0])/n*2-1)*(target?0.5:1);revision=target;if(positions)positions=await gpu.replaceResidentBuffer(positions,vertices);}
  if(resident){positions??=await gpu.createResidentField(field,vertices);indices??=await gpu.createResidentBuffer({type:'u32',length:index.length},index);}
  const p=resident?positions!:await gpu.createField(field,vertices),i=resident?indices!:await gpu.createBuffer({type:'u32',length:index.length},index),angle=c.time*.1,cs=Math.cos(angle),sn=Math.sin(angle);
  const image=await gpu.drawMesh({positions:p,indices:i,color:[4,-.5,2,.5],matrix:[cs,sn,0,0,-sn,cs,0,0,0,0,1,0,0,0,0,1],output:{width,height,format:props.format==='rgba16float'?'rgba16float':'rgba32float',alpha:'premultiplied',color:linear709}});
  if(!resident){await gpu.releaseBuffer(p);await gpu.releaseBuffer(i);}return image;
 },async dispose(){if(positions)await gpu.releaseBuffer(positions);if(indices)await gpu.releaseBuffer(indices);}};
});
export default <Composition width={1280} height={720} fps={24} durationInFrames={8} background="transparent">
 <Stage id="grid" factory={grid} props={{resident:true}}/>
 <Layer source={ref('grid')}/>
</Composition>;
