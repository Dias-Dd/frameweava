import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {nativeSpatialFrame} from './frame.ts';
import {readDeformedPositions} from '../../mesh-deformation/index.ts';
import {EngineError} from '../../../src/core/errors.ts';
import {createProfessionalFilters} from '../../gpu-image-effects/resident/filters.ts';
import {surfaceFromPixels,linear709} from '../../../src/media/surface.ts';
async function rejects(p:Promise<unknown>,code:string){try{await p;}catch(e){if((e as {code?:string}).code===code)return;throw e;}throw Error('Expected '+code);}
/** Actual admitted owner, no fake hardware scope. Captures unsupported readback
 * and immutable-state failures as evidence; no permissions or policy changes. */
export const spatialPreflight=defineNativeStage<Record<string,never>,{failFrame?:number}>(async init=>{const g=init.gpu,seed=await g.createField({type:'f32',dimensions:[1,1,1],components:3,semantic:'position',space:'example.world',units:'meter'},Float32Array.of(.2,.3,.4));return {async renderAt(c,_inputs,p){const f=nativeSpatialFrame(init,c),before=g.stats().runs;
 await rejects(f.mesh.twistPositions(seed,{signal:AbortSignal.abort()}),'E_RENDER_CANCELLED');
 await rejects(f.mesh.spherifyPositions(seed,{radius:-1}),'E_MESH_DEFORM_PARAMETER');
 await rejects(f.compute.waveStep(seed,seed,{dt:0}),'E_SPATIAL_COMPUTE_SPACE');
 let reads=0;await rejects(f.vfx.starfield({get width(){reads++;return 64;}}),'E_NATIVE_EFFECTS_PARAMETER');if(reads)throw Error('Option getter executed');
 await rejects(readDeformedPositions(g,seed),'E_NATIVE_SCOPE');
 await rejects(g.writeBuffer(seed,Float32Array.of(0),0),'E_NATIVE_SCOPE');
 await rejects(createProfessionalFilters(g,c).importImage(surfaceFromPixels(1,1,Float32Array.of(2,-.25,.5,1),{format:'rgba32float',alpha:'premultiplied',color:linear709})),'E_NATIVE_SCOPE');
 if(g.stats().runs!==before)throw Error('Rejected preflight recorded GPU work');
 const result=await f.vfx.starfield({starRadius:.1});if(result.info.width!==init.width||result.info.height!==init.height)throw Error('Default dimensions differ from Native Stage');
 const after=g.stats().runs;await rejects(createProfessionalFilters(g,c).autoLevels(result),'E_NATIVE_SCOPE');if(g.stats().runs!==after)throw Error('Unsupported statistics bridge recorded work');
 if(p.failFrame===c.frame)throw new EngineError('E_NATIVE_SPATIAL_FIXTURE','Intentional authored failure after recording, before Native submission');
 return result;
 }};});
