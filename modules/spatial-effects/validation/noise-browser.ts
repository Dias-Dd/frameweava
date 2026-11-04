import {createNoiseTextureRenderer} from '../src/noise-renderer.ts';
import {createNoise,type NoiseAlgorithm,type NoiseFractal,type NoiseOptions} from '../src/noise.ts';
import {pixelsFromSurface} from '../../../src/media/surface.ts';
import type {FrameContext} from '../../../src/core/types.ts';
const ctx:FrameContext={frame:12,time:.5,globalFrame:12,globalTime:.5,dt:1/24,progress:.5,fps:{num:24,den:1},durationInFrames:25,seed:51};
export async function noiseGpuChecks(){
  const width=16,height=8,owner=createNoiseTextureRenderer({width,height});const rows:Record<string,unknown>[]=[];let maximumError=0,maximumHalfError=0;
  try{
    for(const algorithm of ['openSimplex2','openSimplex2S','cellular','perlin','valueCubic','value'] as NoiseAlgorithm[])for(const kind of ['none','fbm','ridged','pingPong'] as NoiseFractal[])for(const dimensions of [2,3] as const){
      const noise={algorithm,seed:-51,frequency:.73,fractal:{kind,octaves:4}},opts={noise,dimensions,origin:[.13,-2.17,3.81] as [number,number,number],stepX:[.073,.001,0] as [number,number,number],stepY:[0,.051,.001] as [number,number,number]};
      const gpu=pixelsFromSurface(await owner.render(opts,ctx)),reference=createNoise(noise);let error=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=opts.origin.map((v,i)=>Math.fround(v)+Math.fround(opts.stepX[i])*x+Math.fround(opts.stepY[i])*y) as [number,number,number],value=dimensions===2?reference.sample2([p[0],p[1]]):reference.sample3(p);error=Math.max(error,Math.abs(gpu[(y*width+x)*4]-value));if(gpu[(y*width+x)*4+3]!==1)throw Error('Noise alpha must be1');}
      maximumError=Math.max(maximumError,error);rows.push({algorithm,kind,dimensions,error});
    }
    for(const mode of ['single','progressive','independent'] as const)for(const kind of ['openSimplex2','openSimplex2Reduced','basicGrid'] as const)for(const dimensions of [2,3] as const){
      const noise={algorithm:'perlin' as const,seed:51,frequency:.37,fractal:{kind:'fbm' as const,octaves:3},warp:{kind,mode,amplitude:2,frequency:.29,octaves:3}},opts={noise,dimensions,origin:[.71,-1.21,2.17] as [number,number,number],stepX:[.053,0,0] as [number,number,number],stepY:[0,.037,0] as [number,number,number]};
      const gpu=pixelsFromSurface(await owner.render(opts,ctx)),reference=createNoise(noise);let error=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=opts.origin.map((v,i)=>Math.fround(v)+Math.fround(opts.stepX[i])*x+Math.fround(opts.stepY[i])*y) as [number,number,number],value=dimensions===2?reference.sample2([p[0],p[1]]):reference.sample3(p);error=Math.max(error,Math.abs(gpu[(y*width+x)*4]-value));}maximumError=Math.max(maximumError,error);rows.push({mode,warp:kind,dimensions,error});
    }
    const extra:NoiseOptions[]=[];
    for(const rotation3D of ['improveXY','improveXZ'] as const)extra.push({algorithm:'openSimplex2',frequency:.37,rotation3D});
    for(const returnType of ['cellValue','distance2','distance2Add','distance2Sub','distance2Mul','distance2Div'] as const)extra.push({algorithm:'cellular',frequency:.37,cellular:{distance:'hybrid',returnType,jitter:.3}});
    for(const distance of ['euclidean','manhattan'] as const)extra.push({algorithm:'cellular',frequency:.37,cellular:{distance,returnType:'distance2Div',jitter:.7}});
    for(const seed of [-2147483648,2147483647,4294967295])extra.push({seed,algorithm:'openSimplex2S',frequency:.37,fractal:{kind:'fbm',octaves:4}});
    extra.push({seed:-51,algorithm:'perlin',frequency:.37,fractal:{kind:'fbm',octaves:4,gain:.7,lacunarity:1.8,weightedStrength:.6},warp:{seed:731,kind:'basicGrid',frequency:.13,amplitude:1.2,mode:'independent'}});
    for(const noise of extra){const opts={noise,dimensions:3 as const,origin:[.13,-.27,1.17] as [number,number,number],stepX:[.037,0,0] as [number,number,number],stepY:[0,.041,0] as [number,number,number]},gpu=pixelsFromSurface(await owner.render(opts,ctx)),reference=createNoise(noise);let error=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=opts.origin.map((v,i)=>Math.fround(v)+Math.fround(opts.stepX[i])*x+Math.fround(opts.stepY[i])*y) as [number,number,number];error=Math.max(error,Math.abs(gpu[(y*width+x)*4]-reference.sample3(p)));}maximumError=Math.max(maximumError,error);rows.push({special:noise,error});
    }
    if(maximumError>5e-4)throw Error('GPU/JS qualified fixture error '+maximumError+' exceeds5e-4');
    const opts={noise:{frequency:.37,algorithm:'perlin' as const},dimensions:3 as const,origin:[.1,.2,.3] as [number,number,number],ink:[-.2,8,2] as [number,number,number],base:[-.1,1,.5] as [number,number,number],alpha:.7};
    const full=pixelsFromSurface(await owner.render(opts,ctx)),half=pixelsFromSurface(await owner.render(opts,ctx,'rgba16float'));for(let i=0;i<full.length;i++)maximumHalfError=Math.max(maximumHalfError,Math.abs(full[i]-half[i]));
    if(!full.some(v=>v<0)||!full.some(v=>v>1)||maximumHalfError>.004)throw Error('Lost HDR/negative/half fidelity');
    const empty=pixelsFromSurface(await owner.render({...opts,alpha:0},ctx));if(!empty.every(v=>v===0))throw Error('Alpha0 is not canonical');
    await owner.dispose();const stats=owner.stats();if(stats.textures!==0||stats.geometries!==0||stats.programs!==0||stats.fencesCreated!==stats.fencesDestroyed)throw Error('Noise owner leaked');
    const errors=[];for(const mode of ['work','underflow','alpha','half'] as const){const fail=createNoiseTextureRenderer({width:16,height:8,maxSampleOperations:mode==='work'?1:256000000});try{let code='';try{await fail.render(mode==='underflow'?{stepX:[1e-300,0,0]}:mode==='alpha'?{alpha:2}:mode==='half'?{base:[1e6,0,0],gain:0}:{},ctx,mode==='half'?'rgba16float':'rgba32float');}catch(error){code=(error as {code:string}).code;}const expected={work:'E_SPATIAL_NOISE_BUDGET',underflow:'E_SPATIAL_GPU_RANGE',alpha:'E_SPATIAL_PARAMETER',half:'E_MEDIA_RANGE'}[mode];if(code!==expected)throw Error(`Expected ${expected}, got ${code}`);if(mode!=='half'&&fail.stats().draws!==0)throw Error('Rejected preflight submitted GPU draws');errors.push({mode,code,stats:fail.stats()});}finally{await fail.dispose();}}
    return {rows,maximumError,maximumHalfError,stats,errors};
  }finally{await owner.dispose();}
}
