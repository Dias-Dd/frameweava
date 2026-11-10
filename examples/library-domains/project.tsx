import {Composition,Layer,Stage,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {
  createNativeScene,createNativePathTracer,createRefractiveScene,attachNativeCharacter,
  type NativeScene3D,
} from '@frameweave/engine/spatial-creation';
import {exrResource} from '@frameweave/engine/image-effects';

// Small editable contract example. Scene geometry is ordinary data; no Shader.
const mesh={schema:'frameweave.mesh',version:1,id:'panel',coordinates:{spaceId:'model',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:['a','b','c','d'],restPositions:[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]] as [number,number,number][],indices:[0,1,2,0,2,3]};
const camera={projection:'perspective' as const,position:[0,0,3] as [number,number,number],target:[0,0,0] as [number,number,number],near:0.01,far:20,verticalFov:Math.PI/4};
const scene:NativeScene3D={geometries:{panel:mesh},materials:{light:{kind:'emissive',radiance:[2,0.4,0.15]}},nodes:[{id:'panel',geometry:'panel',material:'light'}],sample:()=>({camera})};
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const character={format:'frameweave.character-asset/1',id:'panel',nodes:[{id:'root',name:'root',parent:null,matrix:identity}],primitives:[{id:'shape',node:'root',mesh,material:{id:'ink',color:[0.2,0.5,0.8,1],metalness:0,roughness:0.5,alphaMode:'opaque',alphaCutoff:0.5,doubleSided:true},morphs:[],weights:[]}],clips:[],images:[],diagnostics:[]};

export const direct=defineNativeStage(async init=>{
  // Constructing an EXR source grants no I/O. Declare a Resource before using it.
  const source=exrResource('optional-plate',{selection:{part:0,channels:{r:'Beauty.R',g:'Beauty.G',b:'Beauty.B',a:'Beauty.A'},window:'display'},color:{primaries:'rec709',whitePoint:'D65',transfer:'linear',reference:'scene',range:'full',referenceWhiteNits:100},alpha:'premultiplied'});
  if(typeof source!=='function')throw Error('Expected a declarative source');
  return createNativeScene(init,scene);
});
export const trace=defineNativeStage(init=>createNativePathTracer(init,scene,{samples:2,maxBounces:2,aovs:true,cryptomatte:true}));
export const refractive=defineNativeStage(init=>createRefractiveScene(init,{meshes:[{mesh,color:[0.2,0.5,0.8]}],sample:()=>({camera,droplets:[{center:[0,0,1],radius:0.3}]})}));
export const actor=defineNativeStage(async init=>{
  const asset=await attachNativeCharacter(init,{...scene,geometries:{},materials:{},nodes:[]},character,{id:'actor'});
  const renderer=await createNativeScene(init,asset.scene);
  return {renderAt:renderer.renderAt,async dispose(){try{await renderer.dispose?.();}finally{await asset.dispose();}}};
});
export default <Composition width={64} height={36} fps={24} durationInFrames={2}>
  <Stage id="direct" factory={direct}/><Stage id="trace" factory={trace}/>
  <Stage id="refractive" factory={refractive}/><Stage id="actor" factory={actor}/>
  <Layer source={ref('trace')}/>
</Composition>;
