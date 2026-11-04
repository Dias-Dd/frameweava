import type {NoiseOptions} from '../../src/noise.ts';
export const noiseCases:{dimensions:2|3;noise:NoiseOptions;format:'rgba16float'|'rgba32float'}[]=[];
const add=(dimensions:2|3,noise:NoiseOptions,format:'rgba16float'|'rgba32float'='rgba32float')=>noiseCases.push({dimensions,noise:{seed:17,frequency:.125,...noise},format});
for(const dimensions of [2,3] as const){
 for(const algorithm of ['openSimplex2','openSimplex2S','cellular','perlin','valueCubic','value'] as const)add(dimensions,{algorithm});
 for(const kind of ['fbm','ridged','pingPong'] as const)add(dimensions,{algorithm:'openSimplex2S',fractal:{kind,octaves:4,weightedStrength:.4}});
 for(const kind of ['openSimplex2','openSimplex2Reduced','basicGrid'] as const)for(const mode of ['single','progressive','independent'] as const)add(dimensions,{algorithm:'perlin',warp:{kind,mode,amplitude:3,octaves:3}});
 for(const distance of ['euclidean','euclideanSq','manhattan','hybrid'] as const)for(const returnType of ['cellValue','distance','distance2','distance2Add','distance2Sub','distance2Mul','distance2Div'] as const)add(dimensions,{algorithm:'cellular',cellular:{distance,returnType}});
 for(const rotation3D of ['improveXY','improveXZ'] as const)add(dimensions,{rotation3D,algorithm:'openSimplex2'});
 add(dimensions,{algorithm:'value',fractal:{kind:'fbm',octaves:3}},'rgba16float');
}
export const noiseStyle={origin:[-.75,-.5,.375] as [number,number,number],stepX:[.25,.03125,0] as [number,number,number],stepY:[0,.1875,.0625] as [number,number,number],motion:[.125,0,.25] as [number,number,number],ink:[2,-.5,1] as [number,number,number],base:[-.25,.125,.5] as [number,number,number],alpha:.375,gain:1.25,bias:.125};
