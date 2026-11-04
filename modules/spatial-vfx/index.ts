import {evaluate} from '../../src/core/animation.ts';import {assertJson,checkSignals} from '../../src/core/graph.ts';import {linear709} from '../../src/media/surface.ts';
import type {GpuPixelScope,GpuPixelKernel,GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import type * as T from './types.ts';import {kernels} from './shaders.ts';
export type * from './types.ts';
type Spec={keys:Record<string,[number,number,number,number,boolean?]>;cost:(p:Float32Array,u:Uint32Array)=>number;ink:[number,number,number];density:number};
const common=['width','height','format','color','exposure','opacity','time','seed','camera','steps','epsilon','rotation','density','maxWork','signal'];
const specs:Record<string,Spec>={
 mandelbulb:{keys:{power:[26,8,2,12],iterations:[27,8,1,24,true]},cost:(_p,u)=>u[23]*u[27]*16,ink:[.25,.65,1],density:1},
 mengerSponge:{keys:{levels:[26,3,1,7,true]},cost:(_p,u)=>u[23]*u[26]*8,ink:[1,.55,.18],density:1},
 gyroidSurface:{keys:{frequency:[26,3.2,.01,128],thickness:[27,.15,.001,3]},cost:(_p,u)=>u[23]*12,ink:[.4,1,.65],density:1},
 voronoiCrystal:{keys:{facets:[26,18,1,128,true]},cost:(_p,u)=>u[23]*u[26]*8,ink:[.55,.3,1],density:1},
 terrainRaymarch:{keys:{frequency:[26,.8,.001,32],amplitude:[27,.8,0,10],octaves:[28,4,1,8,true]},cost:(_p,u)=>u[23]*u[28]*32,ink:[.3,.55,.2],density:1},
 metaballVolume:{keys:{radius:[26,.85,.01,4],separation:[27,.65,0,2]},cost:(_p,u)=>u[23]*24,ink:[.2,.7,1],density:1.5},
 planetAtmosphere:{keys:{planetRadius:[26,1,.1,10],thickness:[27,.4,.01,3],anisotropy:[28,.4,-.9,.9],scaleHeight:[29,.3,.01,1],sunStrength:[30,8,0,128]},cost:(_p,u)=>u[23]*32,ink:[.25,.5,1],density:1.5},
 heightFog:{keys:{distance:[26,8,0,1000],falloff:[27,.5,0,10],baseHeight:[28,-1,-100,100]},cost:(_p,u)=>u[23]*8,ink:[.3,.5,.8],density:.25},
 volumetricSpotlight:{keys:{length:[26,3,.01,3.5],angle:[27,.35,.01,1],anisotropy:[28,.25,-.9,.9]},cost:(_p,u)=>u[23]*16,ink:[.6,.8,1],density:1},
 smokePlume:{keys:{plumeRadius:[26,.65,.01,2],frequency:[27,2,.01,16],octaves:[28,4,1,8,true]},cost:(_p,u)=>u[23]*u[28]*32,ink:[.6,.65,.7],density:2},
 flameVolume:{keys:{plumeRadius:[26,.7,.01,2],frequency:[27,2.5,.01,16],octaves:[28,4,1,8,true],heat:[29,5,0,128]},cost:(_p,u)=>u[23]*u[28]*32,ink:[1,1,1],density:2},
 waterCaustics:{keys:{frequency:[26,3,.01,100],choppiness:[27,.45,0,2],focus:[28,.08,.001,1]},cost:()=>32,ink:[.15,.6,1],density:1},
 starfield:{keys:{cellScale:[26,1,.01,32],starRadius:[27,.035,.001,.5],starDensity:[28,.4,0,1]},cost:(_p,u)=>u[23]*32,ink:[.7,.85,1],density:1},
 orbitalTrails:{keys:{orbits:[26,6,1,128,true],eccentricity:[27,.4,0,.8],period:[28,4,.01,10000],trailDuration:[29,1.5,.001,1000],radius:[30,.012,.001,.5],occluderRadius:[31,0,0,1000]},cost:(_p,u)=>u[23]*u[26]*16,ink:[1,.6,.18],density:1},
 gravitationalLensing:{keys:{einsteinRadius:[28,.15,0,2],occluderRadius:[29,.035,0,1]},cost:()=>16,ink:[1,1,1],density:1},
};
function fail(code:string,message:string):never{throw Object.assign(new Error(message),{code:'E_SPATIAL_VFX_'+code});}
function object(value:unknown,keys:string[],name:string):Record<string,any>{if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('PARAMETER',name+' must be plain data');for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(typeof key!=='string'||!keys.includes(key)||!d.enumerable||!('value'in d))fail('PARAMETER',name+' has unknown/accessor fields');}return value as Record<string,any>;}
function numeric(value:unknown,name:string,min=-Number.MAX_VALUE,max=Number.MAX_VALUE){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||!Number.isFinite(Math.fround(value))||value!==0&&Math.fround(value)===0)fail('PARAMETER',name+' outside its finite F32 qualified range');return value;}
function integer(v:unknown,name:string,min:number,max=0xffffffff){const n=numeric(v,name,min,max);if(!Number.isSafeInteger(n))fail('PARAMETER',name+' must be an integer');return n;}
function vector(v:unknown,name:string):[number,number,number]{if(!Array.isArray(v)||v.length!==3||Reflect.ownKeys(v).length!==4)fail('PARAMETER',name+' requires XYZ');for(let i=0;i<3;i++)if(!Object.getOwnPropertyDescriptor(v,String(i))||!('value'in Object.getOwnPropertyDescriptor(v,String(i))!))fail('PARAMETER','Vector accessor');return v.map(x=>numeric(x,name,-1e6,1e6)) as [number,number,number];}
function unit(v:number[]){const scale=Math.max(...v.map(Math.abs));if(scale===0)fail('CAMERA','Camera basis is degenerate');const a=v.map(x=>x/scale),n=Math.hypot(...a);return a.map(x=>x/n);}
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function prepare(name:string,context:T.SpatialVfxContext,options:T.SpatialVfxOptions,input?:GpuPixelImage){
 const spec=specs[name];if(!spec)fail('CONTRACT','Unknown fixed effect');const o=object(options,[...common,...Object.keys(spec.keys),...(name==='gravitationalLensing'?['center']:[])],'effect options'),{signal,...data}=o;assertJson(data);checkSignals(data);
 const c=object(context,['frame','time','fps','globalFrame','globalTime','dt','seed','durationInFrames','progress'],'FrameContext'),fps=object(c.fps,['num','den'],'fps'),num=integer(fps.num,'fps.num',1,Number.MAX_SAFE_INTEGER),den=integer(fps.den,'fps.den',1,Number.MAX_SAFE_INTEGER),time=numeric(c.time,'time'),frame=numeric(c.frame,'frame');if(Math.abs(time-frame*den/num)>1e-9*Math.max(1,Math.abs(time)))fail('TIME','FrameContext local time disagrees with frame/fps');
 const width=integer(o.width??input?.info.width??640,'width',1,16384),height=integer(o.height??input?.info.height??360,'height',1,16384),format=o.format??input?.info.format??'rgba32float';if(!['rgba16float','rgba32float'].includes(format))fail('PARAMETER','Output format must be F16/F32');if(input){if(width!==input.info.width||height!==input.info.height)fail('LAYOUT','Image operators preserve input dimensions');if(!['premultiplied','opaque'].includes(input.info.alpha))fail('ALPHA','Associate straight input explicitly before this spatial operator');const color=input.info.color;if(color.transfer!=='linear'||color.reference!=='scene'||color.primaries!=='rec709'||color.whitePoint!=='D65')fail('COLOR','Explicit scene-linear Rec709/D65 input required');}
 if(signal!==undefined&&!(signal instanceof AbortSignal))fail('PARAMETER','Expected local AbortSignal');if(signal?.aborted)throw Object.assign(new Error('Spatial VFX cancelled before recording'),{code:'E_RENDER_CANCELLED'});
 const values=new Float32Array(40),words=new Uint32Array(values.buffer);const scalar=(v:unknown,d:number,n:string,min:number,max:number)=>numeric(evaluate(v??d,context),n,min,max);
 values[0]=scalar(o.time,time,'time',-Number.MAX_VALUE,Number.MAX_VALUE);values[1]=scalar(o.exposure,1,'exposure',0,128);values[5]=scalar(o.opacity,1,'opacity',0,1);values[6]=scalar(o.density,spec.density,'density',0,128);values[7]=numeric(o.epsilon??.002,'epsilon',1e-6,.1);values[25]=scalar(o.rotation,['heightFog','gravitationalLensing','waterCaustics','starfield','orbitalTrails','planetAtmosphere'].includes(name)?0:time*.2,'rotation',-Number.MAX_VALUE,Number.MAX_VALUE);
 const ink=vector(evaluate(o.color??spec.ink,context),'color');ink.forEach((v,i)=>values[2+i]=numeric(v,'color',0,128));words[23]=integer(o.steps??(name==='terrainRaymarch'?512:48),'steps',1,65536);words[24]=integer(o.seed??c.seed,'seed',0);
 const camera=object(o.camera??{},['position','target','up','verticalFov','near','far'],'camera'),position=vector(camera.position??[3,2,4],'position'),target=vector(camera.target??[0,0,0],'target'),up=vector(camera.up??[0,1,0],'up'),forward=unit(target.map((v,i)=>v-position[i])),right=unit(cross(forward,unit(up))),actualUp=cross(right,forward);values.set(position,8);values.set(forward,12);values.set(right,16);values.set(actualUp,20);values[11]=Math.tan(numeric(camera.verticalFov??45,'FOV',1,160)*Math.PI/360);values[19]=numeric(camera.near??.01,'near',.000001,1000);values[15]=numeric(camera.far??20,'far',values[19]+.000001,10000);
 for(const [key,[index,d,min,max,isInteger]]of Object.entries(spec.keys)){const v=numeric(o[key]??d,key,min,max);if(isInteger)words[index]=integer(v,key,min,max);else values[index]=v;}
 if(name==='gravitationalLensing'){const center=o.center??[.5,.5];if(!Array.isArray(center)||center.length!==2)fail('PARAMETER','center needs UV');values[26]=numeric(center[0],'center.u',-2,2);values[27]=numeric(center[1],'center.v',-2,2);}
 if(['terrainRaymarch','smokePlume','flameVolume'].includes(name)){const frequency=name==='terrainRaymarch'?values[26]:values[27],bound=(Math.max(...position.map(Math.abs))+values[15]+Math.abs(values[0])*2)*frequency*2**words[28];if(bound>2**20)fail('RANGE','Requested noise-coordinate domain exceeds this F32 hash/lattice qualification; reduce frequency/octaves or use a local time address explicitly');}
 const units=width*height*spec.cost(values,words),maxWork=integer(o.maxWork??16e9,'maxWork',1,Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(units)||units>maxWork)fail('BUDGET','Complete requested pixel/step work exceeds maxWork; no automatic resolution or quality reduction');return {parameters:words,output:{width,height,format:format as 'rgba16float'|'rgba32float',alpha:'premultiplied' as const,color:linear709},signal,workUnits:units};
}
const cache=new WeakMap<GpuPixelScope,Map<string,Promise<GpuPixelKernel>>>();
async function invoke(name:string,scope:GpuPixelScope,context:T.SpatialVfxContext,options:T.SpatialVfxOptions,input?:GpuPixelImage){const p=prepare(name,context,options,input);let entries=cache.get(scope);if(!entries){entries=new Map();cache.set(scope,entries);}let kernel=entries.get(name);if(!kernel){kernel=scope.compile({abiVersion:1,id:'frameweave/spatial-vfx/'+name,version:name==='orbitalTrails'?'0.2.0':'0.1.2',inputCount:input?1:0,parameterWords:40,code:kernels[name]});entries.set(name,kernel);}return scope.run(await kernel,input?[input]:[],{parameters:p.parameters,output:p.output,signal:p.signal});}
export function mandelbulb(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.MandelbulbOptions={}){return invoke('mandelbulb',g,c,o);}
export function mengerSponge(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.MengerSpongeOptions={}){return invoke('mengerSponge',g,c,o);}
export function gyroidSurface(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.GyroidSurfaceOptions={}){return invoke('gyroidSurface',g,c,o);}
export function voronoiCrystal(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.VoronoiCrystalOptions={}){return invoke('voronoiCrystal',g,c,o);}
export function terrainRaymarch(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.TerrainRaymarchOptions={}){return invoke('terrainRaymarch',g,c,o);}
export function metaballVolume(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.MetaballVolumeOptions={}){return invoke('metaballVolume',g,c,o);}
export function planetAtmosphere(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.PlanetAtmosphereOptions={}){return invoke('planetAtmosphere',g,c,o);}
export function heightFog(g:GpuPixelScope,input:GpuPixelImage,c:T.SpatialVfxContext,o:T.HeightFogOptions={}){return invoke('heightFog',g,c,o,input);}
export function volumetricSpotlight(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.VolumetricSpotlightOptions={}){return invoke('volumetricSpotlight',g,c,o);}
export function smokePlume(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.SmokePlumeOptions={}){return invoke('smokePlume',g,c,o);}
export function flameVolume(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.FlameVolumeOptions={}){return invoke('flameVolume',g,c,o);}
export function waterCaustics(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.WaterCausticsOptions={}){return invoke('waterCaustics',g,c,o);}
export function starfield(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.StarfieldOptions={}){return invoke('starfield',g,c,o);}
export function orbitalTrails(g:GpuPixelScope,c:T.SpatialVfxContext,o:T.OrbitalTrailsOptions={}){return invoke('orbitalTrails',g,c,o);}
export function gravitationalLensing(g:GpuPixelScope,input:GpuPixelImage,c:T.SpatialVfxContext,o:T.GravitationalLensingOptions={}){return invoke('gravitationalLensing',g,c,o,input);}
