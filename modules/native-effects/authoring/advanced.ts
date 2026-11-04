/** Plain-function adapters over the existing algorithms. Options, units,
 * Signal evaluation and logical F16/F32 publications are forwarded unchanged.
 * No device, shader, new algorithm or implicit CPU fallback lives here. */
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {ImageEffect,ImageEffectFactory,ImageInput} from './types.ts';
import {withImageSources} from './runtime.ts';
import {createNativeGeometryEffects} from '../geometry/index.ts';
import type {NativeGeometryFilters} from '../geometry/types.ts';
import {createNativeRestorationEffects} from '../restoration/index.ts';
import type {NativeRestorationFilters} from '../restoration/types.ts';
import {createNativeOpticalEffects} from '../optics/filters.ts';
import type {NativeOpticalFilters} from '../optics/types.ts';
import {createNativeKeyingEffects} from '../keying/index.ts';
import type {NativeKeyingFilters} from '../keying/types.ts';
import {createNativeProKeyEffects} from '../keying-pro/index.ts';
import type {NativeProKeyFilters} from '../keying-pro/types.ts';

type Options<F extends (...args:never[])=>Promise<GpuPixelImage>>=NonNullable<Parameters<F>[1]>;
function unary<F,T>(name:string,factory:ImageEffectFactory<F>,invoke:(fx:F,image:GpuPixelImage,options:T)=>Promise<GpuPixelImage>,options:T):ImageEffect {
 const operation:ImageEffect=(image,frame)=>frame.process(factory,image,(source,fx)=>invoke(fx,source,options));
 Object.defineProperty(operation,'name',{value:name});return operation;
}
function binary<F,T>(name:string,factory:ImageEffectFactory<F>,reference:ImageInput,invoke:(fx:F,image:GpuPixelImage,reference:GpuPixelImage,options:T)=>Promise<GpuPixelImage>,options:T):ImageEffect {
 const operation:ImageEffect=async(image,frame)=>{const other=await frame.input(reference);return frame.process(factory,image,(source,fx)=>invoke(fx,source,other,options));};
 Object.defineProperty(operation,'name',{value:name});return withImageSources(operation,reference);
}

