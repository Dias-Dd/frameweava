import type {NativeProgram} from './client.ts';
/** Graft a fully admitted branch into this frame, preserving the existing GPU
 * program ABI. Called only for Core-issued leases actually used by the packet. */
export function appendTemporalProgram(target:NativeProgram,parameters:number[][],source:{program:NativeProgram;parameters:number[][];output:number}){
 const p=source.program,image=target.images.length,data=(target.data??=[]).length,kernel=target.kernels.length,pass=target.passes.length;
 target.images.push(...p.images);target.data.push(...(p.data??[]).map(d=>({...d,...d.sourceImage===undefined?{}:{sourceImage:d.sourceImage+image}})));target.kernels.push(...p.kernels);
 target.passes.push(...p.passes.map(v=>({...v,kernel:v.kernel+kernel,output:v.output+image,inputs:v.inputs.map(i=>i+image),...v.rayQuery===undefined?{}:{rayQuery:v.rayQuery+pass},...v.buffers?{buffers:v.buffers.map(i=>i+data)}:{},...v.data?{data:v.data.map(i=>i+data)}:{},...v.draw?{draw:{...v.draw,positions:v.draw.positions+data,...v.draw.indices===undefined?{}:{indices:v.draw.indices+data},...v.draw.uvs===undefined?{}:{uvs:v.draw.uvs+data}}}:{},...v.rayBuild?{rayBuild:{...v.rayBuild,transforms:v.rayBuild.transforms+data,geometries:v.rayBuild.geometries.map(g=>({...g,positions:g.positions+data,...g.indices===undefined?{}:{indices:g.indices+data}}))}}:{}})));
 parameters.push(...source.parameters);if(p.imports)(target.imports??=[]).push(...p.imports.map(i=>({...i,image:i.image+image})));if(p.modules)target.modules=p.modules;if(p.inferences)target.inferences=p.inferences;
 return source.output+image;
}
