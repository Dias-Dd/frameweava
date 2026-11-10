import type {FrameContext} from '../../src/core/types.ts';
import {EngineError} from '../../src/core/errors.ts';
import {cryptoManifest} from '../spatial-creation/aov-models.ts';
import {preparePathMotion,previousPathContext} from './path-motion.ts';
import {linear709} from '../../src/media/surface.ts';
import type {GpuComputeBinding, GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import {withGpuResources,type GpuResourceArena} from '../gpu-effects/resource-arena.ts';
import type {NativeStageInit, NativeStageInstance} from './authoring.ts';
import {advancePath, applyPathLight, displayPath, resetPath, sumPath} from './path-shaders.ts';
import type {NativeRayTargets} from './rays.ts';
import {cameraParameters, type NativeSceneRenderOptions} from './scene-render.ts';
import {cameraRays,thinLensCameraRays} from './scene-shaders.ts';
import {pathCameraParameters,pathShutterContexts,type NativePathLens,type NativePathShutter} from './path-camera.ts';
import {frameTextureAtlas} from './scene-textures.ts';
import {preparePathDenoiser, preparePathGuides, preparePathTemporalDenoiser, type NativePathDenoiseOptions} from './path-denoise.ts';
import {prepareScene3D, sceneRead, sceneWrite, type NativeScene3D} from './scene.ts';
import {preparePathDenoiseFeatures} from './path-denoise-features.ts';

/** Experimental trusted-module camera-ray adapter; not a new Stage or shader ABI. */
export interface NativePathPrimaryRayEffect {
  version:1;
  apply(input:{context:FrameContext;sample:number;seed:number;width:number;height:number;far:number;
    origins:GpuDataBuffer;directions:GpuDataBuffer;nearest:Readonly<NativeRayTargets>;
    /** Requery the same authorized scene/ray origins after changing directions.
     * Overwrites nearest, allowing depth-discontinuity rejection in the module. */
    retrace():Promise<void>},arena:GpuResourceArena):void|Promise<void>;
}

export interface NativePathTraceOptions extends NativeSceneRenderOptions {
  /** Opt-in phase-screen/lens effects. Modify directions only; origins/nearest
   * are read-only inputs. Prequery uses the scene's actual Alpha coverage policy.
   * Center guides and every Beauty sample use the same effect. Geometric Motion
   * remains the existing straight-camera projection, not refractive flow. */
  experimentalPrimaryRays?:NativePathPrimaryRayEffect;
  /** Optional physical circular thin lens; meters in scene coordinates. Guides remain center-primary. */
  lens?: NativePathLens | ((context:FrameContext) => NativePathLens);
  /** Resample the complete scene/camera over an explicit box exposure. Off by default. */
  shutter?:NativePathShutter;
  /** Independent camera samples per pixel. Default 8. */
  samples?: number;
  /** Maximum surface scattering events per path. Default 5. */
  maxBounces?: number;
  /** Geometry-guided scene-linear GPU denoising. Off unless explicitly enabled. */
  denoise?: boolean | NativePathDenoiseOptions;
  /** MIS of explicit lights and surface paths. Default preserves the surface-only profile. */
  lightSampling?: 'mis' | 'surface-only';
  /** Publish raw scene-linear lighting and primary guides through the native data-export contract. */
  aovs?: boolean;
  /** Sample object and material coverage from the same camera rays as Beauty. */
  cryptomatte?: boolean;
  /** Center-primary screen motion from explicitly resampled previous pose. */
  motionVectors?: boolean;
  /** Publish AA albedo/normal features from the exact Beauty camera samples.
   * Requires aovs:true. Off by default; does not change center-primary guides. */
  denoiseFeatures?:boolean;
}

const readId = {type: 'u32', access: 'read'} as const;
const writeId = {type: 'u32', access: 'read_write'} as const;
const recordCoverage = /* wgsl */ `
fn compute(p:vec3u,local:vec3u,group:vec3u) {
  let i=p.y*paramU32(0u)+p.x;
  let at=paramU32(1u)+i;
  store1(at,select(0u,load0(i*4u+1u)+1u,load0(i*4u)!=0u));
}
`;

/** Deterministic GPU wavefront path tracing over the shared Native scene. */
export async function createNativePathTracer(init: NativeStageInit, scene: NativeScene3D,
    options: NativePathTraceOptions = {}): Promise<NativeStageInstance> {
  const {gpu, width, height} = init;
  const primary=options.experimentalPrimaryRays;
  if(primary!==undefined&&(!primary||primary.version!==1||typeof primary.apply!=='function'))
    throw new EngineError('E_NATIVE_PATH_PRIMARY','Expected experimental primary-ray effect v1');
  const atlasStorage=scene.textureAtlas?.decode==='rgba32float-le'?'u32':'f32';
  const samples = options.samples ?? 8, bounces = options.maxBounces ?? 5;
  const epsilon = Math.fround(options.rayEpsilon ?? .0001);
  if (options.lightSampling !== undefined && !['mis', 'surface-only'].includes(options.lightSampling))
    throw new EngineError('E_NATIVE_PATH_OPTIONS', 'Unknown light sampling profile');
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 0xffffffff ||
      !Number.isSafeInteger(bounces) || bounces < 0 || bounces >= 0xffffffff ||
      !Number.isSafeInteger(samples * (bounces + 1)) || !Number.isFinite(epsilon) || epsilon <= 0)
    throw new EngineError('E_NATIVE_PATH_OPTIONS', 'Path tracing requires representable sample/bounce counts and a positive ray epsilon');
  const aovs = options.aovs === true;
  const cryptomatte = options.cryptomatte === true;
  if(options.denoiseFeatures!==undefined&&typeof options.denoiseFeatures!=='boolean')
    throw new EngineError('E_NATIVE_PATH_OPTIONS','denoiseFeatures must be boolean');
  if(options.denoiseFeatures&&!aovs)throw new EngineError('E_NATIVE_PATH_OPTIONS','Denoise feature publication requires aovs:true');
  if (cryptomatte && !aovs) throw new EngineError('E_NATIVE_PATH_OPTIONS','Cryptomatte requires aovs:true');
  const stateWords = aovs ? 24 : 8, channels = aovs ? 18 : 3;
  const pixels = width * height, stack = Math.max(1, bounces);
  const limits = gpu.capabilities().limits;
  const longest = pixels * Math.max(stateWords, stack, cryptomatte ? samples : 1) * 4;
  if (!Number.isSafeInteger(longest) || longest > limits.maxStorageBufferBindingSize || longest > limits.maxBufferSize)
    throw new EngineError('E_NATIVE_PATH_CAPACITY', 'Path state exceeds the device storage binding limit');
  const workItems = [width, height, 1] as const;
  const kernel = (name: string, bindings: GpuComputeBinding[], parameterWords: number, code: string) =>
    gpu.compileCompute({abiVersion: 1, id: `frameweave/scene/path-${name}`, version: '1.0.0',
      bindings, parameterWords, workgroupSize: [8, 8, 1], code});
  const seed = await gpu.compileCompute({abiVersion: 1, id: 'frameweave/scene/camera-rays', version: '1.0.0',
    bindings: [sceneWrite, sceneWrite], parameterWords: options.lens ? 28 : 24, workgroupSize: [8, 8, 1],
    code: options.lens ? thinLensCameraRays : cameraRays});
  const reset = await kernel('reset', [sceneWrite], 2, resetPath);
  const advance = await kernel('advance',
    [sceneWrite, sceneWrite, sceneWrite, readId, sceneRead, sceneRead, sceneRead, writeId, sceneWrite, sceneWrite, sceneWrite, readId, {type:atlasStorage,access:'read'}, sceneRead, readId, sceneRead],
    27, advancePath(atlasStorage,scene.volumes?.some(volume=>volume.emission!==undefined)===true));
  const light = await kernel('light', [sceneWrite, readId, sceneRead, sceneRead], 2, applyPathLight);
  const sum = await kernel('sum', [sceneRead, sceneWrite], 4, sumPath);
  const coverage = cryptomatte ? await kernel('coverage',[readId,writeId],2,recordCoverage) : undefined;
  const display = await gpu.compile({abiVersion: 2, id: 'frameweave/scene/path-display', version: '1.0.0',
    inputCount: 0, dataInputs: [{type: 'f32'}], parameterWords: 2, code: displayPath});
  const denoiser = options.denoise ? await preparePathDenoiser(init, options.denoise === true ? {} : options.denoise) : undefined;
  const temporalOptions=typeof options.denoise==='object' ? options.denoise.temporal : undefined;
  const temporal=temporalOptions ? await preparePathTemporalDenoiser(init,temporalOptions===true?{}:temporalOptions) : undefined;
  const captureMotion = options.motionVectors || temporal ? await preparePathMotion(init) : undefined;
  if (options.motionVectors && !aovs) throw new EngineError('E_NATIVE_PATH_OPTIONS','Motion publication requires aovs:true');
  const captureGuide = denoiser || aovs ? await preparePathGuides(init,atlasStorage) : undefined;
  const captureFeatures=options.denoiseFeatures?await preparePathDenoiseFeatures(init,atlasStorage):undefined;
  const prepared = await prepareScene3D(init, scene, options.lightSampling === 'mis');
  const labels = coverage ? {profile:'path-cryptomatte-v1',objects:prepared.instanceNames,materials:prepared.materialNames} : undefined;
  if (labels) {
    cryptoManifest('CryptoObject',labels.objects);
    cryptoManifest('CryptoMaterial',labels.materials);
  }
  const hasDirectLighting = prepared.hasEmitters || (prepared.environmentRegion>0 && options.lightSampling==='mis') || prepared.lighting.subarray(9, 12).some(v => v > 0);
  const frameLayout = Uint32Array.of(width,stateWords);
  const displayLayout = Float32Array.of(aovs?1:samples,0);
  new Uint32Array(displayLayout.buffer)[1]=channels;
  async function traceFrame(context:FrameContext,history=false) {
      return withGpuResources(gpu, async arena => {
        const times=pathShutterContexts(context,samples,options.shutter);
        const xyz = async () => arena.buffer(await gpu.createField({
          type: 'f32', dimensions: [width, height, 1], components: 3, semantic: 'generic',
        }));
        const buffer = async (type: 'f32' | 'u32', words: number) =>
          arena.buffer(await gpu.createBuffer({type, length: pixels * words}));
        const origins = await xyz(), directions = await xyz(), shadowOrigins = await xyz(), shadowDirections = await xyz();
        const state = await buffer('f32', stateWords), media = await buffer('u32', stack), accumulator = await buffer('f32', channels);
        const direct = await buffer('f32', 8);
        const features=captureFeatures&&!history?arena.buffer(await gpu.createField({type:'f32',dimensions:[width,height,2],components:3,semantic:'generic',
          metadata:{profile:'path-denoise-features-v1',samples,planes:['albedo-linear-rec709-rgb','world-shading-normal-xyz'],sampling:'beauty-camera-jitter-lens-shutter',miss:[0,0,0],normalization:'sample-mean-not-unit-normal'}})):undefined;
        const coverageData = labels && !history ? arena.buffer(await gpu.createField({
          type:'u32',dimensions:[width,height,samples],components:1,semantic:'coverage',metadata:labels,
        })) : undefined;
        const output: NativeRayTargets = {
          hits: await buffer('u32', 4), measurements: await buffer('f32', 4), normals: await buffer('f32', 4),
        };
        const params = new Float32Array(27),flags = new Uint32Array(params.buffer);
        params.set(prepared.lighting);flags[16]=width;flags[19]=stack;params[20]=epsilon;
        flags[22]=prepared.volumeCount;flags[24]=stateWords;flags[25]=prepared.environmentRegion;
        flags[26]=options.lightSampling==='mis'?prepared.environmentOffset:0;
        // The declared immutable atlas is identical for every shutter pose.
        // Reuse one admitted handle, rather than re-uploading it for every time sample.
        const atlas=await frameTextureAtlas(gpu,arena,prepared.textureAtlas,prepared.emptyTexture);
        async function pose(at:FrameContext) {
          const frame=await prepared.frame(at,arena);
          arena.adopt(frame.scene,s=>gpu.releaseRayScene(s));
          const cameraData=options.lens?pathCameraParameters(frame,width,height,at,options.lens):cameraParameters(frame,width,height);
          const emitters=arena.buffer(await gpu.createBuffer({type:'u32',length:frame.emitterWords.length},frame.emitterWords));
          const transforms=arena.buffer(await gpu.createBuffer({type:'f32',length:frame.shadingWords.length},frame.shadingWords));
          const materialCoverage=prepared.hasCoverage?{version:2 as const,layout:frame.textureLayout,texels:atlas,seed:at.seed}:undefined;
          return {frame,camera:cameraData.words,far:cameraData.far,atlas,transforms,materialCoverage,
            trace:{version:1 as const,tMin:epsilon,tMax:cameraData.far,output,coverage:materialCoverage},
            inputs:[origins,directions,state,output.hits,output.measurements,output.normals,
              prepared.palette,media,shadowOrigins,shadowDirections,direct,frame.textureLayout,atlas,frame.volumes,emitters,transforms]};
        }
        const center=await pose(context);
        const {frame,camera,far,transforms,trace}=center;
        const modifyPrimary=async(at:FrameContext,current:Awaited<ReturnType<typeof pose>>,sample:number,random:number)=>{
          if(!primary)return;
          // A geometric first boundary after actual Alpha mask/blend coverage.
          // Glass/transmission and emissive surfaces remain boundaries; this is
          // not recursively visible radiance through those materials.
          await gpu.traceRayScene(current.frame.scene,{...current.trace,origins,directions});
          // Preserve the original structured error, cancellation category and
          // cause. The existing Stage boundary adds execution context.
          await primary.apply({context:at,sample,seed:random,width,height,far:current.far,origins,directions,nearest:output,
            retrace:()=>gpu.traceRayScene(current.frame.scene,{...current.trace,origins,directions}).then(()=>{})},arena);
        };
        params.set([-camera[8],-camera[9],-camera[10],camera[19]-camera[18]],12);params[23]=far;
        const poses=new Map<number,Awaited<ReturnType<typeof pose>>>();
        let guide: GpuDataBuffer | undefined;
        let motion: GpuDataBuffer | undefined;
        if (captureGuide) {
          await gpu.dispatch(seed, [origins, directions], {workItems, parameters: camera});
          if(primary)await modifyPrimary(context,center,-1,new Uint32Array(camera.buffer)[23]);
          await gpu.traceRayScene(frame.scene, {...trace, origins, directions});
          if (captureMotion && !history) {
            motion=await captureMotion(arena,prepared,previousPathContext(context),output);
            if(options.motionVectors) await gpu.publishBuffer('path-motion',motion,{version:1});
          }
          guide = await captureGuide(arena, [output.hits, output.measurements, output.normals,
            prepared.palette, frame.textureLayout, atlas, directions, transforms], params.subarray(12,16));
        }
        for (let sample = 0; sample < samples; sample++) {
          const timeIndex=sample%times.length,at=times[timeIndex];
          let current=times.length===1&&at===context?center:poses.get(timeIndex);
          if(!current){current=await pose(at);poses.set(timeIndex,current);}
          const {frame,camera,far,materialCoverage,trace,inputs}=current;
          const cameraFlags=new Uint32Array(camera.buffer);
          params.set([-camera[8],-camera[9],-camera[10],camera[19]-camera[18]],12);params[23]=far;
          const random = (Math.imul(context.seed + 1, 0x85ebca6b) ^
            Math.imul(context.globalFrame + 1, 0xc2b2ae35) ^ Math.imul(sample + 1, 0x9e3779b1)) >>> 0;
          cameraFlags[23] = flags[17] = random || 1;
          await gpu.dispatch(seed, [origins, directions], {workItems, parameters: camera});
          if(primary){if(materialCoverage)materialCoverage.seed=(random^Math.imul(1,0x83fba729))>>>0;await modifyPrimary(at,current,sample,random);}
          await gpu.dispatch(reset, [state], {workItems, parameters: frameLayout});
          for (let bounce = 0; bounce <= bounces; bounce++) {
            flags[18] = bounce;
            flags[21] = Number(bounce === bounces);
            if(materialCoverage)materialCoverage.seed=(random^Math.imul(bounce+1,0x83fba729))>>>0;
            await gpu.traceRayScene(frame.scene, {...trace, origins, directions});
            if(bounce===0&&captureFeatures&&features)await captureFeatures([
              output.hits,output.measurements,output.normals,prepared.palette,frame.textureLayout,atlas,directions,current.transforms,
            ],features,sample,samples);
            if (bounce === 0 && coverage && coverageData) await gpu.dispatch(coverage,[output.hits,coverageData],{
              workItems,parameters:Uint32Array.of(width,sample*pixels),
            });
            await gpu.dispatch(advance, inputs, {workItems, parameters: params});
            if (hasDirectLighting) {
              if(materialCoverage)materialCoverage.seed=(random^Math.imul(bounce+1,0x731fd24b))>>>0;
              await gpu.traceRayScene(frame.scene, {...trace, origins: shadowOrigins, directions: shadowDirections});
              await gpu.dispatch(light, [state, output.hits, direct, output.measurements], {workItems, parameters: frameLayout});
            }
          }
          await gpu.dispatch(sum, [state, accumulator], {workItems, parameters: Uint32Array.of(width,sample,stateWords,samples)});
        }
        if (aovs && guide && !history) {
          await gpu.publishBuffer('path-transport',accumulator,{version:1});
          await gpu.publishBuffer('path-guide',guide,{version:1});
          if (coverageData) await gpu.publishBuffer('path-cryptomatte',coverageData,{version:1});
          if(features)await gpu.publishBuffer('path-denoise-features',features,{version:1});
        }
        const format = options.format ?? 'rgba32float';
        const image = await gpu.run(display, [], {data: [accumulator], parameters: displayLayout, output: {
          width, height, color: linear709, alpha: 'opaque', format: denoiser ? 'rgba32float' : format,
        }});
        const filtered=denoiser && guide ? await denoiser.filter(arena,image,guide,temporal?'rgba32float':format) : image;
        return {image:filtered,raw:temporal&&!history?arena.keep(image):undefined,guide:temporal&&guide?arena.keep(guide):undefined,
          motion:temporal&&motion?arena.keep(motion):undefined};
      });
  }
  return {
    async renderAt(context) {
      return withGpuResources(gpu,async arena=>{
        const previous=temporal?previousPathContext(context):undefined;
        const history=previous?await traceFrame(previous,true):undefined;
        if(history) {
          arena.image(history.image);
          if(history.guide)arena.buffer(history.guide);
        }
        const current=await traceFrame(context);
        arena.image(current.image);
        if(current.raw)arena.image(current.raw);
        if(current.guide)arena.buffer(current.guide);
        if(current.motion)arena.buffer(current.motion);
        if(temporal && current.guide && current.motion)
          return temporal(current.image,history?.image??current.image,current.raw!,current.guide,history?.guide??current.guide,current.motion,options.format??'rgba32float');
        return arena.keep(current.image);
      });
    },
    dispose: () => prepared.dispose(),
  };
}
