import type {FrameContext} from '../../../../src/core/types.ts';
import {pixelsFromSurface,linear709} from '../../../../src/media/surface.ts';
import {gamutMatrix} from '../../../../src/media/color.ts';
import type {GpuPixelScope,GpuPixelImage,GpuPixelKernelSourceV2} from '../../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer,GpuComputeKernelSource} from '../../../gpu-effects/compute-types.ts';
import {arithmetic} from '../arithmetic.ts';
import {common} from './kernels.ts';
import {fields,number,fail,type OutputOptions} from '../parameters.ts';
export interface AutoLevelsOptions extends OutputOptions {amount?:import('../../../../src/core/types.ts').Signal<number>;outputBlack?:import('../../../../src/core/types.ts').Signal<number>;outputWhite?:import('../../../../src/core/types.ts').Signal<number>}
export interface EqualizeOptions extends AutoLevelsOptions {bins?:number}
export type AutoColorOptions=Pick<AutoLevelsOptions,'amount'|'format'|'signal'>;
export interface StatisticsFilters {
 autoLevels(image:GpuPixelImage,options?:AutoLevelsOptions):Promise<GpuPixelImage>;
 autoContrast(image:GpuPixelImage,options?:AutoLevelsOptions):Promise<GpuPixelImage>;
 autoColor(image:GpuPixelImage,options?:AutoColorOptions):Promise<GpuPixelImage>;
 equalize(image:GpuPixelImage,options?:EqualizeOptions):Promise<GpuPixelImage>;
}
const computeCommon=arithmetic+`
fn scalar(v:f32)->Pair{return pair(vec4f(v));}
fn floor_pair(v:Pair)->f32{var r=floor(v.hi.x);let t=subtract(v,scalar(r));if(greater(scalar(0.),t)){r-=1.;}else if(!greater(scalar(1.),t)){r+=1.;}return r;}
`;
const compute=(id:string,bindings:GpuComputeKernelSource['bindings'],words:number,code:string,group=false):GpuComputeKernelSource=>({abiVersion:1,id:'frameweave/foundations/'+id,version:'1.0.0',bindings,parameterWords:words,workgroupSize:[32,1,1],mode:group?'workgroup':'element',code:computeCommon+code});
// Statistics are typed data, not Alpha-constrained images. 32-lane reductions
// use compensated normalized sums and ignore undefined zero-coverage colour.
export const statsKernel=compute('colour-statistics',[{type:'f32',access:'read'},{type:'f32',access:'read_write'}],11,`
var<workgroup> mins:array<vec4f,32>;var<workgroup> maxs:array<vec4f,32>;var<workgroup> highs:array<vec4f,32>;var<workgroup> lows:array<vec4f,32>;var<workgroup> counts:array<f32,32>;
fn compute(id:vec3u,local:vec3u,group:vec3u){let index=id.y*paramU32(1u)+id.x;let lane=local.x;var lo=vec4f(0.);var hi=vec4f(0.);var sum=pair(vec4f(0.));var count=0.;if(index<paramU32(0u)){
 if(paramU32(2u)==0u){let p=index*4u;let a=load0(p+3u);let bits=bitcast<vec4u>(vec4f(load0(p),load0(p+1u),load0(p+2u),a))&vec4u(0x7fffffffu);if(any((bits!=vec4u(0u))&((bits<vec4u(0x00800000u))|(bits>=vec4u(0x7f800000u))))){store1(0u,bitcast<f32>(0x7fc00000u|(id.x&1u)));}if(a>0.){var v=vec3f(load0(p),load0(p+1u),load0(p+2u));if(paramU32(10u)!=1u){v=v/a;}var y=scalar(0.);for(var c=0u;c<3u;c++){y=add(y,multiply(scalar(v[c]),constant(paramF32(4u+2u*c),paramF32(5u+2u*c))));}lo=vec4f(v,rounded(y).x);hi=lo;sum=divide(pair(vec4f(v,0.)),scalar(f32(paramU32(3u))));count=1.;}}
 else{let p=index*15u;lo=vec4f(load0(p),load0(p+1u),load0(p+2u),load0(p+13u));hi=vec4f(load0(p+3u),load0(p+4u),load0(p+5u),load0(p+14u));sum=Pair(vec4f(load0(p+6u),load0(p+7u),load0(p+8u),0.),vec4f(load0(p+9u),load0(p+10u),load0(p+11u),0.));count=load0(p+12u);}}
 mins[lane]=lo;maxs[lane]=hi;highs[lane]=sum.hi;lows[lane]=sum.lo;counts[lane]=count;workgroupBarrier();
 for(var n=16u;n>0u;n/=2u){if(lane<n){let other=lane+n;if(counts[lane]==0.){mins[lane]=mins[other];maxs[lane]=maxs[other];}else if(counts[other]>0.){mins[lane]=min(mins[lane],mins[other]);maxs[lane]=max(maxs[lane],maxs[other]);}counts[lane]+=counts[other];let s=add(Pair(highs[lane],lows[lane]),Pair(highs[other],lows[other]));highs[lane]=s.hi;lows[lane]=s.lo;}workgroupBarrier();}
 if(lane==0u){let p=(group.y*(paramU32(1u)/32u)+group.x)*15u;for(var c=0u;c<3u;c++){store1(p+c,mins[0][c]);store1(p+3u+c,maxs[0][c]);store1(p+6u+c,highs[0][c]);store1(p+9u+c,lows[0][c]);}store1(p+12u,counts[0]);store1(p+13u,mins[0].a);store1(p+14u,maxs[0].a);}}
`,true);
export const histogramKernel=compute('colour-histogram',[{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'u32',access:'read_write',atomic:true}],4,`
fn compute(id:vec3u,local:vec3u,group:vec3u){let index=id.y*paramU32(0u)+id.x;let p=index*4u;if(p+3u>=dataLength0()||load0(p+3u)==0.){return;}let bins=paramU32(1u);for(var c=0u;c<3u;c++){var v=scalar(load0(p+c));if(paramU32(2u)!=1u){v=divide(v,scalar(load0(p+3u)));}let lo=scalar(load1(c));let hi=scalar(load1(c+3u));var bin=0u;if(greater(hi,lo)){let t=multiply(divide(subtract(v,lo),subtract(hi,lo)),scalar(f32(bins)));bin=u32(clamp(floor_pair(t),0.,f32(bins-1u)));}_=atomicAdd2(c*bins+bin,1u);}}
`);
export const cdfKernel=compute('colour-cdf',[{type:'u32',access:'read'},{type:'f32',access:'read_write'}],1,`
fn compute(id:vec3u,local:vec3u,group:vec3u){if(id.x>=3u){return;}let n=paramU32(0u);var total=0u;var first=0u;for(var j=0u;j<n;j++){let count=load0(id.x*n+j);if(first==0u&&count>0u){first=count;}total+=count;}var cumulative=0u;for(var j=0u;j<n;j++){cumulative+=load0(id.x*n+j);var value=0.;if(total>first&&cumulative>=first){value=f32(cumulative-first)/f32(total-first);}store1(id.x*n+j,value);}}
`);
export const autoKernel:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/foundations/auto-correction',version:'1.0.0',inputCount:1,dataInputs:[{type:'f32'},{type:'f32'}],parameterWords:12,code:common+`
fn pixel(p:vec2u)->vec4f{let v=input(vec2i(p),false);if(v.a==0.||data0(12u)==0.){return v;}var out=v;let mode=paramU32(0u);for(var c=0u;c<3u;c++){let x=divide(scalar(v[c]),scalar(v.a));var result=x;var lo=scalar(data0(c));var hi=scalar(data0(c+3u));if(mode==1u){lo=scalar(data0(13u));hi=scalar(data0(14u));}
 if(mode==2u){var mapped=scalar(0.);for(var j=0u;j<3u;j++){let sum=constant(data0(6u+j),data0(9u+j));mapped=add(mapped,multiply(sum,coeff(4u+2u*j)));}let sum=constant(data0(6u+c),data0(9u+c));if(greater(absolute(sum),scalar(0.))){result=multiply(x,divide(mapped,sum));}}
 else if(mode==3u){if(greater(hi,lo)){let t=multiply(divide(subtract(x,lo),subtract(hi,lo)),scalar(f32(paramU32(10u))));let bin=u32(clamp(floor_pair(t),0.,f32(paramU32(10u)-1u)));let y=scalar(data1(c*paramU32(10u)+bin));result=add(scalar(paramF32(2u)),multiply(y,scalar(paramF32(3u)-paramF32(2u))));}}
 else if(greater(hi,lo)){result=add(scalar(paramF32(2u)),multiply(divide(subtract(x,lo),subtract(hi,lo)),scalar(paramF32(3u)-paramF32(2u))));}
 out[c]=rounded(interpolate(scalar(v[c]),multiply(result,scalar(v.a)),scalar(paramF32(1u)))).x;}return out;}`};
/** Native image-data v1 stays on the same GPU owner. Older Web scopes retain
 * their explicit readback/upload adapter; the existing statistics are reused. */
export function createStatisticsFilters(scope:GpuPixelScope,context?:FrameContext,track:(image:GpuPixelImage)=>GpuPixelImage=v=>v,signal?:AbortSignal):StatisticsFilters{
 async function automatic(i:GpuPixelImage,o:EqualizeOptions,mode:number){fields(o,mode===3?['amount','outputBlack','outputWhite','bins']:mode===2?['amount']:['amount','outputBlack','outputWhite'],['autoLevels','autoContrast','autoColor','equalize'][mode]);const n=(v:Parameters<typeof number>[0],d:number,name:string,min=-Infinity,max=Infinity)=>number(v,d,name,context,min,max),amount=n(o.amount,1,'amount',0,1),black=n(o.outputBlack,0,'outputBlack'),white=n(o.outputWhite,1,'outputWhite'),bins=o.bins??256;if(white<=black||!Number.isSafeInteger(bins)||bins<2||bins>Math.floor(0xffffffff/3))fail('Ordered output range and valid uint32 histogram size required');const cancel=o.signal??signal,owned=new Set<GpuDataBuffer>();const m=gamutMatrix(i.info.color,linear709),weights=[0,1,2].flatMap(c=>{const v=.2126*m[0][c]+.7152*m[1][c]+.0722*m[2][c],h=Math.fround(v);return [h,Math.fround(v-h)];});
  try{const raw=scope.imageToBuffer?await scope.imageToBuffer(i,{version:1,signal:cancel}):await scope.createField({type:'f32',dimensions:[i.info.width,i.info.height,1],components:4,semantic:'generic',channels:['r','g','b','a'],metadata:{source:'surface-components',alpha:i.info.alpha}},pixelsFromSurface(await scope.readback(i,{signal:cancel})));owned.add(raw);let input=raw,count=i.info.width*i.info.height,stats:GpuDataBuffer|undefined;
   const k=await scope.compileCompute(statsKernel);let first=true;do{const cols=Math.min(16384,Math.max(32,Math.ceil(Math.sqrt(count)/32)*32)),rows=Math.ceil(count/cols),groups=cols/32*rows,mapped=await scope.createBuffer({type:'f32',length:groups*15});owned.add(mapped);const p=Uint32Array.of(count,cols,Number(!first),i.info.width*i.info.height,0,0,0,0,0,0,Number(i.info.alpha==='straight'));new Float32Array(p.buffer).set(weights,4);if(scope.stats().pendingPasses>=scope.capabilities().maxPendingPasses)await scope.complete({signal:cancel});await scope.dispatch(k,[input,mapped],{workItems:[cols,rows,1],parameters:p,signal:cancel});if(input!==raw){owned.delete(input);await scope.releaseBuffer(input);}input=mapped;stats=mapped;count=groups;first=false;}while(count>1);
   let cdf=await scope.createBuffer({type:'f32',length:mode===3?bins*3:1});owned.add(cdf);if(mode===3){const hist=await scope.createBuffer({type:'u32',length:bins*3});owned.add(hist);await scope.clearBuffer(hist);await scope.dispatch(await scope.compileCompute(histogramKernel),[raw,stats!,hist],{workItems:[i.info.width,i.info.height,1],parameters:Uint32Array.of(i.info.width,bins,Number(i.info.alpha==='straight'),0),signal:cancel});await scope.dispatch(await scope.compileCompute(cdfKernel),[hist,cdf],{workItems:[3,1,1],parameters:Uint32Array.of(bins),signal:cancel});}
   const p=Float32Array.from([0,amount,black,white,...weights,0,0]),u=new Uint32Array(p.buffer);u[0]=mode;u[10]=bins;if(scope.stats().pendingPasses>=scope.capabilities().maxPendingPasses)await scope.complete({signal:cancel});const result=await scope.run(await scope.compile(autoKernel),[i],{parameters:p,data:[stats!,cdf],output:{format:o.format??i.info.format,alpha:'premultiplied'},signal:cancel});return track(result);
  }finally{for(const b of Array.from(owned).reverse())await scope.releaseBuffer(b);}
 }
 return {
  async autoLevels(i,o={}){return automatic(i,o,0);},
  async autoContrast(i,o={}){return automatic(i,o,1);},
  async autoColor(i,o={}){return automatic(i,o,2);},
  async equalize(i,o={}){return automatic(i,o,3);},
 };
}
