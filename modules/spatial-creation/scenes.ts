import {orbitalWorld,crystalSanctum,emberPlume,causticLagoon} from '../spatial-vfx/native.ts';
import type {OrbitalWorldOptions,CrystalSanctumOptions,EmberPlumeOptions,CausticLagoonOptions} from '../spatial-vfx/native.ts';
import {createNativeNoiseTextureRenderer} from '../spatial-effects/src/noise-native.ts';
import type {NoiseTextureOptions,NoiseTextureRendererOptions} from '../spatial-effects/src/noise-renderer.ts';
import type {CreationInit,CreationOptions} from './types.ts';
import {creationStage,validateCreation} from './lifecycle.ts';
type Scene<O>=Omit<O,'width'|'height'|'time'|'signal'>&CreationOptions;
function scene<O extends {format?:'rgba16float'|'rgba32float';seed?:number}>(init:CreationInit,o:O&CreationOptions,run:typeof orbitalWorld){validateCreation(init,o,['seed','camera','steps','maxWork','planet','stars','trails','lens','crystal','glow','smoke','fire','beam','water','fog']);const {post,signal,finish,...rest}=o,p=structuredClone(rest);return creationStage(init,{...o,finish},async c=>run(init.gpu,c,{...p,width:init.width,height:init.height,time:c.time,seed:p.seed??init.seed,signal}));}
export function orbitalScene(init:CreationInit,o:Scene<OrbitalWorldOptions>={}){return scene(init,o,orbitalWorld);}
export function crystalScene(init:CreationInit,o:Scene<CrystalSanctumOptions>={}){return scene(init,o,crystalSanctum as typeof orbitalWorld);}
export function emberScene(init:CreationInit,o:Scene<EmberPlumeOptions>={}){return scene(init,o,emberPlume as typeof orbitalWorld);}
export function lagoonScene(init:CreationInit,o:Scene<CausticLagoonOptions>={}){return scene(init,o,causticLagoon as typeof orbitalWorld);}
export interface NoiseCreationOptions extends NoiseTextureOptions,CreationOptions {budgets?:Pick<NoiseTextureRendererOptions,'maxBufferBytes'|'maxSampleOperations'>}
export async function noiseTexture(init:CreationInit,options:NoiseCreationOptions={}){validateCreation(init,options,['noise','dimensions','origin','stepX','stepY','motion','ink','base','alpha','gain','bias','budgets']);const {post,signal,format,finish,budgets,...source}=options,o=structuredClone(source),renderer=await createNativeNoiseTextureRenderer(init.gpu,{width:init.width,height:init.height,...budgets});
 return creationStage(init,{format,post,signal,finish},async c=>renderer.render({motion:[0,0,.4],dimensions:3,...o,noise:{seed:init.seed,frequency:.012,fractal:{kind:'fbm',octaves:3},...o.noise}},c,format),()=>renderer.dispose(),()=>({kind:'noise',renderer:renderer.stats()}));}
