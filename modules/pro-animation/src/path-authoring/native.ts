// SPDX-License-Identifier: Apache-2.0
// Frame-local convenience adapter to the existing Native stroke/mesh renderer.
import type {FrameContext} from '../../../../src/core/types.ts';
import {EngineError,diagnostic} from '../../../../src/core/errors.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createNativeStrokeRenderer,type NativeStrokeEnvironment,type NativeStrokeOptions,type PreparedStrokeMesh} from '../stroke-animation/index.ts';
/** Borrow one existing owner, upload only this changing geometry, release temporary
 * mesh buffers, transfer the image to the caller. Stable meshes may keep the lower
 * level prepared renderer instead. No CPU pixels, device or temporal state is created. */
export async function drawPathMesh(environment:NativeStrokeEnvironment,mesh:PreparedStrokeMesh,context:FrameContext,options:NativeStrokeOptions={}):Promise<GpuPixelImage>{
 let image:GpuPixelImage|undefined;try{return await withGpuResources(environment.gpu,async arena=>{if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Path mesh draw cancelled before allocation');const renderer=arena.adopt(createNativeStrokeRenderer(environment),r=>r.dispose()),handle=await renderer.prepare(mesh);return image=await renderer.at(context).draw(handle,options);});}catch(error){if(image)try{await environment.gpu.release(image);}catch(cleanup){throw new EngineError('E_GPU_RESOURCE_CLEANUP','Path draw failed and output cleanup also failed',{details:{primary:diagnostic(error),cleanup:diagnostic(cleanup)}});}throw error;}
}
