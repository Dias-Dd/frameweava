import {keyframes} from '../../../src/core/animation.ts';
import type {NativeTextureFilters,TextureOptions} from './types.ts';
import {nativeTextureNames} from './types.ts';
export type TextureName=typeof nativeTextureNames[number];
export const textureEvolution=keyframes([{frame:0,value:.23},{frame:239,value:1.37}]);
export function fixtureOptions(frame:number,wide=false):TextureOptions{return {scale:[3.7,4.3],offset:[-.3,.7],rotation:17,evolution:textureEvolution,seed:0xf1234567,opacity:[0,.375,1][Math.floor(frame/2)%3],low:wide?[-17,28,-4]:[-.2,.1,.05],high:wide?[300,-40,120]:[2.5,.7,1.3]};}
export function callTexture(name:TextureName,f:NativeTextureFilters,frame:number,wide=false,format:'rgba16float'|'rgba32float'='rgba32float'){const o={...fixtureOptions(frame,wide),format},fractal={octaves:3,lacunarity:1.8,gain:.55};switch(name){
 case 'fractalNoise':return f.fractalNoise({...o,...fractal});
 case 'turbulentNoise':return f.turbulentNoise({...o,...fractal});
 case 'ridgedNoise':return f.ridgedNoise({...o,...fractal});
 case 'curlTexture':return f.curlTexture(o);
 case 'domainWarpTexture':return f.domainWarpTexture({...o,...fractal,warp:1.3});
 case 'gaborTexture':return f.gaborTexture({...o,frequency:2.3,bandwidth:2.1,impulses:2});
 case 'cellularTexture':return f.cellularTexture({...o,jitter:.8});
 case 'voronoiEdges':return f.voronoiEdges({...o,jitter:.8,edgeWidth:.15});
 case 'crackleTexture':return f.crackleTexture({...o,jitter:.8});
 case 'marbleTexture':return f.marbleTexture({...o,...fractal,frequency:1.3,warp:.8});
 case 'woodTexture':return f.woodTexture({...o,...fractal,frequency:2.3,warp:.4});
 case 'graniteTexture':return f.graniteTexture({...o,...fractal});
 case 'cloudsTexture':return f.cloudsTexture({...o,...fractal});
 case 'causticsTexture':return f.causticsTexture({...o,jitter:.8,edgeWidth:.15});
 case 'bricksTexture':return f.bricksTexture({...o,mortar:.07,stagger:.4,bevel:.06});
 case 'hexagonTexture':return f.hexagonTexture({...o,groutWidth:.07});
 case 'truchetTexture':return f.truchetTexture({...o,lineWidth:.1,softness:.05});
 case 'weaveTexture':return f.weaveTexture({...o,lineWidth:.23,softness:.05});
 case 'juliaTexture':return f.juliaTexture({...o,iterations:20,constant:[-.73,.17]});
 case 'mandelbrotTexture':return f.mandelbrotTexture({...o,iterations:20});
}}