// geometry: exact original option types, required author data stays required.
export const homographyWarp=(options:Options<NativeGeometryFilters['homographyWarp']>):ImageEffect=>unary('homographyWarp',createNativeGeometryEffects,(f,i,o)=>f.homographyWarp(i,o),options);
export const cornerPin=(options:Options<NativeGeometryFilters['cornerPin']>):ImageEffect=>unary('cornerPin',createNativeGeometryEffects,(f,i,o)=>f.cornerPin(i,o),options);
export const twirl=(options:Options<NativeGeometryFilters['twirl']>={}):ImageEffect=>unary('twirl',createNativeGeometryEffects,(f,i,o)=>f.twirl(i,o),options);
export const spherize=(options:Options<NativeGeometryFilters['spherize']>={}):ImageEffect=>unary('spherize',createNativeGeometryEffects,(f,i,o)=>f.spherize(i,o),options);
export const bulge=(options:Options<NativeGeometryFilters['bulge']>={}):ImageEffect=>unary('bulge',createNativeGeometryEffects,(f,i,o)=>f.bulge(i,o),options);
export const waveWarp=(options:Options<NativeGeometryFilters['waveWarp']>={}):ImageEffect=>unary('waveWarp',createNativeGeometryEffects,(f,i,o)=>f.waveWarp(i,o),options);
export const ripple=(options:Options<NativeGeometryFilters['ripple']>={}):ImageEffect=>unary('ripple',createNativeGeometryEffects,(f,i,o)=>f.ripple(i,o),options);
export const mirrorWarp=(options:Options<NativeGeometryFilters['mirrorWarp']>={}):ImageEffect=>unary('mirrorWarp',createNativeGeometryEffects,(f,i,o)=>f.mirrorWarp(i,o),options);
export const offset=(options:Options<NativeGeometryFilters['offset']>={}):ImageEffect=>unary('offset',createNativeGeometryEffects,(f,i,o)=>f.offset(i,o),options);
export const polarCoordinates=(options:Options<NativeGeometryFilters['polarCoordinates']>={}):ImageEffect=>unary('polarCoordinates',createNativeGeometryEffects,(f,i,o)=>f.polarCoordinates(i,o),options);
export const turbulentDisplace=(options:Options<NativeGeometryFilters['turbulentDisplace']>={}):ImageEffect=>unary('turbulentDisplace',createNativeGeometryEffects,(f,i,o)=>f.turbulentDisplace(i,o),options);
export const opticsCompensation=(options:Options<NativeGeometryFilters['opticsCompensation']>={}):ImageEffect=>unary('opticsCompensation',createNativeGeometryEffects,(f,i,o)=>f.opticsCompensation(i,o),options);
export const magnify=(options:Options<NativeGeometryFilters['magnify']>={}):ImageEffect=>unary('magnify',createNativeGeometryEffects,(f,i,o)=>f.magnify(i,o),options);
export const meshWarp=(options:Options<NativeGeometryFilters['meshWarp']>):ImageEffect=>unary('meshWarp',createNativeGeometryEffects,(f,i,o)=>f.meshWarp(i,o),options);
export const bezierWarp=(options:Options<NativeGeometryFilters['bezierWarp']>):ImageEffect=>unary('bezierWarp',createNativeGeometryEffects,(f,i,o)=>f.bezierWarp(i,o),options);
export const bend=(options:Options<NativeGeometryFilters['bend']>={}):ImageEffect=>unary('bend',createNativeGeometryEffects,(f,i,o)=>f.bend(i,o),options);
export const lensWarp=(options:Options<NativeGeometryFilters['lensWarp']>={}):ImageEffect=>unary('lensWarp',createNativeGeometryEffects,(f,i,o)=>f.lensWarp(i,o),options);
export const tiler=(options:Options<NativeGeometryFilters['tiler']>={}):ImageEffect=>unary('tiler',createNativeGeometryEffects,(f,i,o)=>f.tiler(i,o),options);
export const griddler=(options:Options<NativeGeometryFilters['griddler']>={}):ImageEffect=>unary('griddler',createNativeGeometryEffects,(f,i,o)=>f.griddler(i,o),options);
export const lensDistortion=(options:Options<NativeGeometryFilters['lensDistortion']>={}):ImageEffect=>unary('lensDistortion',createNativeGeometryEffects,(f,i,o)=>f.lensDistortion(i,o),options);
export const liquify=(options:Options<NativeGeometryFilters['liquify']>):ImageEffect=>unary('liquify',createNativeGeometryEffects,(f,i,o)=>f.liquify(i,o),options);
export const kaleidoscope=(options:Options<NativeGeometryFilters['kaleidoscope']>={}):ImageEffect=>unary('kaleidoscope',createNativeGeometryEffects,(f,i,o)=>f.kaleidoscope(i,o),options);
export const cylinderWarp=(options:Options<NativeGeometryFilters['cylinderWarp']>={}):ImageEffect=>unary('cylinderWarp',createNativeGeometryEffects,(f,i,o)=>f.cylinderWarp(i,o),options);

