import {EngineError} from '../../../src/core/errors.ts';import {seededRandom} from '../../../src/core/time.ts';import type {FrameContext} from '../../../src/core/types.ts';
import type {ProfessionalSurface} from '../../../src/media/surface.ts';
import {surfaceFromCoverage,type RasterOptions} from './coverage.ts';
export interface Particle {id:number;birthTime:number;age:number;lifetime:number;progress:number;x:number;y:number;vx:number;vy:number;radius:number;opacity:number}
export interface ParticleEmitterOptions {rate:number;lifetime:number;startTime?:number;duration?:number;seed?:number;maxParticles?:number;origin:readonly [number,number];positionJitter?:readonly [number,number];velocity:readonly [number,number];velocityJitter?:readonly [number,number];acceleration?:readonly [number,number];radius?:number}
const fail=(message:string):never=>{throw new EngineError('E_PA_PARTICLE',message);};
function number(v:number,name:string,min=-1e6,max=1e6){if(!Number.isFinite(v)||v<min||v>max)fail(`${name} must be finite [${min},${max}]`);return v;}
/** Birth-indexed analytic motion, reusing core seededRandom. No simulation state, replay, history or second runner. */
export function emitParticles(options:ParticleEmitterOptions,context:FrameContext):Particle[]{
 const time=number(context.time,'seconds'),rate=number(options.rate,'rate (particles/s)',0,10000),life=number(options.lifetime,'lifetime (s)',1e-6,1e6),start=number(options.startTime??0,'start (s)'),duration=options.duration===undefined?undefined:number(options.duration,'emission duration (s)',0,1e6),seed=options.seed??context.seed,max=options.maxParticles??2000,radius=number(options.radius??2,'radius (px)',0,256);
 if(!Number.isSafeInteger(seed)||!Number.isInteger(max)||max<1||max>4096)fail('Safe seed and maxParticles1..4096 required');
 const vector=(v:readonly [number,number],name:string,jitter=false)=>{if(v.length!==2)fail('A two-coordinate vector is required');return [number(v[0],name,jitter?0:-1e6),number(v[1],name,jitter?0:-1e6)] as const;};
 const origin=vector(options.origin,'origin'),velocity=vector(options.velocity,'velocity'),positionJitter=vector(options.positionJitter??[0,0],'position jitter',true),velocityJitter=vector(options.velocityJitter??[0,0],'velocity jitter',true),acceleration=vector(options.acceleration??[0,0],'acceleration');if(rate===0||time<start||duration===0)return [];
 const phase=(time-start)*rate,first=Math.max(0,Math.floor(phase-life*rate)+1),last=Math.min(Math.floor(phase),duration===undefined?Infinity:Math.ceil(duration*rate)-1);if(last-first+1>max)fail('Alive particle count exceeds explicit maxParticles; reduce rate/lifetime');if(!Number.isSafeInteger(last)||!Number.isSafeInteger(first))fail('Birth index exceeds exact numeric range');
 const particles:Particle[]=[];for(let id=first;id<=last;id++){const age=(phase-id)/rate;if(age<0||age>=life)continue;const random=(salt:number)=>seededRandom(seed,id,salt)*2-1,x0=origin[0]+random(0)*positionJitter[0],y0=origin[1]+random(1)*positionJitter[1],vx=velocity[0]+random(2)*velocityJitter[0],vy=velocity[1]+random(3)*velocityJitter[1];
  const x=x0+vx*age+.5*acceleration[0]*age*age,y=y0+vy*age+.5*acceleration[1]*age*age;if(!Number.isFinite(x)||!Number.isFinite(y))fail('Analytic position overflow');particles.push({id,birthTime:start+id/rate,age,lifetime:life,progress:age/life,x,y,vx:vx+acceleration[0]*age,vy:vy+acceleration[1]*age,radius,opacity:1});
 }return particles;
}
/** F32 coverage from subpixel disk samples, one HDR ink and source-over overlaps. No Canvas8 pixels. */
export function rasterizeParticles(particles:readonly Particle[],options:RasterOptions):ProfessionalSurface{
 const {width,height}=options,n=options.supersample??2;if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>4194304||![1,2,4].includes(n)||particles.length>4096)fail('Invalid dimensions/particle/supersampling budget');const coverage=new Float32Array(width*height);let work=0;
 for(const particle of particles){const x=number(particle.x,'x',-1e18,1e18),y=number(particle.y,'y',-1e18,1e18),r=number(particle.radius,'radius',0,256),opacity=number(particle.opacity,'opacity',0,1);if(r===0||opacity===0)continue;
  const x0=Math.max(0,Math.floor(x-r-.5)),x1=Math.min(width-1,Math.ceil(x+r+.5)),y0=Math.max(0,Math.floor(y-r-.5)),y1=Math.min(height-1,Math.ceil(y+r+.5));if(x1<x0||y1<y0)continue;work+=(x1-x0+1)*(y1-y0+1)*n*n;if(work>64000000)fail('Raster exceeds64M disk sub-samples');
  for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){let hits=0;for(let sy=0;sy<n;sy++)for(let sx=0;sx<n;sx++){const dx=xx-.5+(sx+.5)/n-x,dy=yy-.5+(sy+.5)/n-y;if(dx*dx+dy*dy<=r*r)hits++;}const a=hits/(n*n)*opacity,index=yy*width+xx;coverage[index]+=a*(1-coverage[index]);}
 }return surfaceFromCoverage(coverage,options);
}
