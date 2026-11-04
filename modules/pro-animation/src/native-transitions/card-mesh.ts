// SPDX-License-Identifier: Apache-2.0
// Selected EffectCraft card timing, jitter and flat-piece lighting equations,
// adapted to the existing native compute / textured mesh / exact visibility.
// No Piece renderer, timeline, private device or CPU RGBA path is imported.
import {EngineError} from '../../../../src/core/errors.ts';
import {gamutMatrix} from '../../../../src/media/color.ts';
import {linear709} from '../../../../src/media/surface.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import type {GpuPixelImage,GpuPixelKernelSource} from '../../../gpu-effects/pixel-types.ts';
import type {GpuComputeKernelSource} from '../../../gpu-effects/compute-types.ts';
import {samePixelColor} from '../../../gpu-effects/pixel-shader.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {cardFields,cardScalar,cardError,cardProjection} from './card-camera.ts';
import type {CardFlipOptions} from './types.ts';
import type {CardMeshControls} from './card-types.ts';

const meshFields=['geometry','camera','lighting','material','positionJitter','rotationJitter','flipDirection','time','backside','rows','columns','outputSize'] as const;
export function usesCardMesh(o:unknown){return !!o&&typeof o==='object'&&meshFields.some(k=>Object.hasOwn(o,k));}
const hash=(x:number,y:number,seed:number)=>{let h=Math.imul(x,0x8da6b343)^Math.imul(y,0xd8163841)^Math.imul(seed,0xcb1ab31f);h^=h>>>13;h=Math.imul(h,0x5bd1e995);h^=h>>>15;return (h&0xffffff)/16777216;};
const common=`
fn noise(x:u32,y:u32,seed:u32)->f32{var h=(x*0x8da6b343u)^(y*0xd8163841u)^(seed*0xcb1ab31fu);h^=h>>13u;h*=0x5bd1e995u;h^=h>>15u;return f32(h&0xffffffu)/16777216.;}
fn unit(v:vec3f)->vec3f{let d=length(v);if(d==0.){return vec3f(0.,0.,-1.);}return v/d;}
fn rx(a:f32)->mat3x3f{let s=sin(a);let c=cos(a);return mat3x3f(vec3f(1.,0.,0.),vec3f(0.,c,s),vec3f(0.,-s,c));}
fn ry(a:f32)->mat3x3f{let s=sin(a);let c=cos(a);return mat3x3f(vec3f(c,0.,-s),vec3f(0.,1.,0.),vec3f(s,0.,c));}
fn rz(a:f32)->mat3x3f{let s=sin(a);let c=cos(a);return mat3x3f(vec3f(c,s,0.),vec3f(-s,c,0.),vec3f(0.,0.,1.));}
fn eye()->vec3f{return vec3f(paramF32(37u),paramF32(38u),paramF32(39u));}
fn gradient(cell:vec2u)->f32{let size=vec2u(paramU32(11u),paramU32(12u));let uv=(vec2f(cell)+.5)/vec2f(f32(paramU32(4u)),f32(paramU32(5u)));let p=min(vec2u(uv*vec2f(size)),size-1u);let i=(p.y*size.x+p.x)*4u;let a=GRADIENT(i+3u);var rgb=vec3f(GRADIENT(i),GRADIENT(i+1u),GRADIENT(i+2u));if(paramU32(10u)==0u){if(a==0.){rgb=vec3f(0.);}else{rgb/=a;}}return clamp(dot(rgb,vec3f(paramF32(13u),paramF32(14u),paramF32(15u))),0.,1.);}
struct Model{rotation:mat3x3f,center:vec3f,back:bool,axis:u32}
fn model(index:u32)->Model{
 let columns=paramU32(4u);let rows=paramU32(5u);let cell=vec2u(index%columns,index/columns);let normalized=vec2f(cell)/max(vec2f(f32(columns),f32(rows))-1.,vec2f(1.));let mode=paramU32(6u);var order=normalized.x;
 if(mode==1u){order=1.-normalized.x;}else if(mode==2u){order=normalized.y;}else if(mode==3u){order=1.-normalized.y;}else if(mode==4u){order=(normalized.x+normalized.y)*.5;}else if(mode==5u){order=(1.-normalized.x+normalized.y)*.5;}else if(mode==6u){order=(normalized.x+1.-normalized.y)*.5;}else if(mode==7u){order=(2.-normalized.x-normalized.y)*.5;}else if(mode==8u){order=gradient(cell);}
 let seed=paramU32(8u);order=mix(order,noise(cell.x,cell.y,seed^0x7177u),paramF32(9u));let width=paramF32(1u);let t=paramF32(0u);var phase=select(0.,1.,t>=order);if(width>0.){phase=clamp((t-order*(1.-width))/width,0.,1.);}if(t<=0.){phase=0.;}if(t>=1.){phase=1.;}
 var axis=paramU32(7u);if(axis==2u){axis=select(0u,1u,noise(cell.x,cell.y,seed^0x55u)>=.5);}var sign=1.;if(paramU32(3u)==1u||paramU32(3u)==2u&&noise(cell.x,cell.y,seed^0x99u)<.5){sign=-1.;}
 let angle=phase*3.141592653589793*sign;var flip=rx(angle);if(axis==1u){flip=ry(angle);}let j=index*6u;let rotation=rz(JITTER(j+5u))*ry(JITTER(j+4u))*rx(JITTER(j+3u))*flip;
 let size=vec2f(paramF32(20u),paramF32(21u));let center=vec3f((vec2f(cell)+.5)/vec2f(f32(columns),f32(rows))*size,0.)+vec3f(JITTER(j),JITTER(j+1u),JITTER(j+2u));let n=rotation*vec3f(0.,0.,-1.);return Model(rotation,center,dot(n,eye()-center)<0.,axis);
}
`;
const computeSource:GpuComputeKernelSource={abiVersion:1,id:'frameweave/pro-animation/card-mesh/geometry',version:'1.0.0',bindings:[{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read_write'},{type:'f32',access:'read_write'}],parameterWords:64,workgroupSize:[64,1,1],code:common.replaceAll('GRADIENT(','load0(').replaceAll('JITTER(','load1(')+`
fn compute(p:vec3u,l:vec3u,w:vec3u){
 let index=p.x/6u;let vertex=p.x%6u;let m=model(index);let corners=array<vec2f,6>(vec2f(-1.,-1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(1.,1.));let local=corners[vertex];
 let columns=paramU32(4u);let rows=paramU32(5u);let size=vec2f(paramF32(20u),paramF32(21u));var at=m.center+m.rotation*vec3f(local*size/vec2f(f32(columns),f32(rows))*.5*paramF32(2u),0.);if(m.back&&paramU32(22u)==0u){at=m.center;}
 store2(p.x*3u,at.x);store2(p.x*3u+1u,at.y);store2(p.x*3u+2u,at.z);
 var uv=local*.5+.5;if(m.back){uv[m.axis^1u]=1.-uv[m.axis^1u];}let cell=vec2u(index%columns,index/columns+select(0u,rows,m.back));
 let interior=vec2f(f32(paramU32(16u)),f32(paramU32(17u)));let block=vec2f(cell)*(interior+2.);uv=(block+1.+uv*interior)/vec2f(f32(paramU32(18u)),f32(paramU32(19u)));store3(p.x*2u,uv.x);store3(p.x*2u+1u,uv.y);
}`};
const atlasSource:GpuPixelKernelSource={abiVersion:2,id:'frameweave/pro-animation/card-mesh/material-atlas',version:'1.0.0',inputCount:2,dataInputs:[{type:'f32'},{type:'f32'}],parameterWords:64,code:common.replaceAll('GRADIENT(','data0(').replaceAll('JITTER(','data1(')+`
fn pm(v:vec4f,a:u32)->vec4f{if(a==1u){return vec4f(v.rgb*v.a,v.a);}if(a==2u){return vec4f(v.rgb,1.);}return v;}
fn at(p:vec2i,back:bool)->vec4f{if(back){return pm(read1(clamp(p,vec2i(0),vec2i(size1())-1)),alpha1());}return pm(read0(clamp(p,vec2i(0),vec2i(size0())-1)),alpha0());}
fn sample(q:vec2f,back:bool)->vec4f{let i=vec2i(floor(q));let f=fract(q);return mix(mix(at(i,back),at(i+vec2i(1,0),back),f.x),mix(at(i+vec2i(0,1),back),at(i+vec2i(1),back),f.x),f.y);}
fn pixel(p:vec2u)->vec4f{
 let interior=vec2u(paramU32(16u),paramU32(17u));let block=p/(interior+2u);let rows=paramU32(5u);let back=block.y>=rows;let cell=vec2u(block.x,block.y%rows);let m=model(cell.y*paramU32(4u)+cell.x);
 let local=(vec2f(clamp(vec2i(p%(interior+2u))-1,vec2i(0),vec2i(interior)-1))+.5)/vec2f(interior);var dimensions=size0();if(back){dimensions=size1();}let q=(vec2f(cell)+local)/vec2f(f32(paramU32(4u)),f32(rows))*vec2f(dimensions)-.5;let v=sample(q,back);
 let view=unit(eye()-m.center);var normal=m.rotation*vec3f(0.,0.,-1.);if(dot(normal,view)<0.){normal=-normal;}let kind=paramU32(23u);var light=vec3f(paramF32(30u),paramF32(31u),paramF32(32u));if(kind==0u){light=unit(vec3f(paramF32(27u),paramF32(28u),paramF32(29u))-m.center);}
 let color=vec3f(paramF32(24u),paramF32(25u),paramF32(26u));var diffuse=1.;var specular=0.;if(kind!=2u){diffuse=max(dot(normal,light),0.);if(diffuse>0.){specular=paramF32(35u)*pow(max(dot(normal,unit(light+view)),0.),paramF32(36u));}}
 let strength=paramF32(40u);let multiplier=mix(vec3f(1.),vec3f(paramF32(33u))+color*(paramF32(34u)*diffuse),strength);return vec4f(v.rgb*multiplier+v.a*color*(specular*strength),v.a);
}`};

export async function recordCardMesh(gpu:NativeGpuScope,from:GpuPixelImage,to:GpuPixelImage,options:CardFlipOptions,context?:FrameContext,defaults?:{width?:number;height?:number}){
 const o=options as CardFlipOptions&CardMeshControls,cap=gpu?.capabilities();if(cap?.backend!=='native-wgpu'||cap.hardwareVerified!==true||cap.nativeMesh?.version!==1)throw new EngineError('E_PA_CARD_INTERFACE','Admitted native mesh raster v1 is required; no approximate/CPU fallback');
 cardFields(o,['progress','format','signal','cells','axis','stagger','shading','transitionWidth','cardScale','columnsFollowRows','order','gradient','timingRandomness','seed',...meshFields]);
 if(o.geometry!==undefined&&!['mesh','orthographic'].includes(o.geometry))cardError('Unknown card geometry profile');if(o.geometry==='orthographic')cardError('3D controls require mesh geometry');
 if(o.signal!==undefined&&!(o.signal instanceof AbortSignal))cardError('AbortSignal required');if(o.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Card wipe cancelled');
 if(o.format!==undefined&&!['rgba16float','rgba32float'].includes(o.format))cardError('Card output must remain RGBA16F/32F');const info=from?.info;
 if(!info)cardError('Native source images required');for(const image of [from,to,...o.gradient?[o.gradient]:[]]){const m=image?.info;if(!m||!['rgba16float','rgba32float'].includes(m.format)||m.color.transfer!=='linear'||m.color.reference!=='scene'||!samePixelColor(m.color,info.color))cardError('Resident professional source/back/gradient images must share scene-linear encoding');}
 const size=o.outputSize??[defaults?.width??info.width,defaults?.height??info.height];if(!Array.isArray(size)||size.length!==2||size.some(v=>!Number.isSafeInteger(v)||v<1))cardError('outputSize requires two positive safe integer pixels');
 const n=(v:any,d:number,k:string,min=-Infinity,max=Infinity)=>cardScalar(v,d,k,context,min,max),p=new Float32Array(64),u=new Uint32Array(p.buffer),w=size[0],h=size[1];
 const count=(v:any,d:number,k:string)=>{const value=n(v,d,k,1);const rounded=Math.round(value);if(!Number.isSafeInteger(rounded)||rounded>2**24)cardError(k+': count must retain exact GPU integer representation');return rounded;};
 if(o.progress===undefined&&!context)cardError('progress or FrameContext required');p[0]=n(o.progress,context?.progress??0,'progress',0,1);if(o.cells!==undefined&&(o.rows!==undefined||o.columns!==undefined))cardError('Specify cells or rows/columns');const cells=o.cells??[8,6];if(!Array.isArray(cells)||cells.length!==2)cardError('cells requires columns and rows');
 const columns=count(o.columns??cells[0],8,'columns'),rows=count(o.rows??cells[1],6,'rows');if(o.columnsFollowRows!==undefined&&typeof o.columnsFollowRows!=='boolean')cardError('columnsFollowRows must be boolean');u[4]=o.columnsFollowRows?rows:columns;u[5]=rows;const cards=u[4]*u[5],vertices=cards*6;
 const exactMax=cap.nativeMesh.exactMaxTriangles;if(exactMax!==undefined&&cards*2>exactMax)throw new EngineError('E_NATIVE_MESH_BUDGET','Exact transparent cards exceed this admitted owner triangle budget',{details:{triangles:cards*2,available:exactMax}});
 const binding=Math.min(cap.limits.maxStorageBufferBindingSize,cap.limits.maxBufferSize??Infinity),pending=gpu.stats?.().pendingPasses??0;
 if(!Number.isSafeInteger(vertices*3*4)||vertices*3*4>binding||typeof cap.maxPendingPasses==='number'&&pending+Math.ceil(cards*6/1000)+3>cap.maxPendingPasses)throw new EngineError('E_NATIVE_BUDGET','Card geometry/control upload exceeds current device or command budget');
 const axes=['x','y','random'],orders=['left-right','right-left','top-bottom','bottom-top','top-left','top-right','bottom-left','bottom-right','gradient'],directions=['positive','negative','random'];if(o.axis!==undefined&&!axes.includes(o.axis)||o.order!==undefined&&!orders.includes(o.order)||o.flipDirection!==undefined&&!directions.includes(o.flipDirection))cardError('Unknown card axis/order/direction');u[7]=axes.indexOf(o.axis??'x');u[6]=orders.indexOf(o.order??'left-right');u[3]=directions.indexOf(o.flipDirection??'positive');if(u[6]===8&&!o.gradient)cardError('Gradient order requires an explicit resident image');
 if(o.transitionWidth!==undefined&&o.stagger!==undefined)cardError('Specify transitionWidth or stagger');p[1]=n(o.transitionWidth,1/(1+n(o.stagger,.75,'stagger',0)),'transitionWidth',0,1);p[2]=n(o.cardScale,1,'cardScale',0);p[9]=n(o.timingRandomness,0,'timingRandomness',0,1);const seed=o.seed??0;if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)cardError('Seed requires uint32');u[8]=seed;
 const projection=cardProjection(o.camera,w,h,context);p.set(projection.eye,37);p[20]=w;p[21]=h;if(o.backside!==undefined&&!['image','none'].includes(o.backside))cardError('Unknown backside');u[22]=Number(o.backside!=='none');
 const tileWidth=Math.ceil(w/u[4]),tileHeight=Math.ceil(h/u[5]),atlasWidth=u[4]*(tileWidth+2),atlasHeight=2*u[5]*(tileHeight+2),atlasBytes=atlasWidth*atlasHeight*16;
 if(!Number.isSafeInteger(atlasBytes)||atlasWidth>0xffffffff||atlasHeight>0xffffffff||atlasBytes>cap.limits.maxStorageBufferBindingSize)throw new EngineError('E_NATIVE_BUDGET','Card atlas exceeds admitted GPU storage binding limit');u[16]=tileWidth;u[17]=tileHeight;u[18]=atlasWidth;u[19]=atlasHeight;
 const tuple=(value:unknown,d:number[],key:string)=>{const a=value??d;if(!Array.isArray(a)||a.length!==d.length)cardError(key+': tuple length mismatch');return (a as any[]).map((v,i)=>n(v,d[i],key+'.'+i));};
 const light=o.lighting??{},material=o.material??{};cardFields(light,['type','position','depth','color','intensity','ambient','composition']);cardFields(material,['diffuse','specular','highlightSharpness']);if(light.type!==undefined&&!['point','distant','composition'].includes(light.type))cardError('Unknown lighting type');
 let color=tuple(light.color,[1,1,1],'light.color'),intensity=n(light.intensity,1,'light.intensity',0),kind=light.type==='point'?0:1,at=tuple(light.position,[.5,.5],'light.position').map((v,k)=>v*[w,h][k]);let position=[...at,-n(light.depth,Math.max(w,h),'light.depth')],direction=position.map((v,k)=>v-[w*.5,h*.5,0][k]);
 if(light.type==='composition'){const c=light.composition;if(!c)cardError('Composition light must be explicitly supplied');cardFields(c!,['kind','position','direction','color','intensity']);if(!['point','distant','ambient'].includes(c!.kind))cardError('Unknown composition light kind');kind=c!.kind==='point'?0:c!.kind==='distant'?1:2;color=tuple(c!.color,[1,1,1],'compositionLight.color');intensity=n(c!.intensity,1,'compositionLight.intensity',0);if(kind===0&&!c!.position||kind===1&&!c!.direction)cardError('Explicit composition light position/direction required');position=tuple(c!.position,[w*.5,h*.5,-Math.max(w,h)],'compositionLight.position');direction=tuple(c!.direction,[0,0,1],'compositionLight.direction').map(v=>-v);}
 u[23]=kind;p.set(color.map(v=>v*intensity),24);p.set(position,27);const length=Math.hypot(...direction);if(kind===1&&length===0)cardError('Distant light direction must be nonzero');p.set(direction.map(v=>length===0?0:v/length),30);p[33]=n(light.ambient,.25,'light.ambient',0);p[34]=n(material.diffuse,.75,'material.diffuse',0);p[35]=n(material.specular,0,'material.specular',0);p[36]=n(material.highlightSharpness,15,'material.highlightSharpness',Number.MIN_VALUE);p[40]=n(typeof o.shading==='boolean'?Number(o.shading):o.shading,1,'shading',0,1);
 const jitter=new Float32Array(cards*6),time=n(o.time,context?.time??0,'time');for(const [group,descriptor]of [[0,o.positionJitter],[1,o.rotationJitter]] as const){if(!descriptor)continue;cardFields(descriptor,['amount','speed']);const amount=tuple(descriptor.amount,[0,0,0],'jitter.amount'),speed=tuple(descriptor.speed,[1,1,1],'jitter.speed');if(amount.some(v=>v!==0)&&o.time===undefined&&!context)cardError('Jitter requires explicit time or FrameContext');for(let index=0;index<cards;index++)for(let axis=0;axis<3;axis++){const x=index%u[4],y=Math.floor(index/u[4]),key=group*3+axis+11,phase=hash(x,y,seed^key)*2*Math.PI,rate=.5+hash(x,y,seed^(key+101)),argument=time*speed[axis]*rate*2*Math.PI+phase;if(!Number.isFinite(argument))cardError('Jitter phase exceeds finite Float64 control arithmetic');let value=amount[axis]*Math.sin(argument);if(group===1)value=(value%360)*Math.PI/180;const f=Math.fround(value);if(!Number.isFinite(f))cardError('Jitter exceeds finite GPU control representation');jitter[index*6+group*3+axis]=f;}}
 const gradient=o.gradient;if(gradient){u[10]=gradient.info.alpha==='premultiplied'?0:gradient.info.alpha==='straight'?1:2;u[11]=gradient.info.width;u[12]=gradient.info.height;const matrix=gamutMatrix(gradient.info.color,linear709);for(let k=0;k<3;k++)p[13+k]=.2126*matrix[0][k]+.7152*matrix[1][k]+.0722*matrix[2][k];}else{u[10]=2;u[11]=u[12]=1;}
 for(const at of [...Array.from({length:18},(_,i)=>24+i),...Array.from({length:3},(_,i)=>13+i)])if(!Number.isFinite(p[at]))cardError('Derived card controls exceed finite GPU representation');
 return withGpuResources(gpu,async arena=>{
  if(gradient&&typeof gpu.imageToBuffer!=='function')throw new EngineError('E_PA_CARD_INTERFACE','Resident image-to-buffer v1 is required for gradient order');
  const g=arena.buffer(gradient?await gpu.imageToBuffer!(gradient,{version:1,signal:o.signal}):await gpu.createBuffer({type:'f32',length:4},Float32Array.of(0,0,0,1))),j=arena.buffer(await gpu.createBuffer({type:'f32',length:jitter.length}));await gpu.writeBuffer(j,jitter);
  const positions=arena.buffer(await gpu.createField({type:'f32',dimensions:[vertices,1,1],components:3,semantic:'position',space:'image',units:'px'})),uvs=arena.buffer(await gpu.createField({type:'f32',dimensions:[vertices,1,1],components:2,semantic:'generic',channels:['u','v']}));
  await gpu.dispatch(await gpu.compileCompute(computeSource),[g,j,positions,uvs],{workItems:[vertices,1,1],parameters:p,signal:o.signal});
  const atlas=arena.image(await gpu.run(await gpu.compile(atlasSource),[from,to],{parameters:p,data:[g,j],output:{width:u[18],height:u[19],format:'rgba32float',alpha:'premultiplied',color:info.color},signal:o.signal}));
  if(o.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Card recording cancelled');const result=arena.image(await gpu.drawMesh({positions,count:vertices,matrix:projection.matrix,texture:{version:1,image:atlas,uvs,filter:'linear',addressU:'clamp',addressV:'clamp'},raster:{version:1,mode:'depth-peel'},output:{width:w,height:h,format:o.format??info.format,alpha:'premultiplied',color:info.color}}));if(o.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Card recording cancelled');return arena.keep(result);
 });
}
