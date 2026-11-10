/** Shared scene authoring facade. Implementations and device ownership stay in
 * the existing Native renderer. No device or resources are created on import. */
export {createNativeScene,createNativePathTracer,attachNativeCharacter} from '../native-gpu/authoring.ts';
export type {
  NativeScene3D,NativeSceneRenderOptions,NativeSceneCharacterOptions,NativePathTraceOptions,
  SceneGeometry,SceneGpuMesh,SceneMaterial,SceneMapCoordinates,SceneNode,SceneRgb,
  SceneSample,SceneTransform,SceneUvTopology,SceneTextureAtlas,SceneTextureRegion,
  SceneEnvironmentImportance,SceneVolume,SceneDensityGrid,SceneVolumeEmission,
  NativePathDenoiseOptions,NativePathTemporalDenoiseOptions,NativePathLens,NativePathShutter,
} from '../native-gpu/authoring.ts';
export {createRefractiveScene} from '../spatial-vfx/stage.ts';
export type {RefractiveSceneMesh,RefractiveSceneOptions,RefractiveSceneSample} from '../spatial-vfx/stage.ts';
