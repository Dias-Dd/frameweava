import {defineMediaStage,linear709,type ProfessionalSurface} from '@frameweave/engine/native';
import {createFeedbackParticles,createParticleRenderer} from 'spatial-effects';
export default defineMediaStage<Record<string,never>,Record<string,never>,{surface:ProfessionalSurface;metrics:Record<string,any>}>(init=>{
  const simulation=createFeedbackParticles({fps:24,seed:init.seed,rate:45,lifetime:3,substeps:4,origin:[-2,-.1,0],positionJitter:[.1,.2,.2],velocity:[1.5,.2,0],velocityJitter:[.3,.4,.3],radius:.025,trailPoints:24,
    forces:[{kind:'curl',noise:{seed:init.seed,algorithm:'perlin',frequency:.8,fractal:{kind:'fbm',octaves:3}},strength:1.1,motion:[0,.05,.15]},{kind:'drag',coefficient:.05}]});
  const owner=createParticleRenderer({width:init.width,height:init.height,workingColor:linear709,viewHeight:4.5,chunkInstances:512});
  return {async renderAt(ctx){const sample=simulation.sample(ctx),cpuHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(sample))))].map(n=>n.toString(16).padStart(2,'0')).join(''),surface=await owner.render(sample,ctx,{ink:[4,.6,2],opacity:.85,trailOpacity:.45,trailWidth:.7});return {surface,metrics:{count:sample.particles.length,step:sample.step,curl:true,cpuHash,seed:init.seed,backend:owner.stats().backend}};},dispose:()=>owner.dispose()};
});
