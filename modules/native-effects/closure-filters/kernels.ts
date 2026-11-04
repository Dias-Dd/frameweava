import type {GpuPixelKernelSourceV2} from '../../gpu-effects/pixel-types.ts';
import {math} from '../keying/kernels.ts';
import {guarded} from '../geometry/arithmetic.ts';
/** Compensated RGB/HSL math shared by the image and non-colour channel pack.
 * HSL is normalized with an explicitly retained offset/span, never HDR clipped. */
export const channelMath=math+`
struct HSL{h:Pair,s:Pair,l:Pair,offset:Pair,span:Pair}
fn fractP(v:Pair)->Pair{return subtract(v,floorP(v));}
fn encodeHsl(v:Pair)->HSL{let low=minP(ch(v,0u),minP(ch(v,1u),ch(v,2u)));let high=maxP(ch(v,0u),maxP(ch(v,1u),ch(v,2u)));let offset=minP(scalar(0.),low);let span=subtract(maxP(scalar(1.),high),offset);let c=divide(subtract(v,offset),span);let lo=minP(ch(c,0u),minP(ch(c,1u),ch(c,2u)));let hi=maxP(ch(c,0u),maxP(ch(c,1u),ch(c,2u)));let d=subtract(hi,lo);let l=times(add(hi,lo),.5);var h=scalar(0.);var s=scalar(0.);if(greater(d,scalar(0.))){s=divide(d,subtract(scalar(1.),absPair(subtract(times(l,2.),scalar(1.)))));if(!greater(hi,ch(c,0u))){h=divide(subtract(ch(c,1u),ch(c,2u)),d);}else if(!greater(hi,ch(c,1u))){h=add(scalar(2.),divide(subtract(ch(c,2u),ch(c,0u)),d));}else{h=add(scalar(4.),divide(subtract(ch(c,0u),ch(c,1u)),d));}h=fractP(times(h,1./6.));}return HSL(h,s,l,offset,span);}
fn decodeHsl(v:HSL)->Pair{let chroma=multiply(subtract(scalar(1.),absPair(subtract(times(v.l,2.),scalar(1.)))),v.s);let hh=times(fractP(v.h),6.);let t=subtract(hh,times(floorP(times(hh,.5)),2.));let xx=multiply(chroma,subtract(scalar(1.),absPair(subtract(t,scalar(1.)))));var c=rgb(chroma,xx,scalar(0.),scalar(0.));let sector=u32(floor(hh.hi.x));switch sector{case 1u:{c=rgb(xx,chroma,scalar(0.),scalar(0.));}case 2u:{c=rgb(scalar(0.),chroma,xx,scalar(0.));}case 3u:{c=rgb(scalar(0.),xx,chroma,scalar(0.));}case 4u:{c=rgb(xx,scalar(0.),chroma,scalar(0.));}case 5u:{c=rgb(chroma,scalar(0.),xx,scalar(0.));}default:{}}return add(multiply(add(c,subtract(v.l,times(chroma,.5))),v.span),v.offset);}
fn random(x:i32,y:i32,seed:u32)->f32{var h=(bitcast<u32>(x)*0x8da6b343u)^(bitcast<u32>(y)*0xd8163841u)^(seed*0xcb1ab31fu);h^=h>>13u;h*=0x5bd1e995u;h^=h>>15u;return f32(h&0xffffffu)/16777216.;}
`;
export const filterKernel:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/closure-filters/image',version:'1.0.0',inputCount:2,dataInputs:[{type:'f32'}],parameterWords:128,code:guarded(channelMath+`
fn clipped(p:vec2i)->vec2i{return clamp(p,vec2i(0),vec2i(size0())-1);}
fn src(p:vec2i)->Pair{return associate(read0(clipped(p)),alpha0());}
fn col(p:vec2i)->Pair{let v=src(p);return straight(v);}
fn refcol(p:vec2i)->Pair{return straight(associate(read1(clipped(p)),alpha1()));}
fn samplePM(x:Pair,y:Pair)->Pair{let xx=maxP(scalar(0.),minP(x,scalar(f32(size0().x-1u))));let yy=maxP(scalar(0.),minP(y,scalar(f32(size0().y-1u))));let ix=floorP(xx);let iy=floorP(yy);let q=vec2i(i32(rounded(ix).x),i32(rounded(iy).x));let fx=subtract(xx,ix);let fy=subtract(yy,iy);return mixP(mixP(src(q),src(q+vec2i(1,0)),fx),mixP(src(q+vec2i(0,1)),src(q+vec2i(1)),fx),fy);}
fn table(i:u32)->Pair{return constant(data0(i*2u),data0(i*2u+1u));}
fn finish(p:vec2i,c:Pair)->vec4f{let s=src(p);let a=ch(s,3u);if(!greater(a,scalar(0.))){return published(s);}return published(rgba(mixP(col(p),c,argP(30u)),a));}
fn convolution(p:vec2i,flip:bool)->Pair{let w=paramU32(1u);let h=paramU32(2u);var sum=scalar(0.);for(var y=0u;y<h;y++){for(var x=0u;x<w;x++){var d=vec2i(i32(x)-i32(w/2u),i32(y)-i32(h/2u));if(flip){d=-d;}let q=p+d;let sz=vec2i(size0());let wrapped=((q%sz)+sz)%sz;sum=add(sum,multiply(col(wrapped),table(y*w+x)));}}return sum;}
fn selected(c:Pair,channel:u32)->Pair{if(channel==4u){return luminanceP(c);}return ch(c,channel);}
fn denominator(v:Pair)->Pair{if(!greater(absPair(v),argP(0u))){if(greater(scalar(0.),v)){return negate(argP(0u));}return argP(0u);}return v;}
fn calculate(p:vec2i)->Pair{let a=selected(rgb(ch(col(p),0u),ch(col(p),1u),ch(col(p),2u),ch(src(p),3u)),paramU32(1u));let r=associate(read1(clipped(p)),alpha1());let b=selected(rgb(ch(refcol(p),0u),ch(refcol(p),1u),ch(refcol(p),2u),ch(r,3u)),paramU32(2u));var v=add(a,b);switch paramU32(3u){case 1u:{v=subtract(a,b);}case 2u:{v=multiply(a,b);}case 3u:{v=divide(a,denominator(b));}case 4u:{v=minP(a,b);}case 5u:{v=maxP(a,b);}case 6u:{v=absPair(subtract(a,b));}default:{}}return rgb(v,v,v,scalar(0.));}
fn radial(p:vec2i,mode:u32)->Pair{var dx=subtract(scalar(f32(p.x)),argP(0u));var dy=subtract(scalar(f32(p.y)),argP(1u));if(mode==2u){let i=(u32(p.y)*size0().x+u32(p.x))*2u;dx=scalar(data0(i));dy=scalar(data0(i+1u));if((bitcast<u32>(dx.hi.x)&0x7f800000u)==0x7f800000u||(bitcast<u32>(dy.hi.x)&0x7f800000u)==0x7f800000u){return pair(vec4f(bitcast<f32>(0x7fc00000u)));}}var sum=scalar(0.);var bright=scalar(0.);for(var j=0u;j<paramU32(1u);j++){var t=scalar(0.);if(paramU32(1u)>1u){t=multiply(subtract(divide(uintPair(j),uintPair(paramU32(1u)-1u)),scalar(.5)),argP(2u));}let v=samplePM(add(scalar(f32(p.x)),multiply(dx,t)),add(scalar(f32(p.y)),multiply(dy,t)));if(paramU32(2u)==0u||mode==2u){sum=add(sum,v);}else{let l=luminanceP(straight(v));if(j==0u||(paramU32(2u)==1u&&greater(l,bright))||(paramU32(2u)==2u&&greater(bright,l))){sum=v;bright=l;}}}if(paramU32(2u)==0u||mode==2u){sum=divide(sum,uintPair(paramU32(1u)));}return mixP(src(p),sum,argP(30u));}
fn pixel(q:vec2u)->vec4f{let p=vec2i(q);let mode=paramU32(0u);let s=src(p);let alpha=ch(s,3u);let c=col(p);
 if(mode==0u){let radius=i32(paramU32(1u));var result=scalar(0.);for(var j=-radius;j<=radius;j++){let weight=table(u32(j+radius));result=add(result,times(multiply(add(src(p+vec2i(j,0)),src(p+vec2i(0,j))),weight),.5));}return published(mixP(s,result,argP(30u)));}
 if(mode==1u||mode==2u){return published(radial(p,mode));}
 if(mode==16u){return published(rgba(convolution(p,paramU32(3u)!=0u),alpha));}
 if(mode==17u){let guideValue=associate(read1(clipped(p)),alpha1());let value=add(c,multiply(argP(0u),subtract(straight(guideValue),multiply(c,argP(1u)))));return published(rgba(value,alpha));}
 if(mode==18u){return published(rgba(subtract(refcol(p),c),alpha));}
 if(mode==11u){let seed=paramU32(1u)^paramU32(2u)*0x9e3779b9u;let a=clampP(add(alpha,times(argP(0u),random(p.x,p.y,seed)*2.-1.)));var value=rgba(c,a);if(!greater(alpha,scalar(0.))){value=rgb(ch(s,0u),ch(s,1u),ch(s,2u),a);}return published(mixP(s,value,argP(30u)));}
 if(!greater(alpha,scalar(0.))){return published(s);}var value=c;
 switch mode{
 case 19u:{value=refcol(p);}
 case 4u:{value=calculate(p);}
 case 5u:{let at=vec2i(i32(round(arg(0u))),i32(round(arg(1u))));let probe=col(at);let l=luminanceP(probe);var adjusted=c;for(var j=0u;j<3u;j++){let v=ch(probe,j);let gain=scalar(1.);var g=gain;if(greater(absPair(v),argP(3u))){g=divide(l,v);}let lane=multiply(ch(c,j),g);adjusted.hi[j]=lane.hi.x;adjusted.lo[j]=lane.lo.x;}value=mixP(c,adjusted,argP(2u));}
 case 6u:{let period=argP(3u);var result=c;for(var j=0u;j<3u;j++){let v=divide(add(ch(c,j),argP(j)),period);let lane=multiply(fractP(v),period);result.hi[j]=lane.hi.x;result.lo[j]=lane.lo.x;}value=result;}
 case 7u:{let at=multiply(fractP(add(multiply(luminanceP(c),argP(1u)),argP(0u))),uintPair(paramU32(1u)));let i=u32(floor(at.hi.x))%paramU32(1u);let j=(i+1u)%paramU32(1u);let a=rgb(table(i*3u),table(i*3u+1u),table(i*3u+2u),scalar(0.));let b=rgb(table(j*3u),table(j*3u+1u),table(j*3u+2u),scalar(0.));value=mixP(a,b,subtract(at,uintPair(i)));}
 case 8u:{let mean=rgb(table(0u),table(1u),table(2u),scalar(0.));let dest=rgb(table(6u),table(7u),table(8u),scalar(0.));var mapped=c;for(var j=0u;j<3u;j++){let variance=maxP(table(3u+j),scalar(0.));let scale=sqrtPair(divide(maxP(table(9u+j),scalar(0.)),maxP(variance,argP(1u))));let lane=add(ch(dest,j),multiply(subtract(ch(c,j),ch(mean,j)),scale));mapped.hi[j]=lane.hi.x;mapped.lo[j]=lane.lo.x;}value=mixP(c,mapped,argP(0u));}
 case 9u:{var mapped=c;for(var j=0u;j<3u;j++){let lane=add(multiply(ch(c,j),table(j*2u)),table(j*2u+1u));mapped.hi[j]=lane.hi.x;mapped.lo[j]=lane.lo.x;}value=mixP(c,mapped,argP(0u));}
 case 10u:{var result=c;for(var j=0u;j<3u;j++){let variance=maxP(subtract(table(9u+j),table(3u+j)),scalar(0.));let amplitude=multiply(sqrtPair(times(variance,6.)),argP(0u));let n=random(p.x,p.y,paramU32(1u)+j*13u)+random(p.x,p.y,paramU32(1u)+j*13u+7u)-1.;let lane=add(ch(c,j),times(amplitude,n));result.hi[j]=lane.hi.x;result.lo[j]=lane.lo.x;}value=result;}
 case 12u:{let seed=paramU32(1u)^paramU32(2u)*0x9e3779b9u;var hsl=encodeHsl(c);hsl.h=add(hsl.h,times(argP(0u),random(p.x,p.y,seed)*2.-1.));hsl.l=clampP(add(hsl.l,times(argP(1u),random(p.x,p.y,seed+7u)*2.-1.)));hsl.s=clampP(add(hsl.s,times(argP(2u),random(p.x,p.y,seed+13u)*2.-1.)));value=decodeHsl(hsl);}
 case 13u:{var sum=scalar(0.);for(var j=0u;j<paramU32(1u);j++){var t=scalar(0.);if(paramU32(1u)>1u){t=multiply(divide(uintPair(j),uintPair(paramU32(1u)-1u)),argP(2u));}let v=samplePM(subtract(scalar(f32(p.x)),multiply(subtract(scalar(f32(p.x)),argP(0u)),t)),subtract(scalar(f32(p.y)),multiply(subtract(scalar(f32(p.y)),argP(1u)),t)));sum=add(sum,straight(v));}value=add(c,multiply(divide(sum,uintPair(paramU32(1u))),argP(3u)));}
 case 14u:{let x=subtract(scalar(f32(p.x)),argP(0u));let y=subtract(scalar(f32(p.y)),argP(1u));let d=absPair(add(multiply(x,argP(2u)),multiply(y,argP(3u))));let t=clampP(subtract(scalar(1.),divide(d,argP(4u))));value=add(c,multiply(triple(6u),multiply(argP(5u),multiply(t,t))));}
 case 15u:{var sum=scalar(0.);var weight=scalar(0.);let radius=i32(paramU32(1u));let centre=vec2i(i32(round(arg(0u))),i32(round(arg(1u))));for(var y=-radius;y<=radius;y++){for(var x=-radius;x<=radius;x++){let v=src(centre+vec2i(x,y));sum=add(sum,v);weight=add(weight,ch(v,3u));}}if(greater(weight,scalar(0.))){value=divide(sum,weight);}}
 default:{}
 }return finish(p,value);}
`)};
