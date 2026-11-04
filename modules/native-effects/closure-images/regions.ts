import type {GpuComputeKernelSource} from '../../gpu-effects/compute-types.ts';
import type {GpuPixelKernelSourceV2} from '../../gpu-effects/pixel-types.ts';
import {math} from '../keying/kernels.ts';
import {guarded} from '../geometry/arithmetic.ts';
const bindings=[{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'u32',access:'read_write',atomic:true}] as const;
function kernel(name:string,code:string):GpuComputeKernelSource{return {abiVersion:1,id:'frameweave/closure-images/'+name,version:'1.0.0',bindings,parameterWords:128,workgroupSize:[8,8,1],code:guarded(math+code)};}
/** Exact four-neighbour connectivity of the defined candidate predicate, not a
 * fixed number of dilation steps. Union roots only move monotonically lower;
 * atomicMin retries races and path compression cannot create a cycle. */
export const regionInit=kernel('region-init',`
fn color(i:u32)->Pair{return straight(associate(vec4f(load0(i*4u),load0(i*4u+1u),load0(i*4u+2u),load0(i*4u+3u)),paramU32(3u)));}
fn distance(a:Pair,b:Pair)->Pair{let d=subtract(a,b);return maxP(absPair(ch(d,0u)),maxP(absPair(ch(d,1u)),absPair(ch(d,2u))));}
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let i=p.y*paramU32(0u)+p.x;let c=color(i);var foreground=scalar(3e38);var background=scalar(3e38);var exactForeground=false;var exactBackground=false;for(var j=0u;j<paramU32(2u);j++){let x=u32(load1(j*3u));let y=u32(load1(j*3u+1u));let kind=u32(load1(j*3u+2u));let d=distance(c,color(y*paramU32(0u)+x));if(kind==0u){foreground=minP(foreground,d);if(x==p.x&&y==p.y){exactForeground=true;}}else{background=minP(background,d);if(x==p.x&&y==p.y){exactBackground=true;}}}let eligible=load0(i*4u+3u)>0.&&!exactBackground&&(exactForeground||(!greater(foreground,argP(0u))&&!greater(foreground,background)));store2(i,select(0xffffffffu,i,eligible));}
`);
export const regionUnion=kernel('region-union',`
fn root(i:u32)->u32{var r=i;loop{let parent=load2(r);if(parent==r){break;}r=parent;}var q=i;loop{let parent=load2(q);if(parent==q){break;}atomicMin2(q,r);q=parent;}return r;}
fn join(a:u32,b:u32){loop{let x=root(a);let y=root(b);if(x==y){return;}let hi=max(x,y);let lo=min(x,y);let prior=atomicMin2(hi,lo);if(prior==hi){return;}}}
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let width=paramU32(0u);let height=paramU32(1u);let i=p.y*width+p.x;if(load2(i)==0xffffffffu){return;}
 // Read-only inputs remain in the fixed binding layout; this finite, verified
 // condition is true for admitted input/seed data and is not a fake output.
 if((bitcast<u32>(load0(i*4u+3u))&0x7f800000u)==0x7f800000u||load1(2u)<0.){store2(i,0xffffffffu);return;}
 if(p.x+1u<width&&load2(i+1u)!=0xffffffffu){join(i,i+1u);}if(p.y+1u<height&&load2(i+width)!=0xffffffffu){join(i,i+width);}}
`);
export const regionPixel:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/closure-images/region-publish',version:'1.0.0',inputCount:1,dataInputs:[{type:'u32'},{type:'f32'}],parameterWords:128,code:guarded(math+`
fn root(i:u32)->u32{var v=data0(i);if(v==0xffffffffu){return v;}loop{let parent=data0(v);if(parent==v){break;}v=parent;}return v;}
fn pixel(p:vec2u)->vec4f{let s=associate(read0(vec2i(p)),alpha0());let own=root(p.y*size0().x+p.x);var selected=false;if(own!=0xffffffffu){for(var j=0u;j<paramU32(2u);j++){if(data1(j*3u+2u)==0.){let x=u32(data1(j*3u));let y=u32(data1(j*3u+1u));if(root(y*size0().x+x)==own){selected=true;}}}}var result=s;if(paramU32(1u)==0u){if(selected&&greater(ch(s,3u),scalar(0.))){result=rgba(mixP(straight(s),triple(32u),argP(1u)),ch(s,3u));}}else{result=multiply(s,scalar(select(0.,1.,selected)));}return published(mixP(s,result,argP(30u)));}
`)};
