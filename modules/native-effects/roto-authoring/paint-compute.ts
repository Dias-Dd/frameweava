import {compute} from './contour-compute.ts';
import {math} from '../keying/kernels.ts';
import {brushMath} from './kernels.ts';
const R={type:'f32',access:'read'} as const,W={type:'f32',access:'read_write'} as const;
const all=brushMath.slice(math.length,brushMath.indexOf('fn source'));
export const height=compute('dab-height-field',[R,W],all.replaceAll('data0(','load0(')+`fn compute(p:vec3u,_l:vec3u,_g:vec3u){let x=add(uintPair(p.x),scalar(.5));let y=add(uintPair(p.y),scalar(.5));let coverage=strokeCoverage(x,y);store1(p.y*paramU32(4u)+p.x,rounded(multiply(coverage,argP(12u))).x);}`);
const tip=brushMath.slice(math.length,brushMath.indexOf('fn strokeCoverage')).replaceAll('data0(','load1(');
const sampling=`
fn rgbaAt(q:vec2i)->Pair{let w=paramU32(4u);let h=paramU32(5u);let p=clamp(q,vec2i(0),vec2i(i32(w)-1,i32(h)-1));let i=(u32(p.y)*w+u32(p.x))*4u;return pair(vec4f(load0(i),load0(i+1u),load0(i+2u),load0(i+3u)));}
fn rgbaSample(x0:Pair,y0:Pair)->Pair{let x=subtract(x0,scalar(.5));let y=subtract(y0,scalar(.5));let ix=floorP(x);let iy=floorP(y);let q=vec2i(i32(rounded(ix).x),i32(rounded(iy).x));let fx=subtract(x,ix);let fy=subtract(y,iy);return mixP(mixP(rgbaAt(q),rgbaAt(q+vec2i(1,0)),fx),mixP(rgbaAt(q+vec2i(0,1)),rgbaAt(q+vec2i(1)),fx),fy);}
`;
export const pickup=compute('wet-pigment-reservoir',[R,R,R,W],tip+sampling+`fn compute(_p:vec3u,_l:vec3u,_g:vec3u){let j=paramU32(6u);let picked=rgbaSample(table(j*8u),table(j*8u+1u));let old=pair(vec4f(load2(0u),load2(1u),load2(2u),load2(3u)));let v=mixP(old,picked,argP(15u));let roundedValue=published(v);for(var k=0u;k<4u;k++){store3(k,roundedValue[k]);}}`,[1,1,1]);
export const smear=compute('ordered-smudge-pigment',[R,R,W,R],tip+sampling+`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let j=paramU32(6u);let x=add(uintPair(p.x),scalar(.5));let y=add(uintPair(p.y),scalar(.5));let original=rgbaAt(vec2i(p.xy));let coverage=multiply(multiply(tip(x,y,j),table(j*8u+7u)),multiply(argP(0u),argP(12u)));var value=rgbaSample(add(x,argP(13u)),add(y,argP(14u)));if(paramU32(0u)==1u){let pigment=pair(vec4f(load3(0u),load3(1u),load3(2u),load3(3u)));value=mixP(rgba(triple(1u),scalar(1.)),pigment,argP(16u));let alpha=multiply(ch(value,3u),coverage);value=add(multiply(value,coverage),multiply(original,subtract(scalar(1.),alpha)));}else{value=mixP(original,value,coverage);}let i=(p.y*paramU32(4u)+p.x)*4u;let v=published(value);for(var k=0u;k<4u;k++){store2(i+k,v[k]);}}
`);
