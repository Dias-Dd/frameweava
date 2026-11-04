import type {CreationColor,StaticCreationColor} from './colors.ts';
import {creationColor} from './colors.ts';
import {createFeedbackParticles,createNativeParticleRenderer} from '../spatial-effects/native.ts';
import type {FeedbackParticleOptions,FeedbackParticles,ParticleStyle,ParticleForce,Vec3,NativeSpriteAtlas} from '../spatial-effects/native.ts';
import type {NativeParticleOptions} from '../spatial-effects/src/native-particles.ts';
import type {Signal} from '../../src/core/types.ts';
import {seededRandom} from '../../src/core/time.ts';
import {linear709} from '../../src/media/surface.ts';
import type {CreationInit,CreationOptions,CameraOptions,AnimatedVec3,CreationImageResource} from './types.ts';
import {creationStage,validateCreation,scalar,vector,requireInput,fail} from './lifecycle.ts';
import {assetOptions,assetNumber,assetVector,assetError} from './physics-assets.ts';
import {fieldEmitter,type FieldEmitter} from './particle-emitter.ts';
import {fieldSprite,type FieldSprite} from './particle-sprites.ts';
import {particleRecipe,type ParticleFieldKind} from './particle-recipes.ts';
export type {FieldEmitter,FieldSprite};

