import type {GpuPixelKernelSourceV2} from '../../gpu-effects/pixel-types.ts';
import type {GpuComputeKernelSource} from '../../gpu-effects/compute-types.ts';
import {math} from '../keying/kernels.ts';
import {guarded} from '../geometry/arithmetic.ts';
const image=math+`
fn source(p:vec2i)->Pair{let q=clamp(p,vec2i(0),vec2i(size0())-1);return associate(read0(q),alpha0());}
`;
/** Source iris row spans and prefix-gather idea retain audited EffectCraft math.
 * Prefix carries hi/lo, so large cancelling signed HDR rows are not F32 summed. */
export const apertureBlur:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/restoration/aperture-blur',version:'1.0.0',inputCount:1,parameterWords:128,dataInputs:[{type:'f32'},{type:'i32'}],code:guarded(image+`
fn prefix(x:u32,y:u32)->Pair{let i=(y*(size0().x+1u)+x)*8u;return Pair(vec4f(data0(i),data0(i+1u),data0(i+2u),data0(i+3u)),vec4f(data0(i+4u),data0(i+5u),data0(i+6u),data0(i+7u)));}
fn pixel(p:vec2u)->vec4f{let width=i32(size0().x);let height=i32(size0().y);var sum=scalar(0.);for(var s=0u;s<paramU32(1u);s++){let row=clamp(i32(p.y)+data1(s*3u),0,height-1);let lo=i32(p.x)+data1(s*3u+1u);let hi=i32(p.x)+data1(s*3u+2u);let a=max(0,lo);let b=min(width-1,hi);if(a<=b){sum=add(sum,subtract(prefix(u32(b+1),u32(row)),prefix(u32(a),u32(row))));}let left=max(0,min(hi,-1)-lo+1);let right=max(0,hi-max(lo,width)+1);if(left>0){sum=add(sum,multiply(source(vec2i(0,row)),uintPair(u32(left))));}if(right>0){sum=add(sum,multiply(source(vec2i(width-1,row)),uintPair(u32(right))));}}return published(mixP(source(vec2i(p)),divide(sum,argP(0u)),argP(30u)));}
`)};
/** Variable-CoC filtering uses a continuous one-pixel aperture edge, independently
 * normalized per source. It is not the discrete constant iris span contract. */
function aperture(vertexRead:string){return `
fn vertex(i:u32)->Pair{return constant(${vertexRead}(i*2u),${vertexRead}(i*2u+1u));}
fn footprint(delta:vec2i,radius:Pair)->Pair{let x=scalar(f32(delta.x));let y=scalar(f32(delta.y));if(!greater(radius,scalar(0.))){return scalar(select(0.,1.,all(delta==vec2i(0))));}let circle=subtract(radius,sqrtPair(add(multiply(x,x),multiply(y,y))));var clearance=circle;let blades=paramU32(2u);if(blades>=3u&&arg(2u)<1.){var polygon=scalar(0.);for(var k=0u;k<blades;k++){let next=(k+1u)%blades;let x0=multiply(vertex(k*2u),radius);let y0=multiply(vertex(k*2u+1u),radius);let x1=multiply(vertex(next*2u),radius);let y1=multiply(vertex(next*2u+1u),radius);let ex=subtract(x1,x0);let ey=subtract(y1,y0);let side=divide(subtract(multiply(ex,subtract(y,y0)),multiply(ey,subtract(x,x0))),sqrtPair(add(multiply(ex,ex),multiply(ey,ey))));if(k==0u||greater(polygon,side)){polygon=side;}}clearance=mixP(polygon,circle,argP(2u));}return clampP(add(clearance,scalar(.5)));}
`}
export const footprintNorm:GpuComputeKernelSource={abiVersion:1,id:'frameweave/restoration/footprint-normalization',version:'1.0.0',parameterWords:128,bindings:[{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read_write'}],workgroupSize:[8,8,1],code:guarded(math+aperture('load1')+`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let i=p.y*paramU32(0u)+p.x;let radius=abs(load0(i*2u));if(load0(i*2u+1u)==0.||radius==0.){store2(i,1.);return;}let reach=i32(ceil(radius+.5));var sum=scalar(0.);for(var y=-reach;y<=reach;y++){for(var x=-reach;x<=reach;x++){sum=add(sum,footprint(vec2i(x,y),scalar(radius)));}}store2(i,rounded(sum).x);}
`)};
export const depthBlur:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/restoration/layered-dof',version:'1.0.0',inputCount:1,parameterWords:128,dataInputs:[{type:'f32'},{type:'f32'},{type:'f32'}],code:guarded(image+aperture('data2')+`
fn pixel(p:vec2u)->vec4f{let reach=i32(paramU32(1u));var nearSum=scalar(0.);var farSum=scalar(0.);var nearWeight=scalar(0.);var farWeight=scalar(0.);for(var y=-reach;y<=reach;y++){for(var x=-reach;x<=reach;x++){let at=vec2i(p)+vec2i(x,y);let q=clamp(at,vec2i(0),vec2i(size0())-1);let i=u32(q.y)*size0().x+u32(q.x);let valid=data0(i*2u+1u)!=0.;var radius=scalar(0.);if(valid){radius=scalar(data0(i*2u));}let weight=divide(footprint(vec2i(-x,-y),absPair(radius)),scalar(data1(i)));if(!greater(weight,scalar(0.))){continue;}let v=source(q);if(greater(scalar(0.),radius)){nearSum=add(nearSum,multiply(v,weight));nearWeight=add(nearWeight,weight);}else{farSum=add(farSum,multiply(v,weight));farWeight=add(farWeight,weight);}}}var foreground=scalar(0.);var background=scalar(0.);if(greater(nearWeight,scalar(0.))){foreground=divide(nearSum,maxP(scalar(1.),nearWeight));}if(greater(farWeight,scalar(0.))){background=divide(farSum,farWeight);}let result=add(foreground,multiply(background,subtract(scalar(1.),ch(foreground,3u))));return published(mixP(source(vec2i(p)),result,argP(30u)));}
`)};
export const tiltBlur:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/restoration/tilt-shift',version:'1.0.0',inputCount:1,parameterWords:128,dataInputs:[{type:'f32'}],code:guarded(image+`
fn sampleColor(x:Pair,y:Pair)->Pair{let fx=floorP(x);let fy=floorP(y);let origin=vec2i(i32(clamp(rounded(fx).x,-1.,f32(size0().x))),i32(clamp(rounded(fy).x,-1.,f32(size0().y))));let tx=subtract(x,fx);let ty=subtract(y,fy);return mixP(mixP(source(origin),source(origin+vec2i(1,0)),tx),mixP(source(origin+vec2i(0,1)),source(origin+vec2i(1)),tx),ty);}
fn sampleValue(i:u32)->Pair{return constant(data0(i*2u),data0(i*2u+1u));}
fn pixel(p:vec2u)->vec4f{let distance=absPair(add(multiply(subtract(scalar(f32(p.x)+.5),argP(0u)),argP(2u)),multiply(subtract(scalar(f32(p.y)+.5),argP(1u)),argP(3u))));let t=ramp(distance,times(argP(4u),.5),argP(5u));let radius=multiply(argP(6u),t);var result=scalar(0.);for(var j=0u;j<paramU32(1u);j++){let x=add(scalar(f32(p.x)),multiply(sampleValue(j*3u),radius));let y=add(scalar(f32(p.y)),multiply(sampleValue(j*3u+1u),radius));result=add(result,multiply(sampleColor(x,y),sampleValue(j*3u+2u)));}return published(mixP(source(vec2i(p)),result,argP(30u)));}
`)};