// restoration: exact original option types, required author data stays required.
export const nonLocalMeans=(options:Options<NativeRestorationFilters['nonLocalMeans']>={}):ImageEffect=>unary('nonLocalMeans',createNativeRestorationEffects,(f,i,o)=>f.nonLocalMeans(i,o),options);
export const guidedDenoise=(options:Options<NativeRestorationFilters['guidedDenoise']>={}):ImageEffect=>unary('guidedDenoise',createNativeRestorationEffects,(f,i,o)=>f.guidedDenoise(i,o),options);
export const atrousDenoise=(options:Options<NativeRestorationFilters['atrousDenoise']>={}):ImageEffect=>unary('atrousDenoise',createNativeRestorationEffects,(f,i,o)=>f.atrousDenoise(i,o),options);
export const anisotropicDiffusion=(options:Options<NativeRestorationFilters['anisotropicDiffusion']>={}):ImageEffect=>unary('anisotropicDiffusion',createNativeRestorationEffects,(f,i,o)=>f.anisotropicDiffusion(i,o),options);
export const totalVariationDenoise=(options:Options<NativeRestorationFilters['totalVariationDenoise']>={}):ImageEffect=>unary('totalVariationDenoise',createNativeRestorationEffects,(f,i,o)=>f.totalVariationDenoise(i,o),options);
export const kuwahara=(options:Options<NativeRestorationFilters['kuwahara']>={}):ImageEffect=>unary('kuwahara',createNativeRestorationEffects,(f,i,o)=>f.kuwahara(i,o),options);
export const anisotropicKuwahara=(options:Options<NativeRestorationFilters['anisotropicKuwahara']>={}):ImageEffect=>unary('anisotropicKuwahara',createNativeRestorationEffects,(f,i,o)=>f.anisotropicKuwahara(i,o),options);
export const sigmaDenoise=(options:Options<NativeRestorationFilters['sigmaDenoise']>={}):ImageEffect=>unary('sigmaDenoise',createNativeRestorationEffects,(f,i,o)=>f.sigmaDenoise(i,o),options);
export const wienerDenoise=(options:Options<NativeRestorationFilters['wienerDenoise']>={}):ImageEffect=>unary('wienerDenoise',createNativeRestorationEffects,(f,i,o)=>f.wienerDenoise(i,o),options);
export const leeDenoise=(options:Options<NativeRestorationFilters['leeDenoise']>={}):ImageEffect=>unary('leeDenoise',createNativeRestorationEffects,(f,i,o)=>f.leeDenoise(i,o),options);
export const rollingGuidance=(options:Options<NativeRestorationFilters['rollingGuidance']>={}):ImageEffect=>unary('rollingGuidance',createNativeRestorationEffects,(f,i,o)=>f.rollingGuidance(i,o),options);
export const chromaDenoise=(options:Options<NativeRestorationFilters['chromaDenoise']>={}):ImageEffect=>unary('chromaDenoise',createNativeRestorationEffects,(f,i,o)=>f.chromaDenoise(i,o),options);
export const impulseDenoise=(options:Options<NativeRestorationFilters['impulseDenoise']>={}):ImageEffect=>unary('impulseDenoise',createNativeRestorationEffects,(f,i,o)=>f.impulseDenoise(i,o),options);
export const bokehBlur=(options:Options<NativeRestorationFilters['bokehBlur']>={}):ImageEffect=>unary('bokehBlur',createNativeRestorationEffects,(f,i,o)=>f.bokehBlur(i,o),options);
export const tiltShift=(options:Options<NativeRestorationFilters['tiltShift']>={}):ImageEffect=>unary('tiltShift',createNativeRestorationEffects,(f,i,o)=>f.tiltShift(i,o),options);
export const focusPeaking=(options:Options<NativeRestorationFilters['focusPeaking']>={}):ImageEffect=>unary('focusPeaking',createNativeRestorationEffects,(f,i,o)=>f.focusPeaking(i,o),options);