export interface FieldAtlas {
 image:string|CreationImageResource;columns?:number;rows?:number;count?:number;
 sampling?:'nearest'|'linear';boundary?:'zero'|'clamp';frameBlending?:boolean;
}
export interface ParticleFieldOptions extends CreationOptions,CameraOptions {
 emitter?:FieldEmitter;position?:Vec3;velocity?:Vec3;scatter?:number|Vec3;
 /** Immutable birth history, in seconds and particles/second. */
 initialCount?:number;rate?:number;lifetime?:number;
 gravity?:number|Vec3;wind?:Vec3;drag?:number;
 turbulence?:number|{strength:number;frequency?:number;seed?:number;motion?:Vec3};
 vortex?:number|{strength:number;center?:Vec3;axis?:Vec3;softening?:number};
 attraction?:number|{strength:number;center?:Vec3;softening?:number};
 floor?:false|number;bounce?:number;friction?:number;
 /** Appearance at the requested frame. Radius is in meters and does not change collision radius. */
 color?:CreationColor;opacity?:Signal<number>;radius?:Signal<number>;
 palette?:readonly StaticCreationColor[];sizeVariation?:number;opacityVariation?:number;
 trails?:number;trailOpacity?:Signal<number>;trailWidth?:Signal<number>;
 sprite?:FieldSprite|FieldAtlas;spriteResolution?:number;backgroundInput?:string;
 style?:Omit<ParticleStyle,'ink'>&{ink?:CreationColor};
 simulation?:Partial<Omit<FeedbackParticleOptions,'fps'>>;
 render?:Pick<NativeParticleOptions,'tileSize'|'maxBufferBytes'|'maxWork'|'sort'>;
}
const keys=['emitter','position','velocity','scatter','initialCount','rate','lifetime','gravity','wind','drag','turbulence','vortex','attraction','floor','bounce','friction','color','opacity','radius','palette','sizeVariation','opacityVariation','trails','trailOpacity','trailWidth','sprite','spriteResolution','backgroundInput','style','simulation','render','camera'];
function integer(n:number,name:string,min=0){assetNumber(n,name,min);if(!Number.isSafeInteger(n))assetError(name+' must be a safe integer');return n;}
function atlasCheck(sprite:ParticleFieldOptions['sprite']){
 if(sprite===undefined)return;if(typeof sprite==='string'){if(!['disc','ring','star','petal','confetti'].includes(sprite))assetError('Unknown particle sprite');return;}
 assetOptions(sprite,['image','columns','rows','count','sampling','boundary','frameBlending'],'particle atlas');
 if(typeof sprite.image==='string'){if(!sprite.image)assetError('Atlas input name must not be empty');}
 else{const image=sprite.image;assetOptions(image,['resource','size','decode','missingProfile'],'particle atlas resource');if(typeof image.resource!=='string'||!image.resource||!Array.isArray(image.size)||image.size.length!==2)assetError('Atlas resource needs a declared ID and width/height');image.size.forEach(n=>integer(n,'atlas source dimension',1));if(image.decode!==undefined&&!['icc-sdr','surface-v2'].includes(image.decode))assetError('Unknown atlas decode profile');if(image.missingProfile!==undefined&&!['error','assume-srgb'].includes(image.missingProfile))assetError('Unknown missing-profile policy');}
 for(const k of ['columns','rows','count'] as const)if(sprite[k]!==undefined)integer(sprite[k],k,1);
 if(sprite.sampling!==undefined&&!['nearest','linear'].includes(sprite.sampling)||sprite.boundary!==undefined&&!['zero','clamp'].includes(sprite.boundary)||sprite.frameBlending!==undefined&&typeof sprite.frameBlending!=='boolean')assetError('Invalid atlas sampling, boundary or frame blending');
}
/** @internal Recipe resolution is pure author-data preparation, not another scheduler. */
export function resolveParticleField(kind:ParticleFieldKind,o:ParticleFieldOptions,aspect=16/9,seed=1){
 const actualSeed=o.simulation?.seed??seed;if(!Number.isInteger(actualSeed)||actualSeed<0||actualSeed>0xffffffff)assetError('Particle seed must be uint32');
 const preset=particleRecipe(kind,aspect,actualSeed),simulation={...preset.simulation,...o.simulation},forces:ParticleForce[]=[...simulation.forces??[]];
 const replace=(kind:ParticleForce['kind'],value?:ParticleForce)=>{for(let i=forces.length-1;i>=0;i--)if(forces[i].kind===kind)forces.splice(i,1);if(value)forces.push(value);};
 if(o.initialCount!==undefined)simulation.bursts=[{time:0,count:integer(o.initialCount,'initialCount')}];
 if(o.rate!==undefined)simulation.rate=assetNumber(o.rate,'rate',0);if(o.lifetime!==undefined)simulation.lifetime=assetNumber(o.lifetime,'lifetime',Number.MIN_VALUE);
 if(o.position)simulation.origin=assetVector(o.position,'position');if(o.velocity)simulation.velocity=assetVector(o.velocity,'velocity');
 if(o.scatter!==undefined)simulation.velocityJitter=typeof o.scatter==='number'?Array(3).fill(assetNumber(o.scatter,'scatter',0)) as Vec3:assetVector(o.scatter,'scatter',0);
 if(o.gravity!==undefined)replace('acceleration',{kind:'acceleration',value:typeof o.gravity==='number'?[0,-assetNumber(o.gravity,'gravity'),0]:assetVector(o.gravity,'gravity')});
 if(o.wind!==undefined)forces.push({kind:'acceleration',value:assetVector(o.wind,'wind acceleration')});
 if(o.drag!==undefined)replace('drag',{kind:'drag',coefficient:assetNumber(o.drag,'drag',0)});
 if(o.turbulence!==undefined){const t=typeof o.turbulence==='number'?{strength:o.turbulence}:o.turbulence;assetOptions(t,['strength','frequency','seed','motion'],'turbulence');const strength=assetNumber(t.strength,'turbulence strength');replace('curl',strength?{kind:'curl',strength,noise:{seed:t.seed??simulation.seed??seed,frequency:assetNumber(t.frequency??.6,'noise frequency',0)},motion:assetVector(t.motion??[0,0,0],'noise motion')}:undefined);}
 if(o.vortex!==undefined){const v=typeof o.vortex==='number'?{strength:o.vortex}:o.vortex;assetOptions(v,['strength','center','axis','softening'],'vortex');const strength=assetNumber(v.strength,'vortex strength');replace('vortex',strength?{kind:'vortex',strength,center:assetVector(v.center??[0,0,0],'vortex center'),axis:assetVector(v.axis??[0,0,1],'vortex axis'),softening:assetNumber(v.softening??.35,'vortex softening',Number.MIN_VALUE)}:undefined);}
 if(o.attraction!==undefined){const a=typeof o.attraction==='number'?{strength:o.attraction}:o.attraction;assetOptions(a,['strength','center','softening'],'attraction');const strength=assetNumber(a.strength,'attraction strength');replace('attractor',strength?{kind:'attractor',strength,center:assetVector(a.center??[0,0,0],'attraction center'),softening:assetNumber(a.softening??.4,'attraction softening',Number.MIN_VALUE)}:undefined);}
 simulation.forces=forces;
 if(o.floor!==undefined)simulation.colliders=[...(simulation.colliders??[]).filter(c=>c.id!=='creation.floor'),...o.floor===false?[]:[{kind:'plane' as const,id:'creation.floor',normal:[0,1,0] as Vec3,offset:assetNumber(o.floor,'floor'),restitution:assetNumber(o.bounce??.6,'bounce',0,1),friction:assetNumber(o.friction??.25,'friction',0,1)}]];
 if(o.trails!==undefined)simulation.trailPoints=integer(o.trails,'trails');
 const palette=o.palette??preset.palette,sizeVariation=assetNumber(o.sizeVariation??preset.sizeVariation,'sizeVariation',0,1),opacityVariation=assetNumber(o.opacityVariation??preset.opacityVariation,'opacityVariation',0,1),emitter=fieldEmitter(o.emitter??preset.emitter,palette,opacityVariation),style={...preset.style,...o.style};
 if(o.opacity!==undefined)style.opacity=o.opacity;if(o.trailOpacity!==undefined)style.trailOpacity=o.trailOpacity;if(o.trailWidth!==undefined)style.trailWidth=o.trailWidth;
 const sprite=o.sprite??preset.sprite;atlasCheck(sprite);
 return {simulation,style,palette,emitter,sizeVariation,sprite,kind};
}
async function createField(init:CreationInit,options:ParticleFieldOptions,kind:ParticleFieldKind){
 validateCreation(init,options,keys);const {post,signal,...raw}=options;let o:typeof raw;try{o=structuredClone(raw);}catch{assetError('Particle fields require serializable configuration and Core Signals');}
 const plan=resolveParticleField(kind,o,init.width/init.height,init.seed),format=o.format??'rgba32float',builtin=typeof plan.sprite==='string'?await fieldSprite(init,plan.sprite,o.spriteResolution??64,format):undefined;
 const renderer=createNativeParticleRenderer(init.gpu,{width:init.width,height:init.height,camera:o.camera??{projection:'orthographic',position:[0,0,5],target:[0,0,0],viewHeight:3.5,near:.01,far:40},format,...o.render});let simulation:FeedbackParticles|undefined,fps:string|undefined;
 try{return creationStage(init,{...o,post,signal},async(c,inputs)=>{
  const key=JSON.stringify(c.fps);if(fps!==undefined&&fps!==key)fail('Particle simulation FPS changed; reopen this instance','E_CREATION_TIME');
  simulation??=createFeedbackParticles({...plan.simulation,fps:c.fps,seed:plan.simulation.seed??init.seed},{emitter:plan.emitter});fps=key;
  const frame=simulation.sample(c),radius=o.radius===undefined?undefined:scalar(o.radius,c,'particle radius',0),appearance={...frame,particles:frame.particles.map(p=>({...p,radius:(radius??p.radius)*(1+(seededRandom(frame.seed,p.id,'creation-radius')*2-1)*plan.sizeVariation)}))};
  let atlasImage:import('../gpu-effects/pixel-types.ts').GpuPixelImage|undefined;try{
   let spriteAtlas:NativeSpriteAtlas|undefined;
   if(builtin){atlasImage=await builtin.render();spriteAtlas={source:atlasImage,columns:1,rows:1,boundary:'zero',sampling:'linear'};}
   else if(typeof plan.sprite!=='string'){const {image,...atlas}=plan.sprite;const source=typeof image==='string'?requireInput(inputs,image):atlasImage=await init.gpu.importResource({version:1,id:image.resource,decode:image.decode??'icc-sdr',missingProfile:image.missingProfile??'error',output:{width:image.size[0],height:image.size[1],format,alpha:'premultiplied',color:linear709}},{signal});spriteAtlas={...atlas,source,columns:atlas.columns??1,rows:atlas.rows??1};}
   return await renderer.render(appearance,c,{...plan.style,ink:creationColor(o.color??o.style?.ink??plan.style.ink??[1,1,1],c,'particle color')},{background:o.backgroundInput?requireInput(inputs,o.backgroundInput):undefined,spriteAtlas,signal});
  }finally{if(atlasImage)await init.gpu.release(atlasImage);}
 },async()=>{simulation=undefined;renderer.dispose();await builtin?.dispose();},()=>({kind:'particle-field',preset:kind,execution:'CPU Core fixed step; original Native GPU raster',checkpoints:simulation?.checkpointSteps??[],sprite:typeof plan.sprite==='string'?plan.sprite:'borrowed/imported atlas',renderer:renderer.stats()}));}catch(error){renderer.dispose();await builtin?.dispose();throw error;}
}
export function particleField(init:CreationInit,o:ParticleFieldOptions={}){return createField(init,o,'field');}
export function snowField(init:CreationInit,o:ParticleFieldOptions={}){return createField(init,o,'snow');}
export function sparkField(init:CreationInit,o:ParticleFieldOptions={}){return createField(init,o,'sparks');}
export function bubbleField(init:CreationInit,o:ParticleFieldOptions={}){return createField(init,o,'bubbles');}
export function fireflyField(init:CreationInit,o:ParticleFieldOptions={}){return createField(init,o,'fireflies');}
export function dustField(init:CreationInit,o:ParticleFieldOptions={}){return createField(init,o,'dust');}
export function confettiField(init:CreationInit,o:ParticleFieldOptions={}){return createField(init,o,'confetti');}
export function energyField(init:CreationInit,o:ParticleFieldOptions={}){return createField(init,o,'energy');}
export function starField(init:CreationInit,o:ParticleFieldOptions={}){return createField(init,o,'stars');}
export function petalField(init:CreationInit,o:ParticleFieldOptions={}){return createField(init,o,'petals');}
