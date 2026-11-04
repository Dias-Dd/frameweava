import {compute,R,W,U,V} from './compute.ts';
export const clearScratch=compute('clear-two-dimensional-crop-scratch',[V,V],`fn compute(p:vec3u,_l:vec3u,_g:vec3u){store1(p.y*(paramU32(0u)+1u)+p.x,0u);if(p.x<paramU32(0u)&&p.y<paramU32(1u)){store0(p.y*paramU32(0u)+p.x,0u);}}`);
export const initialize=compute('crop-search-state-init',[V],`fn compute(_p:vec3u,_l:vec3u,_g:vec3u){let d=select(paramU32(0u),paramU32(1u),paramU32(1u)>1u);for(var j=0u;j<8u;j++){store0(j,0u);}store0(0u,select(2u,1u,d==1u));store0(1u,d);}`, [1,1,1]);
export const mergeValidity=compute('intersect-map-validity',[R,V],`fn compute(p:vec3u,_l:vec3u,_g:vec3u){let i=p.y*paramU32(0u)+p.x;if(load0(i*6u+4u)!=2.){store1(i,1u);}}`);
export const prefixRows=compute('validity-integral-rows',[U,V],`fn compute(p:vec3u,_l:vec3u,_g:vec3u){let w=paramU32(0u);var sum=0u;for(var x=0u;x<w;x++){sum+=load0(p.x*w+x);store1((p.x+1u)*(w+1u)+x+1u,sum);}}`,[64,1,1]);
export const prefixColumns=compute('validity-integral-columns',[V],`fn compute(p:vec3u,_l:vec3u,_g:vec3u){let w=paramU32(0u)+1u;var sum=0u;for(var y=1u;y<=paramU32(1u);y++){let at=y*w+p.x+1u;sum+=load0(at);store0(at,sum);}}`,[64,1,1]);
const sizing=`
fn dimension()->u32{return select(paramU32(0u),paramU32(1u),paramU32(1u)>1u);}
fn cropFraction(n:u32)->Pair{if(dimension()==1u){return scalar(1.);}return divide(uintPair(n-1u),uintPair(dimension()-1u));}
fn extent(n:u32)->vec2u{let k=cropFraction(n);let x=multiply(uintPair(paramU32(0u)-1u),k);let y=multiply(uintPair(paramU32(1u)-1u),k);return vec2u(u32(rounded(negate(floorP(negate(x)))).x)+1u,u32(rounded(negate(floorP(negate(y)))).x)+1u);}
fn distance(x:u32,y:u32,d:vec2u)->Pair{let dx=subtract(add(times(uintPair(x),2.),uintPair(d.x)),uintPair(paramU32(0u)));let dy=subtract(add(times(uintPair(y),2.),uintPair(d.y)),uintPair(paramU32(1u)));return add(multiply(dx,dx),multiply(dy,dy));}
`;
export const candidates=compute('largest-aspect-valid-rectangle-rows',[U,U,V],sizing+`
fn missing(x:u32,y:u32,d:vec2u)->u32{let w=paramU32(0u)+1u;return (load0((y+d.y)*w+x+d.x)-load0(y*w+x+d.x))-(load0((y+d.y)*w+x)-load0(y*w+x));}
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let at=p.x*3u;store2(at,0u);store2(at+1u,0u);store2(at+2u,p.x);if(load1(0u)>load1(1u)){return;}let n=(load1(0u)+load1(1u))/2u;let d=extent(n);if(d.x>paramU32(0u)||d.y>paramU32(1u)||p.x+d.y>paramU32(1u)){return;}var best=scalar(3e38);for(var x=0u;x+d.x<=paramU32(0u);x++){if(missing(x,p.x,d)!=0u){continue;}let cost=distance(x,p.x,d);if(greater(best,cost)){best=cost;store2(at,1u);store2(at+1u,x);}}}`, [64,1,1]);
export const selectCandidate=compute('largest-aspect-binary-search-step',[U,V],sizing+`
fn compute(_p:vec3u,_l:vec3u,_g:vec3u){if(load1(0u)>load1(1u)){return;}let n=(load1(0u)+load1(1u))/2u;let d=extent(n);var found=false;var best=scalar(3e38);var x=0u;var y=0u;for(var j=0u;j<paramU32(1u);j++){if(load0(j*3u)==0u){continue;}let xx=load0(j*3u+1u);let cost=distance(xx,j,d);if(greater(best,cost)){found=true;best=cost;x=xx;y=j;}}if(found){store1(0u,n+1u);store1(2u,n);store1(3u,x);store1(4u,y);store1(5u,1u);}else{store1(1u,n-1u);}}`,[1,1,1]);
export const finalize=compute('crop-transform-and-validity',[U,W],sizing+`
fn compute(_p:vec3u,_l:vec3u,_g:vec3u){var k=scalar(1.);var valid=load0(5u)==1u;if(valid){k=cropFraction(load0(2u));if(arg(0u)>0.&&greater(scalar(1.),multiply(k,argP(0u)))){valid=false;}}let x=uintPair(load0(3u));let y=uintPair(load0(4u));store1(0u,x.hi.x);store1(1u,x.lo.x);store1(2u,y.hi.x);store1(3u,y.lo.x);store1(4u,k.hi.x);store1(5u,k.lo.x);store1(6u,select(0.,1.,valid));store1(7u,rounded(divide(scalar(1.),k)).x);}`, [1,1,1]);