// optical: exact original option types, required author data stays required.
export const anamorphicBloom=(options:Options<NativeOpticalFilters['anamorphicBloom']>={}):ImageEffect=>unary('anamorphicBloom',createNativeOpticalEffects,(f,i,o)=>f.anamorphicBloom(i,o),options);
export const streakGlare=(options:Options<NativeOpticalFilters['streakGlare']>={}):ImageEffect=>unary('streakGlare',createNativeOpticalEffects,(f,i,o)=>f.streakGlare(i,o),options);
export const diffractionGlare=(options:Options<NativeOpticalFilters['diffractionGlare']>={}):ImageEffect=>unary('diffractionGlare',createNativeOpticalEffects,(f,i,o)=>f.diffractionGlare(i,o),options);
export const lensGhosts=(options:Options<NativeOpticalFilters['lensGhosts']>={}):ImageEffect=>unary('lensGhosts',createNativeOpticalEffects,(f,i,o)=>f.lensGhosts(i,o),options);
export const lensHalo=(options:Options<NativeOpticalFilters['lensHalo']>={}):ImageEffect=>unary('lensHalo',createNativeOpticalEffects,(f,i,o)=>f.lensHalo(i,o),options);
export const axialChromaticAberration=(options:Options<NativeOpticalFilters['axialChromaticAberration']>={}):ImageEffect=>unary('axialChromaticAberration',createNativeOpticalEffects,(f,i,o)=>f.axialChromaticAberration(i,o),options);
export const spectralDispersion=(options:Options<NativeOpticalFilters['spectralDispersion']>={}):ImageEffect=>unary('spectralDispersion',createNativeOpticalEffects,(f,i,o)=>f.spectralDispersion(i,o),options);
export const diffusionFilter=(options:Options<NativeOpticalFilters['diffusionFilter']>={}):ImageEffect=>unary('diffusionFilter',createNativeOpticalEffects,(f,i,o)=>f.diffusionFilter(i,o),options);
export const airyDiffraction=(options:Options<NativeOpticalFilters['airyDiffraction']>={}):ImageEffect=>unary('airyDiffraction',createNativeOpticalEffects,(f,i,o)=>f.airyDiffraction(i,o),options);
export const lightLeak=(options:Options<NativeOpticalFilters['lightLeak']>={}):ImageEffect=>unary('lightLeak',createNativeOpticalEffects,(f,i,o)=>f.lightLeak(i,o),options);
export const opticalVignette=(options:Options<NativeOpticalFilters['opticalVignette']>={}):ImageEffect=>unary('opticalVignette',createNativeOpticalEffects,(f,i,o)=>f.opticalVignette(i,o),options);
export const veilingGlare=(options:Options<NativeOpticalFilters['veilingGlare']>={}):ImageEffect=>unary('veilingGlare',createNativeOpticalEffects,(f,i,o)=>f.veilingGlare(i,o),options);

