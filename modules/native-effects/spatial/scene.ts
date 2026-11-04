import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {createGpuPixelEffects} from '../../gpu-effects/pixel-effects.ts';
import {linear709} from '../../../src/media/surface.ts';
import {descriptor,validityDescriptor,camera as fieldCamera} from '../../spatial-fields/parameters.ts';
import {nativeSpatialFrame} from './frame.ts';
import {createNativeProfessionalEffects} from '../extended.ts';
import {camera} from './cases.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
/** Actual compute -> mesh raster -> volume -> lens/fog -> depth matte -> colour
 * chain on one owner. No CPU result transfer; immutable geometry initialized once. */
export const spatialScene=defineNativeStage(async init=>{
 const gpu=init.gpu,seed=await gpu.createField({type:'f32',dimensions:[6,1,1],components:3,semantic:'position',space:'example.world',units:'meter'},Float32Array.of(-.8,-.7,0,.8,-.7,0,.0,.8,0,-.55,-.3,.1,.55,-.3,.1,.0,.65,.1));
 const images=createNativeProfessionalEffects(init),pixels=createGpuPixelEffects(gpu),cam=fieldCamera(camera,init.width,init.height);
 const depthKernel=await gpu.compileCompute({abiVersion:1,id:'example/native-spatial-depth',version:'1.0.0',bindings:[{type:'f32',access:'read_write'},{type:'f32',access:'read_write'}],parameterWords:1,workgroupSize:[8,8,1],code:'fn compute(p:vec3u,l:vec3u,w:vec3u){let i=p.y*workItems().x+p.x;store0(i,2.+.35*sin(f32(p.x)*.025+paramF32(0u)));store1(i,1.);}'});
 return {async renderAt(c){const f=nativeSpatialFrame(init,c),ownedBuffers:GpuDataBuffer[]=[],ownedImages:GpuPixelImage[]=[],depth=await gpu.createField(descriptor('axial-depth',[init.width,init.height,1],c,{camera:cam.key})),validity=await gpu.createField(validityDescriptor([init.width,init.height,1],c));
  try{const twisted=await f.mesh.twistPositions(seed,{rate:.35,offset:{$expr:'mul',args:[.15,{$expr:'time',args:[]}]}});ownedBuffers.push(twisted);const waved=await f.mesh.wavePositions(twisted,{amplitude:.08,phase:c.time,frequency:4});ownedBuffers.push(waved);
   const mesh=await gpu.drawMesh({positions:waved,count:6,color:[2,.6,-.1,.5],output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied',color:linear709}});ownedImages.push(mesh);
   const density=await f.compute.cellularVolume({dimensions:[8,8,8],origin:[-1,-1,-1],spacing:[.25,.25,.25],strength:.5,seed:17});ownedBuffers.push(density);const volume=await f.compute.renderVolume(density,{steps:32,position:[0,0,3],target:[0,0,0],color:[.2,.65,2],far:8,maxWork:Math.max(1e9,init.width*init.height*32*8)});ownedImages.push(volume);
   const composed=await pixels.over(mesh,volume);ownedImages.push(composed);const fog=await f.vfx.heightFog(composed,{density:.04,distance:2,falloff:0});ownedImages.push(fog);const lens=await f.vfx.gravitationalLensing(fog,{einsteinRadius:.04,occluderRadius:0});ownedImages.push(lens);
   await gpu.dispatch(depthKernel,[depth,validity],{workItems:[init.width,init.height,1],parameters:Float32Array.of(c.time)});const matte=await f.fields.depthRangeMatte({data:depth,validity},{camera,near:1.75,far:2.25,softness:.1});ownedImages.push(matte);
   return await images.processImage(lens,async(i,fx)=>{i=await fx.applyMatte(i,matte);i=await fx.exposure(i,{stops:.15});return fx.vignette(i,{radius:.75,amount:.15});},{context:c});
  }finally{for(const image of ownedImages.reverse())await gpu.release(image);for(const b of [...ownedBuffers,depth,validity])await gpu.releaseBuffer(b);}
 },dispose:images.dispose};
});
