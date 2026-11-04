import type {GpuPixelKernelSourceV2} from '../../gpu-effects/pixel-types.ts';
import {math} from '../keying/kernels.ts';
import {guarded} from '../geometry/arithmetic.ts';
const c=(x:number)=>`constant(${Math.fround(x)},${Math.fround(x-Math.fround(x))})`;
/** EffectCraft table ordering and six tetrahedra, adapted to existing Pixel ABI
 * data inputValue and compensated arithmetic. No hardware LUT filtering or host. */
export const gradingKernel:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/grading/point',version:'1.0.0',inputCount:1,parameterWords:128,dataInputs:[{type:'f32'}],code:guarded(math+`
fn value(i:u32)->Pair{return constant(data0(i*2u),data0(i*2u+1u));}
fn signedPower(v:Pair,p:Pair)->Pair{let q=powPair(absPair(v),p);if(greater(scalar(0.),v)){return negate(q);}return q;}
fn exp2P(v:Pair)->Pair{return expPair(multiply(v,${c(Math.LN2)}));}
fn log2P(v:Pair)->Pair{return divide(logPair(v),${c(Math.LN2)});}
fn encoded(v:Pair,kind:u32,inverse:bool)->Pair{
 if(kind==1u){let x=absPair(v);var a=scalar(0.);if(inverse){if(!greater(x,${c(.04045)})){a=divide(x,${c(12.92)});}else{a=powPair(divide(add(x,${c(.055)}),${c(1.055)}),${c(2.4)});}}else{if(!greater(x,${c(.0031308)})){a=multiply(x,${c(12.92)});}else{a=subtract(multiply(${c(1.055)},powPair(x,divide(scalar(1.),${c(2.4)}))),${c(.055)});}}if(greater(scalar(0.),v)){a=negate(a);}return a;}
 if(kind==2u){if(inverse){if(!greater(v,${c(.155251141552511)})){return divide(subtract(v,${c(.0729055341958355)}),${c(10.5402377416545)});}return exp2P(subtract(multiply(v,${c(17.52)}),${c(9.72)}));}if(!greater(v,scalar(.0078125))){return add(multiply(v,${c(10.5402377416545)}),${c(.0729055341958355)});}return divide(add(log2P(v),${c(9.72)}),${c(17.52)});}
 return v;
}
fn clampRGB(v:Pair)->Pair{return rgb(clampP(ch(v,0u)),clampP(ch(v,1u)),clampP(ch(v,2u)),ch(v,3u));}
fn nearest(x:Pair,n:u32)->u32{return u32(rounded(floorP(add(maxP(scalar(0.),minP(scalar(f32(n-1u)),x)),scalar(.5)))).x);}
fn table(r:u32,g:u32,b:u32)->Pair{let i=(r+g*paramU32(3u)+b*paramU32(3u)*paramU32(3u))*3u;return rgb(value(i),value(i+1u),value(i+2u),scalar(0.));}
fn nearestLookup(c:Pair,original:Pair,j:u32)->u32{let n=paramU32(3u);var numerator=encoded(ch(c,j),paramU32(4u),false);var alpha=scalar(1.);if(paramU32(4u)==0u&&alpha0()!=1u){numerator=ch(original,j);alpha=ch(original,3u);}let left=multiply(subtract(numerator,multiply(argP(j),alpha)),uintPair(2u*(n-1u)));let span=multiply(subtract(argP(j+3u),argP(j)),alpha);var lo=0u;var hi=n-1u;while(lo<hi){let mid=lo+(hi-lo)/2u;let right=multiply(span,uintPair(mid*2u+1u));if(!greater(right,left)){lo=mid+1u;}else{hi=mid;}}return lo;}
fn lookup(c0:Pair,original:Pair)->Pair{
 let n=paramU32(3u);let scale=scalar(f32(n-1u));var pos=scalar(0.);var lower=vec3u(0u);var fraction=scalar(0.);
 for(var j=0u;j<3u;j++){let inputValue=encoded(ch(c0,j),paramU32(4u),false);var t=divide(subtract(inputValue,argP(j)),subtract(argP(j+3u),argP(j)));if(paramU32(2u)!=0u){t=clampP(t);}let x=multiply(t,scale);pos.hi[j]=x.hi.x;pos.lo[j]=x.lo.x;var k=0u;if(greater(x,scalar(0.))){if(!greater(scale,x)){k=n-2u;}else{k=min(u32(rounded(floorP(x)).x),n-2u);}}lower[j]=k;let f=subtract(x,scalar(f32(k)));fraction.hi[j]=f.hi.x;fraction.lo[j]=f.lo.x;}
 var result=scalar(0.);
 if(paramU32(0u)==0u){for(var j=0u;j<3u;j++){var v=scalar(0.);if(paramU32(1u)==0u){let at=nearestLookup(c0,original,j);v=value(min(at,n-1u)*3u+j);}else{v=mixP(value(lower[j]*3u+j),value((lower[j]+1u)*3u+j),ch(fraction,j));}result.hi[j]=v.hi.x;result.lo[j]=v.lo.x;}}
 else if(paramU32(1u)==0u){let q=vec3u(nearestLookup(c0,original,0u),nearestLookup(c0,original,1u),nearestLookup(c0,original,2u));result=table(min(q.x,n-1u),min(q.y,n-1u),min(q.z,n-1u));}
 else if(paramU32(1u)==1u){let r=lower.x;let g=lower.y;let b=lower.z;let fr=ch(fraction,0u);let fg=ch(fraction,1u);let fb=ch(fraction,2u);let a=mixP(table(r,g,b),table(r+1u,g,b),fr);let x=mixP(table(r,g+1u,b),table(r+1u,g+1u,b),fr);let y=mixP(table(r,g,b+1u),table(r+1u,g,b+1u),fr);let z=mixP(table(r,g+1u,b+1u),table(r+1u,g+1u,b+1u),fr);result=mixP(mixP(a,x,fg),mixP(y,z,fg),fb);}
 else{var axes=vec3u(0u,1u,2u);for(var i=0u;i<2u;i++){for(var j=i+1u;j<3u;j++){if(greater(ch(fraction,axes[j]),ch(fraction,axes[i]))){let a=axes[i];axes[i]=axes[j];axes[j]=a;}}}let p0=table(lower.x,lower.y,lower.z);var q=lower;q[axes[0]]+=1u;let p1=table(q.x,q.y,q.z);q[axes[1]]+=1u;let p2=table(q.x,q.y,q.z);let p3=table(lower.x+1u,lower.y+1u,lower.z+1u);result=add(add(add(p0,multiply(subtract(p1,p0),ch(fraction,axes[0]))),multiply(subtract(p2,p1),ch(fraction,axes[1]))),multiply(subtract(p3,p2),ch(fraction,axes[2])));}
 return rgb(encoded(ch(result,0u),paramU32(5u),true),encoded(ch(result,1u),paramU32(5u),true),encoded(ch(result,2u),paramU32(5u),true),scalar(0.));
}
fn curveAt(x:Pair)->Pair{let n=paramU32(6u);var lo=0u;var hi=n;while(lo<hi){let m=(lo+hi)/2u;if(greater(x,value(m*2u))){lo=m+1u;}else{hi=m;}}let i=clamp(lo,1u,n-1u);let a=value((i-1u)*2u);let b=value(i*2u);return mixP(value((i-1u)*2u+1u),value(i*2u+1u),divide(subtract(x,a),subtract(b,a)));}
fn ascLuma(v:Pair)->Pair{return add(add(multiply(ch(v,0u),${c(.2126)}),multiply(ch(v,1u),${c(.7152)})),multiply(ch(v,2u),${c(.0722)}));}
fn applyCdl(v:Pair)->Pair{var c=v;let inverse=paramU32(1u)!=0u;let clampIt=paramU32(2u)!=0u;if(inverse){if(clampIt){c=clampRGB(c);}let l=ascLuma(c);c=add(l,divide(subtract(c,l),argP(9u)));}for(var j=0u;j<3u;j++){var x=ch(c,j);if(!inverse){x=add(multiply(x,argP(j)),argP(j+3u));}if(clampIt){x=clampP(x);}if(!greater(scalar(0.),x)){var power=argP(j+6u);if(inverse){power=divide(scalar(1.),power);}x=powPair(x,power);}if(inverse){x=divide(subtract(x,argP(j+3u)),argP(j));}c.hi[j]=x.hi.x;c.lo[j]=x.lo.x;}if(!inverse){let l=ascLuma(c);c=add(l,multiply(subtract(c,l),argP(9u)));}if(clampIt){c=clampRGB(c);}return c;}
fn opponent(v:Pair)->Pair{let y=luminanceP(v);let u=divide(subtract(ch(v,2u),y),times(subtract(scalar(1.),argP(42u)),2.));let v1=divide(subtract(ch(v,0u),y),times(subtract(scalar(1.),argP(40u)),2.));return rgb(y,u,v1,scalar(0.));}
fn fromOpponent(y:Pair,u:Pair,v:Pair)->Pair{let r=add(y,multiply(v,times(subtract(scalar(1.),argP(40u)),2.)));let b=add(y,multiply(u,times(subtract(scalar(1.),argP(42u)),2.)));let g=divide(subtract(subtract(y,multiply(r,argP(40u))),multiply(b,argP(42u))),argP(41u));return rgb(r,g,b,scalar(0.));}
fn curves(v:Pair,mode:u32)->Pair{let o=opponent(v);var y=ch(o,0u);var u=ch(o,1u);var z=ch(o,2u);let chroma=sqrtPair(add(multiply(u,u),multiply(z,z)));let saturation=divide(chroma,add(scalar(1.),absPair(y)));var hue=multiply(atan2Pair(z,u),${c(180/Math.PI)});if(greater(scalar(0.),hue)){hue=add(hue,scalar(360.));}
 if(mode==8u){y=curveAt(y);}else if(mode==9u){let sc=sincosPair(multiply(curveAt(hue),${c(Math.PI/180)}));let a=subtract(multiply(u,sc.c),multiply(z,sc.s));z=add(multiply(u,sc.s),multiply(z,sc.c));u=a;}
 else if(mode==10u){let gain=curveAt(hue);u=multiply(u,gain);z=multiply(z,gain);}else if(mode==11u){y=multiply(y,curveAt(hue));}
 else if(mode==12u){if(greater(chroma,scalar(0.))){let gain=divide(curveAt(saturation),saturation);u=multiply(u,gain);z=multiply(z,gain);}}
 else if(mode==13u){let gain=curveAt(y);u=multiply(u,gain);z=multiply(z,gain);}else{y=multiply(y,curveAt(saturation));}return fromOpponent(y,u,z);}
