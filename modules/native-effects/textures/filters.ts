import type {NativeStageInit} from '../../native-gpu/authoring.ts';
import {nativePixelInfo} from '../../native-gpu/image-info.ts';
import {linear709} from '../../../src/media/surface.ts';
import {createNativeRecipeProcessor} from '../images.ts';
import {rasterFilters,type NativeRasterFilters} from '../raster/filters.ts';
import {parameters,integer,octavePlan,split,fail} from './control.ts';
import {textureKernel} from './kernels.ts';
import type * as T from './types.ts';
export {nativeTextureNames} from './types.ts';
export type NativeTextureRecipeFilters=T.NativeTextureFilters&Pick<NativeRasterFilters,'over'>;
const fractalFields=['octaves','lacunarity','gain'];
export function createNativeTextureEffects(init:Pick<NativeStageInit,'gpu'|'width'|'height'|'seed'>){return createNativeRecipeProcessor<NativeTextureRecipeFilters>(init,(g,context,track,outer)=>{
 async function generate(name:string,mode:number,o:T.FractalOptions,fields:readonly string[],extra:(p:ReturnType<typeof parameters>)=>{values?:readonly number[];flags?:readonly number[];warp?:number}){
  const p=parameters(name,context,outer);p.fields(o,fields);const info=nativePixelInfo({width:o.width??init.width,height:o.height??init.height,format:o.format??'rgba32float',alpha:'premultiplied',color:o.workingColor??linear709},g.capabilities()),scale=p.point(o.scale,[64,64],'scale',2**-63),offset=p.point(o.offset,[0,0],'offset'),rotation=p.scalar(o.rotation,0,'rotation')%360*Math.PI/180,evolution=p.scalar(o.evolution,0,'evolution'),seed=integer(o.seed??init.seed,name,'seed',0),low=p.triple(o.low,[0,0,0],'low'),high=p.triple(o.high,[1,1,1],'high'),opacity=p.scalar(o.opacity,1,'opacity',0,1),contrast=p.scalar(o.contrast,1,'contrast',0),brightness=p.scalar(o.brightness,0,'brightness'),specific=extra(p),octaves=fields.includes('octaves')?integer(o.octaves??4,name,'octaves'):1,lacunarity=p.scalar(o.lacunarity,2,'lacunarity',1),gain=p.scalar(o.gain,.5,'gain',0,1),bound=(info.width+info.height+Math.abs(offset[0])+Math.abs(offset[1]))/Math.min(...scale)+Math.abs(specific.warp??0)+16;
  if(Math.abs(evolution)+octaves>=0x3fffffff)fail(name,'evolution','int32 temporal lattice coordinates');const caps=g.capabilities().limits,table=octavePlan(octaves,lacunarity,gain,bound,Math.floor(Math.min(caps.maxStorageBufferBindingSize,caps.maxBufferSize)/4)),words=new Uint32Array(128),floats=new Float32Array(words.buffer);words.set([mode,octaves,specific.flags?.[0]??64,seed,specific.flags?.[1]??1]);const values=[...scale,...offset,Math.cos(rotation),Math.sin(rotation),evolution,0,0,0,...low,...high,opacity,contrast,brightness,0,...specific.values??[]];floats.set(values.flatMap(split),8);const data=await g.createBuffer({type:'f32',length:table.length},table);try{return await g.run(await g.compile(textureKernel),[],{output:info,data:[data],parameters:words,signal:o.signal??outer});}finally{await g.releaseBuffer(data);}
 }
 const empty=()=>({});
 const cell=(o:T.CellOptions,p:ReturnType<typeof parameters>)=>({values:[p.scalar(o.jitter,1,'jitter',0,1),p.scalar(o.edgeWidth,.1,'edgeWidth',2**-63),.05]});
 const tile=(o:T.TileOptions,p:ReturnType<typeof parameters>)=>({values:[p.scalar(o.lineWidth,.12,'lineWidth',0,.5),p.scalar(o.softness,.03,'softness',0,.5)]});
 const orbit=(o:T.OrbitOptions,p:ReturnType<typeof parameters>)=>({values:[...p.point(o.constant,[-.8,.156],'constant'),p.scalar(o.bailout,4,'bailout',4,2**32)],flags:[integer(o.iterations??64,'orbit','iterations')]});
 const f:T.NativeTextureFilters={
  async fractalNoise(o={}){return generate('fractalNoise',0,o,fractalFields,empty);},
  async turbulentNoise(o={}){return generate('turbulentNoise',1,o,fractalFields,empty);},
  async ridgedNoise(o={}){return generate('ridgedNoise',2,o,fractalFields,empty);},
  async curlTexture(o={}){return generate('curlTexture',3,o,[],empty);},
  async domainWarpTexture(o={}){return generate('domainWarpTexture',4,o,[...fractalFields,'warp'],p=>{const warp=p.scalar(o.warp,2,'warp',0);return {values:[warp],warp};});},
  async gaborTexture(o={}){return generate('gaborTexture',5,o,['frequency','bandwidth','impulses'],p=>({values:[p.scalar(o.frequency,3,'frequency',0),p.scalar(o.bandwidth,3,'bandwidth',2**-63,80)],flags:[64,integer(o.impulses??2,'gaborTexture','impulses')]}));},
  async cellularTexture(o={}){return generate('cellularTexture',6,o,['jitter'],p=>cell(o,p));},
  async voronoiEdges(o={}){return generate('voronoiEdges',7,o,['jitter','edgeWidth'],p=>cell(o,p));},
  async crackleTexture(o={}){return generate('crackleTexture',8,o,['jitter','edgeWidth'],p=>cell(o,p));},
  async marbleTexture(o={}){return generate('marbleTexture',9,o,[...fractalFields,'frequency','warp'],p=>{const warp=p.scalar(o.warp,2,'warp',0);return {values:[p.scalar(o.frequency,2,'frequency',0),warp]};});},
  async woodTexture(o={}){return generate('woodTexture',10,o,[...fractalFields,'frequency','warp'],p=>({values:[p.scalar(o.frequency,4,'frequency',0),p.scalar(o.warp,.5,'warp',0)]}));},
  async graniteTexture(o={}){return generate('graniteTexture',11,o,fractalFields,()=>({values:[1,.1]}));},
  async cloudsTexture(o={}){return generate('cloudsTexture',12,o,fractalFields,empty);},
  async causticsTexture(o={}){return generate('causticsTexture',13,o,['jitter','edgeWidth'],p=>cell(o,p));},
  async bricksTexture(o={}){return generate('bricksTexture',14,o,['mortar','stagger','bevel'],p=>({values:[p.scalar(o.stagger,.5,'stagger',0,1),p.scalar(o.mortar,.05,'mortar',0,.5),p.scalar(o.bevel,.03,'bevel',0,.5)]}));},
  async hexagonTexture(o={}){return generate('hexagonTexture',15,o,['groutWidth','softness'],p=>({values:[1,p.scalar(o.groutWidth,.03,'groutWidth',0,.5),p.scalar(o.softness,.03,'softness',0,.5)]}));},
  async truchetTexture(o={}){return generate('truchetTexture',16,o,['lineWidth','softness'],p=>tile(o,p));},
  async weaveTexture(o={}){return generate('weaveTexture',17,o,['lineWidth','softness'],p=>tile(o,p));},
  async juliaTexture(o={}){return generate('juliaTexture',18,o,['iterations','bailout','constant'],p=>orbit(o,p));},
  async mandelbrotTexture(o={}){return generate('mandelbrotTexture',19,o,['iterations','bailout'],p=>orbit(o,p));},
 };
 return {...f,over:rasterFilters(g,context,track,outer).over};
});}