// keying: exact original option types, required author data stays required.
export const colorKey=(options:Options<NativeKeyingFilters['colorKey']>={}):ImageEffect=>unary('colorKey',createNativeKeyingEffects,(f,i,o)=>f.colorKey(i,o),options);
export const colorRangeKey=(options:Options<NativeKeyingFilters['colorRangeKey']>):ImageEffect=>unary('colorRangeKey',createNativeKeyingEffects,(f,i,o)=>f.colorRangeKey(i,o),options);
export const extractKey=(options:Options<NativeKeyingFilters['extractKey']>={}):ImageEffect=>unary('extractKey',createNativeKeyingEffects,(f,i,o)=>f.extractKey(i,o),options);
export const colorDifferenceKey=(options:Options<NativeKeyingFilters['colorDifferenceKey']>={}):ImageEffect=>unary('colorDifferenceKey',createNativeKeyingEffects,(f,i,o)=>f.colorDifferenceKey(i,o),options);
export const screenKey=(options:Options<NativeKeyingFilters['screenKey']>={}):ImageEffect=>unary('screenKey',createNativeKeyingEffects,(f,i,o)=>f.screenKey(i,o),options);
export const advancedSpillSuppressor=(options:Options<NativeKeyingFilters['advancedSpillSuppressor']>={}):ImageEffect=>unary('advancedSpillSuppressor',createNativeKeyingEffects,(f,i,o)=>f.advancedSpillSuppressor(i,o),options);
export const unmult=(options:Options<NativeKeyingFilters['unmult']>={}):ImageEffect=>unary('unmult',createNativeKeyingEffects,(f,i,o)=>f.unmult(i,o),options);
export const keyCleaner=(options:Options<NativeKeyingFilters['keyCleaner']>={}):ImageEffect=>unary('keyCleaner',createNativeKeyingEffects,(f,i,o)=>f.keyCleaner(i,o),options);
export const matteChoker=(options:Options<NativeKeyingFilters['matteChoker']>={}):ImageEffect=>unary('matteChoker',createNativeKeyingEffects,(f,i,o)=>f.matteChoker(i,o),options);
export const refineMatte=(options:Options<NativeKeyingFilters['refineMatte']>={}):ImageEffect=>unary('refineMatte',createNativeKeyingEffects,(f,i,o)=>f.refineMatte(i,o),options);
export const edgeDecontaminate=(options:Options<NativeKeyingFilters['edgeDecontaminate']>={}):ImageEffect=>unary('edgeDecontaminate',createNativeKeyingEffects,(f,i,o)=>f.edgeDecontaminate(i,o),options);
export const edgeExtend=(options:Options<NativeKeyingFilters['edgeExtend']>={}):ImageEffect=>unary('edgeExtend',createNativeKeyingEffects,(f,i,o)=>f.edgeExtend(i,o),options);
export const distanceFeather=(options:Options<NativeKeyingFilters['distanceFeather']>={}):ImageEffect=>unary('distanceFeather',createNativeKeyingEffects,(f,i,o)=>f.distanceFeather(i,o),options);
export const matteOutline=(options:Options<NativeKeyingFilters['matteOutline']>={}):ImageEffect=>unary('matteOutline',createNativeKeyingEffects,(f,i,o)=>f.matteOutline(i,o),options);
export const matteBevel=(options:Options<NativeKeyingFilters['matteBevel']>={}):ImageEffect=>unary('matteBevel',createNativeKeyingEffects,(f,i,o)=>f.matteBevel(i,o),options);
export const matteGradient=(options:Options<NativeKeyingFilters['matteGradient']>={}):ImageEffect=>unary('matteGradient',createNativeKeyingEffects,(f,i,o)=>f.matteGradient(i,o),options);
export const matteMedian=(options:Options<NativeKeyingFilters['matteMedian']>={}):ImageEffect=>unary('matteMedian',createNativeKeyingEffects,(f,i,o)=>f.matteMedian(i,o),options);
export const matteThreshold=(options:Options<NativeKeyingFilters['matteThreshold']>={}):ImageEffect=>unary('matteThreshold',createNativeKeyingEffects,(f,i,o)=>f.matteThreshold(i,o),options);
export const matteQuantize=(options:Options<NativeKeyingFilters['matteQuantize']>={}):ImageEffect=>unary('matteQuantize',createNativeKeyingEffects,(f,i,o)=>f.matteQuantize(i,o),options);
export const wireRemove=(options:Options<NativeKeyingFilters['wireRemove']>):ImageEffect=>unary('wireRemove',createNativeKeyingEffects,(f,i,o)=>f.wireRemove(i,o),options);

