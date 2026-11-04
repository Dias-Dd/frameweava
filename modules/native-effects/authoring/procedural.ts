import {EngineError} from '../../../src/core/errors.ts';
import {createNativeTextureEffects} from '../textures/index.ts';
import type {NativeTextureFilters} from '../textures/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {ImageSource,ImageEffectFactory} from './types.ts';
import {active} from './runtime.ts';

type Options<F extends (...args:never[])=>Promise<GpuPixelImage>>=NonNullable<Parameters<F>[0]>;
function generator<T>(name:string,invoke:(fx:NativeTextureFilters,options:T)=>Promise<GpuPixelImage>,options:T):ImageSource {
 const source:ImageSource=()=>{throw new EngineError('E_IMAGE_SOURCE_INITIALIZATION','Prepare procedural image sources during Stage init',{hint:'Use imageStage(..., {source}), a named blend effect, or tools.prepareSources([source]).'});};
 Object.defineProperty(source,'name',{value:name});
 source.prepare=async(_init,control={})=>{active(control.signal);
  // A stable factory identity per prepared source prevents one generator's
  // retained result from being released by another source of the same family.
  // All instances still borrow the ONE existing Stage GPU scope/device.
  const factory:ImageEffectFactory<NativeTextureFilters>=init=>createNativeTextureEffects(init);
  return {source:frame=>frame.generate(factory,fx=>invoke(fx,options))};
 };return source;
}
export const fractalNoise=(options:Options<NativeTextureFilters['fractalNoise']>={}):ImageSource=>generator('fractalNoise',(f,o)=>f.fractalNoise(o),options);
export const turbulentNoise=(options:Options<NativeTextureFilters['turbulentNoise']>={}):ImageSource=>generator('turbulentNoise',(f,o)=>f.turbulentNoise(o),options);
export const ridgedNoise=(options:Options<NativeTextureFilters['ridgedNoise']>={}):ImageSource=>generator('ridgedNoise',(f,o)=>f.ridgedNoise(o),options);
export const curlTexture=(options:Options<NativeTextureFilters['curlTexture']>={}):ImageSource=>generator('curlTexture',(f,o)=>f.curlTexture(o),options);
export const domainWarpTexture=(options:Options<NativeTextureFilters['domainWarpTexture']>={}):ImageSource=>generator('domainWarpTexture',(f,o)=>f.domainWarpTexture(o),options);
export const gaborTexture=(options:Options<NativeTextureFilters['gaborTexture']>={}):ImageSource=>generator('gaborTexture',(f,o)=>f.gaborTexture(o),options);
export const cellularTexture=(options:Options<NativeTextureFilters['cellularTexture']>={}):ImageSource=>generator('cellularTexture',(f,o)=>f.cellularTexture(o),options);
export const voronoiEdges=(options:Options<NativeTextureFilters['voronoiEdges']>={}):ImageSource=>generator('voronoiEdges',(f,o)=>f.voronoiEdges(o),options);
export const crackleTexture=(options:Options<NativeTextureFilters['crackleTexture']>={}):ImageSource=>generator('crackleTexture',(f,o)=>f.crackleTexture(o),options);
export const marbleTexture=(options:Options<NativeTextureFilters['marbleTexture']>={}):ImageSource=>generator('marbleTexture',(f,o)=>f.marbleTexture(o),options);
export const woodTexture=(options:Options<NativeTextureFilters['woodTexture']>={}):ImageSource=>generator('woodTexture',(f,o)=>f.woodTexture(o),options);
export const graniteTexture=(options:Options<NativeTextureFilters['graniteTexture']>={}):ImageSource=>generator('graniteTexture',(f,o)=>f.graniteTexture(o),options);
export const cloudsTexture=(options:Options<NativeTextureFilters['cloudsTexture']>={}):ImageSource=>generator('cloudsTexture',(f,o)=>f.cloudsTexture(o),options);
export const causticsTexture=(options:Options<NativeTextureFilters['causticsTexture']>={}):ImageSource=>generator('causticsTexture',(f,o)=>f.causticsTexture(o),options);
export const bricksTexture=(options:Options<NativeTextureFilters['bricksTexture']>={}):ImageSource=>generator('bricksTexture',(f,o)=>f.bricksTexture(o),options);
export const hexagonTexture=(options:Options<NativeTextureFilters['hexagonTexture']>={}):ImageSource=>generator('hexagonTexture',(f,o)=>f.hexagonTexture(o),options);
export const truchetTexture=(options:Options<NativeTextureFilters['truchetTexture']>={}):ImageSource=>generator('truchetTexture',(f,o)=>f.truchetTexture(o),options);
export const weaveTexture=(options:Options<NativeTextureFilters['weaveTexture']>={}):ImageSource=>generator('weaveTexture',(f,o)=>f.weaveTexture(o),options);
export const juliaTexture=(options:Options<NativeTextureFilters['juliaTexture']>={}):ImageSource=>generator('juliaTexture',(f,o)=>f.juliaTexture(o),options);
export const mandelbrotTexture=(options:Options<NativeTextureFilters['mandelbrotTexture']>={}):ImageSource=>generator('mandelbrotTexture',(f,o)=>f.mandelbrotTexture(o),options);
