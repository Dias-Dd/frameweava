import type {CreationColor,StaticCreationColor} from './colors.ts';
import {creationColor} from './colors.ts';
import {createFeedbackParticles,createNativeParticleRenderer} from '../spatial-effects/native.ts';
import type {FeedbackParticleOptions,ParticleStyle,FeedbackParticles,ParticleForce} from '../spatial-effects/native.ts';
import type {NativeParticleOptions} from '../spatial-effects/src/native-particles.ts';
import type {CreationInit,CreationOptions,CameraOptions,AnimatedVec3} from './types.ts';
import {creationStage,defaultCamera,requireInput,vector,fail,validateCreation} from './lifecycle.ts';

export interface ParticlesOptions extends CreationOptions,CameraOptions {
 /** Immutable history configuration. FPS/seed default to actual Stage context. */
 simulation?:Partial<Omit<FeedbackParticleOptions,'fps'>>;
 style?:Omit<ParticleStyle,'ink'>&{ink?:CreationColor};
 backgroundInput?:string;
 render?:Pick<NativeParticleOptions,'tileSize'|'maxBufferBytes'|'maxWork'|'sort'>;
}
/** Fixed-step CPU simulation + resident GPU raster, no CPU pixel fallback. */
export function particles(init:CreationInit,options:ParticlesOptions={}){
 validateCreation(init,options,['camera','simulation','style','backgroundInput','render']);
 const {post,signal,...rest}=options,o=structuredClone(rest),config={rate:90,lifetime:2,origin:[0,-.9,0],velocity:[0,1.8,0],velocityJitter:[.5,.4,.2],radius:.025,trailPoints:8,forces:[{kind:'acceleration',value:[0,-1.5,0]},{kind:'drag',coefficient:.25}],...o.simulation} as Omit<FeedbackParticleOptions,'fps'>;
 const renderer=createNativeParticleRenderer(init.gpu,{width:init.width,height:init.height,camera:o.camera??defaultCamera,format:o.format??'rgba32float',...o.render});let sim:FeedbackParticles|undefined,fps:string|undefined;
 return creationStage(init,{...o,post,signal},async(c,inputs)=>{const key=JSON.stringify(c.fps);if(fps!==undefined&&key!==fps)fail('Simulation FPS changed; create a new Stage instance','E_CREATION_TIME');sim??=createFeedbackParticles({...config,fps:c.fps,seed:config.seed??init.seed});fps=key;
  return renderer.render(sim.sample(c),c,{...o.style,ink:creationColor(o.style?.ink??[2.5,.65,.16],c,'particle ink')},{background:o.backgroundInput?requireInput(inputs,o.backgroundInput):undefined,signal});
 },()=>{sim?.reset();renderer.dispose();},()=>({kind:'particles',history:'Core FixedStepRunner',checkpointSteps:sim?.checkpointSteps??[],renderer:renderer.stats()}));
}
export interface BurstOptions extends ParticlesOptions {count?:number;at?:number}
export function particleBurst(init:CreationInit,{count=180,at=0,...o}:BurstOptions={}){return particles(init,{...o,simulation:{rate:0,lifetime:2,origin:[0,0,0],velocity:[0,.4,0],velocityJitter:[1.9,1.9,.6],bursts:[{time:at,count}],...o.simulation}});}
export function particleFountain(init:CreationInit,o:ParticlesOptions={}){return particles(init,{...o,simulation:{rate:120,lifetime:2.2,origin:[0,-1.1,0],velocity:[0,3.4,0],velocityJitter:[.9,.5,.25],forces:[{kind:'acceleration',value:[0,-3,0]},{kind:'drag',coefficient:.15}],colliders:[{kind:'plane',id:'floor',normal:[0,1,0],offset:-1.2,restitution:.55}],...o.simulation}});}
export function particleRain(init:CreationInit,o:ParticlesOptions={}){return particles(init,{...o,style:{ink:[.2,1.2,2.5],radiusScale:.65,trailOpacity:.45,...o.style},simulation:{rate:170,lifetime:1.7,origin:[0,1.4,0],positionJitter:[2.5,.15,.6],velocity:[-.5,-3.2,0],trailPoints:5,forces:[{kind:'acceleration',value:[0,-1,0]}],...o.simulation}});}
export function vortexParticles(init:CreationInit,o:ParticlesOptions={}){const forces:ParticleForce[]=[{kind:'vortex',center:[0,0,0],axis:[0,0,1],strength:2.2,softening:.35},{kind:'attractor',center:[0,0,0],strength:.15,softening:.4},{kind:'drag',coefficient:.2}];return particles(init,{...o,simulation:{rate:95,lifetime:3,origin:[1,0,0],velocity:[0,.4,0],positionJitter:[.1,.1,.2],forces,trailPoints:14,...o.simulation}});}
