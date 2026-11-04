import {spatialFixtures} from '../../../../tests/helpers/spatial-fields-oracle.ts';
import {fixtures as meshFixtures} from '../../../../tests/helpers/mesh-deformation-oracle.ts';
export const fieldCases=spatialFixtures();
export const meshCases=meshFixtures();
export const vfxNames=['mandelbulb','mengerSponge','gyroidSurface','voronoiCrystal','terrainRaymarch','metaballVolume','planetAtmosphere','heightFog','volumetricSpotlight','smokePlume','flameVolume','waterCaustics','starfield','orbitalTrails','gravitationalLensing'] as const;
// Fixed independent analytic fields, no external image/resource or history.
// Time-dependent noise expectations are supplied by the host's existing F64
// oracle in the verifier. These definitions are the actual authored inputs.
export const computeCases=[
 {name:'cellularVolume',options:{dimensions:[3,2,2],spacing:[.5,.5,.5],origin:[-.75,-.5,-.5],frequency:.75,sharpness:3,strength:2,seed:17}},
 {name:'vortexField',options:{dimensions:[3,2,2],spacing:[.5,.5,.5],origin:[-.75,-.5,-.5],radius:1,strength:2,lift:.25}},
 {name:'curlNoiseField',options:{dimensions:[3,2,2],spacing:[.5,.5,.5],origin:[-.75,-.5,-.5],frequency:1,epsilon:.125,amplitude:.25,seed:17}},
 {name:'splatParticles',options:{dimensions:[5,5,5],origin:[-2,-2,-2],spacing:[1,1,1],area:.5}},
 {name:'renderVolume',options:{width:1,height:1,steps:16,position:[0,0,5],target:[0,0,0],color:[2,.5,.25],far:10}}
];
export const fieldEnd=fieldCases.length,meshEnd=fieldEnd+meshCases.length,computeEnd=meshEnd+computeCases.length,caseCount=computeEnd+vfxNames.length*2;
