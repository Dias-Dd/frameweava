import {definePlugin,canvasSurface} from '@frameweave/engine/plugins';
import type {Parameters} from './generated/p4.ts';
import {createEngineApi} from './generated/api.ts';
export default definePlugin<Parameters>({kind:'generator',async create(init){
  const api=await createEngineApi(init.loadModule,{worker:__WORKER__});let surface:ReturnType<typeof canvasSurface>;
  try{surface=canvasSurface(init);}catch(error){await api.dispose();throw error;}
  return {async render(_context,_inputs,params){
    const triangles=await api.tessellate(new Float32Array(params.shape.coordinates)),ctx=surface.context,w=init.width*params.shape.scale,h=init.height*params.shape.scale;
    ctx.fillStyle='#101a30';ctx.fillRect(0,0,init.width,init.height);
    for(let i=0;i<triangles.length;i+=6){ctx.beginPath();ctx.moveTo(8+triangles[i]*w,8+triangles[i+1]*h);ctx.lineTo(8+triangles[i+2]*w,8+triangles[i+3]*h);ctx.lineTo(8+triangles[i+4]*w,8+triangles[i+5]*h);ctx.closePath();ctx.fillStyle=['#47c8bd','#71a8f0','#eab966'][i/6%3];ctx.fill();}
    return {image:surface.canvas};},async dispose(){try{await api.dispose();}finally{surface.dispose();}}};
}});