// proKey: exact original option types, required author data stays required.
export const screenMatte=(options:Options<NativeProKeyFilters['screenMatte']>={}):ImageEffect=>unary('screenMatte',createNativeProKeyEffects,(f,i,o)=>f.screenMatte(i,o),options);
export const matteClipRollback=(options:Options<NativeProKeyFilters['matteClipRollback']>={}):ImageEffect=>unary('matteClipRollback',createNativeProKeyEffects,(f,i,o)=>f.matteClipRollback(i,o),options);
export const matteTone=(options:Options<NativeProKeyFilters['matteTone']>={}):ImageEffect=>unary('matteTone',createNativeProKeyEffects,(f,i,o)=>f.matteTone(i,o),options);
export const matteDespot=(options:Options<NativeProKeyFilters['matteDespot']>={}):ImageEffect=>unary('matteDespot',createNativeProKeyEffects,(f,i,o)=>f.matteDespot(i,o),options);
export const keyBias=(options:Options<NativeProKeyFilters['keyBias']>={}):ImageEffect=>unary('keyBias',createNativeProKeyEffects,(f,i,o)=>f.keyBias(i,o),options);
export const spillBias=(options:Options<NativeProKeyFilters['spillBias']>={}):ImageEffect=>unary('spillBias',createNativeProKeyEffects,(f,i,o)=>f.spillBias(i,o),options);
export const foregroundGrade=(options:Options<NativeProKeyFilters['foregroundGrade']>={}):ImageEffect=>unary('foregroundGrade',createNativeProKeyEffects,(f,i,o)=>f.foregroundGrade(i,o),options);
export const keyStatus=(options:Options<NativeProKeyFilters['keyStatus']>={}):ImageEffect=>unary('keyStatus',createNativeProKeyEffects,(f,i,o)=>f.keyStatus(i,o),options);
export const refineBand=(options:Options<NativeProKeyFilters['refineBand']>={}):ImageEffect=>unary('refineBand',createNativeProKeyEffects,(f,i,o)=>f.refineBand(i,o),options);
export const keyCrop=(options:Options<NativeProKeyFilters['keyCrop']>={}):ImageEffect=>unary('keyCrop',createNativeProKeyEffects,(f,i,o)=>f.keyCrop(i,o),options);
export const lensDirt=(reference:ImageInput,options:NonNullable<Parameters<NativeOpticalFilters['lensDirt']>[2]>={}):ImageEffect=>binary('lensDirt',createNativeOpticalEffects,reference,(f,i,r,o)=>f.lensDirt(i,r,o),options);
export const occludedLightRays=(reference:ImageInput,options:NonNullable<Parameters<NativeOpticalFilters['occludedLightRays']>[2]>={}):ImageEffect=>binary('occludedLightRays',createNativeOpticalEffects,reference,(f,i,r,o)=>f.occludedLightRays(i,r,o),options);
export const jointBilateral=(reference:ImageInput,options:NonNullable<Parameters<NativeRestorationFilters['jointBilateral']>[2]>={}):ImageEffect=>binary('jointBilateral',createNativeRestorationEffects,reference,(f,i,r,o)=>f.jointBilateral(i,r,o),options);
export const differenceMatte=(reference:ImageInput,options:NonNullable<Parameters<NativeKeyingFilters['differenceMatte']>[2]>={}):ImageEffect=>binary('differenceMatte',createNativeKeyingEffects,reference,(f,i,r,o)=>f.differenceMatte(i,r,o),options);
export const lightWrap=(reference:ImageInput,options:NonNullable<Parameters<NativeKeyingFilters['lightWrap']>[2]>={}):ImageEffect=>binary('lightWrap',createNativeKeyingEffects,reference,(f,i,r,o)=>f.lightWrap(i,r,o),options);
export const keyUnmix=(reference:ImageInput,options:NonNullable<Parameters<NativeProKeyFilters['keyUnmix']>[2]>={}):ImageEffect=>binary('keyUnmix',createNativeProKeyEffects,reference,(f,i,r,o)=>f.keyUnmix(i,r,o),options);
export const edgeGrade=(reference:ImageInput,options:NonNullable<Parameters<NativeProKeyFilters['edgeGrade']>[2]>={}):ImageEffect=>binary('edgeGrade',createNativeProKeyEffects,reference,(f,i,r,o)=>f.edgeGrade(i,r,o),options);
export const keyDifference=(reference:ImageInput,options:NonNullable<Parameters<NativeProKeyFilters['keyDifference']>[2]>={}):ImageEffect=>binary('keyDifference',createNativeProKeyEffects,reference,(f,i,r,o)=>f.keyDifference(i,r,o),options);
