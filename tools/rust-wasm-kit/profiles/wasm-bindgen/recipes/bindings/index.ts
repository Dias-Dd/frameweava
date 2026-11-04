import {definePlugin,canvasSurface} from '@frameweave/engine/plugins';
import type {Parameters} from './generated/p4.ts';
import {createEngineApi} from './generated/api.ts';
export default definePlugin<Parameters>({kind:'generator',async create(init){
  const api=await createEngineApi(init.loadModule,{worker:__WORKER__});let surface:ReturnType<typeof canvasSurface>;
  try{surface=canvasSurface(init);}catch(error){await api.dispose();throw error;}
  return {async render(_context,_inputs,params){
    const label=await api.normalize(params.settings.label,new Float64Array(params.settings.samples)),values=await api.scale(new Float64Array(params.settings.samples),params.settings.factor),ctx=surface.context;
    ctx.fillStyle='#121d30';ctx.fillRect(0,0,init.width,init.height);ctx.fillStyle='#edb968';ctx.fillRect(8,8,Math.min(init.width-16,label.length*4),6);
    for(let i=0;i<values.length;i++){ctx.fillStyle=i%2?'#60a5ea':'#45caba';ctx.fillRect(8+i*(init.width-16)/values.length,init.height-8-Math.min(init.height-32,values[i]*6),(init.width-16)/values.length-3,Math.min(init.height-32,values[i]*6));}
    return {image:surface.canvas};},async dispose(){try{await api.dispose();}finally{surface.dispose();}}};
}});
