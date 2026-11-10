import type {FrameContext} from '../../src/core/types.ts';
import {frameToSeconds} from '../../src/core/time.ts';
import type {GpuResourceArena} from '../gpu-effects/resource-arena.ts';
import type {NativeStageInit} from './authoring.ts';
import type {NativeRayTargets} from './rays.ts';
import {sceneRead,sceneWrite,type prepareScene3D} from './scene.ts';

type PreparedScene=Awaited<ReturnType<typeof prepareScene3D>>;
const readId={type:'u32',access:'read'} as const;

/** Sample an adjacent composition frame in the same affine Stage time map. */
export function previousPathContext(context:FrameContext):FrameContext|undefined {
  const {fps,globalFrame,frame,dt,durationInFrames,progress}=context;
  if(globalFrame<=0 || progress<=0 || durationInFrames<=1)return undefined;
  const previousFrame=frame-dt*fps.num/fps.den;
  return {...context,frame:previousFrame,globalFrame:globalFrame-1,time:frameToSeconds(previousFrame,fps),
    globalTime:frameToSeconds(globalFrame-1,fps),progress:Math.max(0,progress-1/(durationInFrames-1))};
}

const reproject = /* wgsl */ `
fn position(vertex:u32,offset:u32)->vec3f {
  let i=offset+vertex*3u;
  return vec3f(load2(i),load2(i+1u),load2(i+2u));
}
fn row(i:u32)->vec4f {
  return vec4f(load4(i),load4(i+1u),load4(i+2u),load4(i+3u));
}
fn column(i:u32)->vec4f {
  return vec4f(paramF32(i),paramF32(i+1u),paramF32(i+2u),paramF32(i+3u));
}
fn compute(p:vec3u,local:vec3u,group:vec3u) {
  let width=paramU32(21u);let height=paramU32(22u);
  let i=(p.y*width+p.x)*4u;
  store5(i,0.);store5(i+1u,0.);store5(i+2u,0.);store5(i+3u,0.);
  if(load0(i)==0u){return;}
  let record=load0(i+1u)*16u;
  let tri=load0(i+2u)*3u;
  if(tri>=bitcast<u32>(load4(record+14u))){return;}
  let start=bitcast<u32>(load4(record+13u))+tri;
  let off=bitcast<u32>(load4(record+12u));
  let u=load1(i+1u);let v=load1(i+2u);
  let a=position(load3(start),off);let b=position(load3(start+1u),off);let c=position(load3(start+2u),off);
  let object=vec4f(a*(1.-u-v)+b*u+c*v,1.);
  let world=vec4f(dot(row(record),object),dot(row(record+4u),object),dot(row(record+8u),object),1.);
  let clip=mat4x4f(column(0u),column(4u),column(8u),column(12u))*world;
  let z=dot(column(16u),world)-paramF32(20u);
  if(clip.w<=0. || abs(clip.z)>clip.w || !(z>=0.)){return;}
  let xy=(vec2f(.5)+clip.xy/clip.w*vec2f(.5,-.5))*vec2f(f32(width),f32(height));
  let motion=xy-(vec2f(p.xy)+.5);
  if(any((bitcast<vec2u>(motion)&vec2u(0x7f800000u))==vec2u(0x7f800000u))){return;}
  store5(i,motion.x);store5(i+1u,motion.y);store5(i+2u,z);store5(i+3u,1.);
}
`;

export async function preparePathMotion(init:NativeStageInit) {
  const {gpu,width,height}=init;
  const kernel=await gpu.compileCompute({
    abiVersion:1,id:'frameweave/scene/path-motion',version:'1.0.0',workgroupSize:[8,8,1],parameterWords:23,
    bindings:[readId,sceneRead,sceneRead,readId,sceneRead,sceneWrite],code:reproject,
  });
  return async (arena:GpuResourceArena,prepared:PreparedScene,previous:FrameContext|undefined,hit:NativeRayTargets) => {
    const motion=arena.buffer(await gpu.createField({
      type:'f32',dimensions:[width,height,1],components:4,semantic:'generic',space:'raster',
      channels:['dx','dy','previous-depth','validity'],
      metadata:{profile:'path-motion-v1',direction:'current-to-previous',units:['pixel','pixel','meter','unitless']},
    }));
    if(!previous) {
      await gpu.clearBuffer(motion);
      return motion;
    }
    const {view,near,objects}=await prepared.motionPose(previous,arena);
    const records=new Float32Array(objects.length*16), fields=new Uint32Array(records.buffer);
    const unique=new Map<string,{v:number;i:number;object:NonNullable<typeof objects[number]>}>();
    let vertexWords=0,indexWords=0;
    for(const [id,object] of objects.entries()) {
      if(!object)continue;
      let offsets=unique.get(object.key);
      if(!offsets) {
        offsets={v:vertexWords,i:indexWords,object};
        unique.set(object.key,offsets);
        vertexWords+=object.positions.info.length;
        indexWords+=object.indices.info.length;
      }
      records.set(object.transform,id*16);
      fields.set([offsets.v,offsets.i,object.indices.info.length],id*16+12);
    }
    const positions=arena.buffer(await gpu.createBuffer({type:'f32',length:Math.max(1,vertexWords)}));
    const indices=arena.buffer(await gpu.createBuffer({type:'u32',length:Math.max(1,indexWords)}));
    for(const {v,i,object} of unique.values()) {
      await gpu.copyBuffer(object.positions,positions,{targetOffset:v});
      await gpu.copyBuffer(object.indices,indices,{targetOffset:i});
    }
    const matrices=arena.buffer(await gpu.createBuffer({type:'f32',length:records.length},records));
    const params=new Float32Array(23);
    params.set(view.projectionMatrix.clone().multiply(view.matrixWorldInverse).elements);
    const worldToView=view.matrixWorldInverse.elements;
    params.set([-worldToView[2],-worldToView[6],-worldToView[10],-worldToView[14],near],16);
    new Uint32Array(params.buffer).set([width,height],21);
    await gpu.dispatch(kernel,[hit.hits,hit.measurements,positions,indices,matrices,motion],{
      parameters:params,workItems:[width,height,1],
    });
    return motion;
  };
}