fn grade(v:Pair,original:Pair)->Pair{let mode=paramU32(0u);if(mode<=1u){return lookup(v,original);}if(mode==2u){return applyCdl(v);}if(mode==3u){return rgb(dotRGB(v,triple(0u)),dotRGB(v,triple(3u)),dotRGB(v,triple(6u)),scalar(0.));}
 if(mode==4u){var resultColor=scalar(0.);for(var j=0u;j<3u;j++){let x=add(ch(v,j),multiply(argP(j),subtract(scalar(1.),ch(v,j))));let y=multiply(signedPower(x,divide(scalar(1.),argP(j+3u))),argP(j+6u));resultColor.hi[j]=y.hi.x;resultColor.lo[j]=y.lo.x;}return resultColor;}
 if(mode==5u){return multiply(v,rgb(exp2P(divide(argP(0u),argP(3u))),exp2P(divide(argP(1u),argP(3u))),exp2P(divide(argP(2u),argP(3u))),scalar(0.)));}
 if(mode==6u){var resultColor=scalar(0.);for(var j=0u;j<3u;j++){let x=divide(ch(v,j),argP(1u));let y=multiply(signedPower(x,argP(0u)),argP(1u));resultColor.hi[j]=y.hi.x;resultColor.lo[j]=y.lo.x;}return resultColor;}
 if(mode==7u){var resultColor=scalar(0.);let pivot=logPair(add(scalar(1.),divide(argP(1u),argP(2u))));for(var j=0u;j<3u;j++){let x=ch(v,j);var magnitude=logPair(add(scalar(1.),divide(absPair(x),argP(2u))));if(greater(scalar(0.),x)){magnitude=negate(magnitude);}let mapped=add(pivot,multiply(subtract(magnitude,pivot),argP(0u)));var y=multiply(subtract(expPair(absPair(mapped)),scalar(1.)),argP(2u));if(greater(scalar(0.),mapped)){y=negate(y);}resultColor.hi[j]=y.hi.x;resultColor.lo[j]=y.lo.x;}return resultColor;}
 if(mode<=14u){return curves(v,mode);}
 if(mode==15u){let t=clampP(divide(luminanceP(v),argP(9u)));let a=subtract(scalar(1.),t);let gain=add(add(multiply(triple(0u),multiply(a,a)),multiply(triple(3u),times(multiply(a,t),2.))),multiply(triple(6u),multiply(t,t)));return multiply(v,rgb(exp2P(ch(gain,0u)),exp2P(ch(gain,1u)),exp2P(ch(gain,2u)),scalar(0.)));}
 if(mode==16u){let y=luminanceP(v);let t=clampP(add(divide(subtract(y,argP(6u)),argP(7u)),scalar(.5)));let tint=mixP(triple(0u),triple(3u),t);return add(v,subtract(tint,luminanceP(tint)));}
 if(mode==17u||mode==18u){let y=luminanceP(v);let threshold=argP(0u);var d=subtract(y,threshold);if(mode==18u){d=negate(d);}if(!greater(d,scalar(0.))){return v;}var resultColor=add(threshold,multiply(argP(1u),subtract(scalar(1.),expPair(negate(divide(d,argP(1u)))))));if(mode==18u){resultColor=subtract(threshold,multiply(argP(1u),subtract(scalar(1.),expPair(negate(divide(d,argP(1u)))))));}return add(v,subtract(resultColor,y));}
 if(mode==19u){let ac=maxP(ch(v,0u),maxP(ch(v,1u),ch(v,2u)));if(!greater(ac,scalar(0.))){return v;}var resultColor=v;for(var j=0u;j<3u;j++){let d=divide(subtract(ac,ch(v,j)),ac);let threshold=argP(j);if(greater(d,threshold)){let span=subtract(argP(j+3u),threshold);let x=divide(subtract(d,threshold),span);let compressed=divide(subtract(d,threshold),powPair(add(scalar(1.),powPair(x,argP(6u))),divide(scalar(1.),argP(6u))));let y=subtract(ac,multiply(add(threshold,compressed),ac));resultColor.hi[j]=y.hi.x;resultColor.lo[j]=y.lo.x;}}return resultColor;}
 let l=luminanceP(v);let mask=clampP(divide(l,argP(1u)));let gray=add(l,multiply(subtract(v,l),argP(0u)));let burn=multiply(gray,l);let screen=subtract(scalar(1.),multiply(subtract(scalar(1.),gray),subtract(scalar(1.),l)));return mixP(burn,screen,mask);
}
fn pixel(p:vec2u)->vec4f{let source=associate(read0(vec2i(p)),alpha0());let alpha=ch(source,3u);if(!greater(alpha,scalar(0.))||arg(30u)==0.){return published(source);}var c=straight(source);if(alpha0()==1u){c=pair(read0(vec2i(p)));}let result=mixP(c,grade(c,source),argP(30u));return published(rgba(result,alpha));}
`)};
