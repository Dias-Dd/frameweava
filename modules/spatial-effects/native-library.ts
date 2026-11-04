/** Native Stage-local creative library. These are the existing algorithms,
 * not rewritten/aliased substitutes. Pass init.gpu; no device/owner is created.
 * All returned images/buffers belong to the caller. Inputs remain borrowed. */
export {mandelbulb,mengerSponge,gyroidSurface,voronoiCrystal,terrainRaymarch,metaballVolume,planetAtmosphere,heightFog,volumetricSpotlight,smokePlume,flameVolume,waterCaustics,starfield,orbitalTrails,gravitationalLensing} from '../spatial-vfx/index.ts';
export {deviceDepthToViewDepth,viewDepthToRayDistance,reconstructWorldPositions,projectWorldPositions,reconstructNormals,cameraMotionFromDepth,reprojectionVisibility,distanceToPointField,distanceToPlaneField,surfaceCurvatureField,surfaceGradientField,reflectionDirectionField,refractionDirectionField,reduceDepthBounds,surfaceTangentFrame} from '../spatial-fields/index.ts';
export {transformPositions,twistPositions,bendPositions,taperPositions,shearPositions,stretchPositions,bulgePositions,spherifyPositions,cylindrifyPositions,wavePositions,ripplePositions,noiseDisplacePositions,morphPositions,cageDeformPositions,attractPositions} from '../mesh-deformation/index.ts';
export {cellularVolume,vortexField,curlNoiseField,splatParticles,renderVolume} from '../spatial-compute/index.ts';
export type {SpatialField,SpatialCamera} from '../spatial-fields/types.ts';
export type {NativeGpuScope} from '../native-gpu/authoring.ts';
