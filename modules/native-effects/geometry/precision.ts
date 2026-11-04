/** Double-float coordinate functions. These do not change the image ABI or
 * request shader-f64; they reuse the qualified hi/lo arithmetic. Their bounded
 * series are argument-reduced, unlike a low-order whole-domain approximation. */
const c=(v:number)=>{const hi=Math.fround(v);return `constant(${hi},${Math.fround(v-hi)})`;};
export const precision=`
fn absPair(v:Pair)->Pair{if(greater(scalar(0.),v)){return negate(v);}return v;}
fn sqrtPair(v:Pair)->Pair{if(!greater(v,scalar(0.))){return scalar(0.);}let root=scalar(sqrt(v.hi.x));return add(root,divide(subtract(v,multiply(root,root)),times(root,2.)));}
fn atanPair(v:Pair)->Pair{let negative=greater(scalar(0.),v);var x=absPair(v);let inverse=greater(x,scalar(1.));if(inverse){x=divide(scalar(1.),x);}var offset=scalar(0.);if(greater(x,${c(Math.SQRT2-1)})){x=divide(subtract(x,scalar(1.)),add(x,scalar(1.)));offset=${c(Math.PI/4)};}
 let square=negate(multiply(x,x));var term=x;var result=x;for(var k=1u;k<=20u;k++){term=multiply(term,square);result=add(result,divide(term,scalar(f32(k*2u+1u))));}result=add(result,offset);if(inverse){result=subtract(${c(Math.PI/2)},result);}if(negative){result=negate(result);}return result;}
fn atan2Pair(y:Pair,x:Pair)->Pair{if(rounded(x).x==0.){if(greater(y,scalar(0.))){return ${c(Math.PI/2)};}if(greater(scalar(0.),y)){return negate(${c(Math.PI/2)});}return scalar(0.);}var a=atanPair(divide(y,x));if(greater(scalar(0.),x)){if(greater(scalar(0.),y)){a=subtract(a,${c(Math.PI)});}else{a=add(a,${c(Math.PI)});}}return a;}
fn asinPair(v:Pair)->Pair{return atan2Pair(v,sqrtPair(subtract(scalar(1.),multiply(v,v))));}
struct SinCos{s:Pair,c:Pair}
fn sincosPair(v:Pair)->SinCos{let halfpi=${c(Math.PI/2)};let k=floor(v.hi.x/halfpi.hi.x+.5);let x=subtract(v,times(halfpi,k));let minus=negate(multiply(x,x));var st=x;var ct=scalar(1.);var s=st;var co=ct;for(var i=1u;i<=12u;i++){st=divide(multiply(st,minus),scalar(f32((2u*i)*(2u*i+1u))));ct=divide(multiply(ct,minus),scalar(f32((2u*i-1u)*(2u*i))));s=add(s,st);co=add(co,ct);}let q=((i32(k)%4)+4)%4;switch q{case 1:{return SinCos(co,negate(s));}case 2:{return SinCos(negate(s),negate(co));}case 3:{return SinCos(negate(co),s);}default:{return SinCos(s,co);}}}
fn scalePair(v:Pair,e:i32)->Pair{return Pair(ldexp(v.hi,vec4i(e)),ldexp(v.lo,vec4i(e)));}
fn logPair(v:Pair)->Pair{let e=i32(floor(log2(v.hi.x)));let m=scalePair(v,-e);let t=divide(subtract(m,scalar(1.)),add(m,scalar(1.)));let square=multiply(t,t);var term=t;var result=t;for(var i=1u;i<=18u;i++){term=multiply(term,square);result=add(result,divide(term,scalar(f32(2u*i+1u))));}return add(times(result,2.),times(${c(Math.LN2)},f32(e)));}
fn expPair(v:Pair)->Pair{let e=i32(round(v.hi.x/${Math.fround(Math.LN2)}));let x=subtract(v,times(${c(Math.LN2)},f32(e)));var term=scalar(1.);var result=term;for(var i=1u;i<=18u;i++){term=divide(multiply(term,x),scalar(f32(i)));result=add(result,term);}return scalePair(result,e);}
fn powPair(x:Pair,y:Pair)->Pair{if(rounded(x).x==0.){return scalar(0.);}return expPair(multiply(logPair(x),y));}
struct Delta{x:Pair,y:Pair}
fn delta(q:vec2f)->Delta{return Delta(subtract(scalar(q.x),argP(0u)),subtract(scalar(q.y),argP(1u)));}
fn radius(d:Delta)->Pair{return sqrtPair(add(multiply(d.x,d.x),multiply(d.y,d.y)));}
fn movedPair(q:vec2f,x:Pair,y:Pair)->Mapping{return Mapping(add(scalar(q.x-.5),x),add(scalar(q.y-.5),y),1.);}
`;
