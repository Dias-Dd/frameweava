/** Acceptance-only original Rust/F64 inverse-map equations. Never imported by
 * a production Stage. The fBm lattice retains original Rust f32 operations. */
import {fromHalf,toHalf,type AlphaMode} from '../../../src/media/surface.ts';
import {edges,grid} from './cases.ts';
import type {Boundary,nativeGeometryNames} from './types.ts';
type XY=readonly [number,number];
type MapPoint=(x:number,y:number)=>readonly [number,number,number?]|null;
type Name=typeof nativeGeometryNames[number];
const rad=Math.PI/180,F=Math.fround,mod=(v:number,n:number)=>((v%n)+n)%n;
const sum=(a:readonly number[],b:readonly number[],w:number)=>a.map((v,c)=>v*(1-w)+b[c]*w);
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const quantize=(values:ArrayLike<number>,half=false)=>Float32Array.from(values,v=>half?fromHalf(toHalf(F(v))):v);
function address(v:number,n:number,b:Boundary){if(b==='clamp')return clamp(v,0,n-1);if(b==='repeat')return mod(v,n);if(b==='mirror'){const q=mod(v,2*n);return Math.min(q,2*n-1-q);}return v;}
function pixels(input:Float32Array,alpha:AlphaMode){return Array.from(input,(v,i)=>alpha==='straight'&&i%4!==3?v*input[i-i%4+3]:v);}
function sample(input:readonly number[],w:number,h:number,x:number,y:number,b:Boundary):number[]{
 x-=.5;y-=.5;const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,result=[0,0,0,0];
 for(const [dx,dy,weight]of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]){const sx=address(ix+dx,w,b),sy=address(iy+dy,h,b);if(sx<0||sy<0||sx>=w||sy>=h)continue;for(let c=0;c<4;c++)result[c]+=input[(sy*w+sx)*4+c]*weight;}return result;
}
function remap(input:readonly number[],w:number,h:number,map:MapPoint,b:Boundary='transparent'){const out:number[]=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=map(x+.5,y+.5);let v=p?sample(input,w,h,p[0],p[1],b):[0,0,0,0];if(p&&p[2]!==undefined)v=sum(input.slice((y*w+x)*4,(y*w+x)*4+4),v,p[2]);v[3]=clamp(v[3]);out.push(...v);}return out;}
type Reconstruction='nearest'|'triangle'|'mitchell'|'lanczos3';
function kernel(x:number,method:Reconstruction){const a=Math.abs(x);if(method==='nearest')return a<.5?1:0;if(method==='triangle')return Math.max(0,1-a);if(method==='mitchell'){const b=1/3,c=1/3;return a<1?((12-9*b-6*c)*a**3+(-18+12*b+6*c)*a*a+6-2*b)/6:a<2?((-b-6*c)*a**3+(6*b+30*c)*a*a+(-12*b-48*c)*a+8*b+24*c)/6:0;}if(a>=3)return 0;const sinc=(v:number)=>v===0?1:Math.sin(Math.PI*v)/(Math.PI*v);return sinc(a)*sinc(a/3);}
function resize(input:readonly number[],sw:number,sh:number,w:number,h:number,method:Reconstruction='lanczos3',boundary:Boundary='clamp'){const axis=(from:number,to:number,p:number)=>{const scale=method==='nearest'?1:Math.max(1,from/to),centre=(p+.5)*from/to-.5,support={nearest:.5,triangle:1,mitchell:2,lanczos3:3}[method]*scale;const out:[number,number][]=[];if(method==='nearest')return [[Math.floor(centre+.5),1]] as const;for(let i=Math.ceil(centre-support);i<=Math.floor(centre+support);i++)out.push([i,kernel((i-centre)/scale,method)]);const norm=out.reduce((s,v)=>s+v[1],0);return out.map(([i,v])=>[i,v/norm] as const);},horizontal:number[]=[];
 for(let y=0;y<sh;y++)for(let x=0;x<w;x++){const a=[0,0,0,0];for(const [sx,v]of axis(sw,w,x)){const ix=address(sx,sw,boundary);if(ix<0||ix>=sw)continue;for(let c=0;c<4;c++)a[c]+=input[(y*sw+ix)*4+c]*v;}horizontal.push(...a);}
 const out:number[]=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=[0,0,0,0];for(const [sy,v]of axis(sh,h,y)){const iy=address(sy,sh,boundary);if(iy<0||iy>=sh)continue;for(let c=0;c<4;c++)a[c]+=horizontal[(iy*w+x)*4+c]*v;}a[3]=clamp(a[3]);out.push(...a);}return out;
}
export function resizeOracle(input:Float32Array,sw:number,sh:number,w:number,h:number,method:Reconstruction,boundary:Boundary,alpha:AlphaMode,half:boolean){return quantize(resize(pixels(input,alpha),sw,sh,w,h,method,boundary),half);}
export function remapOracle(input:Float32Array,w:number,h:number,map:MapPoint,boundary:Boundary,alpha:AlphaMode,half:boolean){return quantize(remap(pixels(input,alpha),w,h,map,boundary),half);}
function bez(p:readonly XY[],t:number):XY {return [0,1].map(k=>(1-t)**3*p[0][k]+3*(1-t)**2*t*p[1][k]+3*(1-t)*t*t*p[2][k]+t**3*p[3][k]) as [number,number];}
function meshMap(dest:readonly XY[],source:readonly XY[],nx:number,ny:number):MapPoint{const tris:number[][]=[];for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const a=y*(nx+1)+x;tris.push([a,a+1,a+nx+2],[a,a+nx+2,a+nx+1]);}return (x,y)=>{for(const [ia,ib,ic]of tris){const a=dest[ia],b=dest[ib],c=dest[ic],den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-12)continue;const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,t=1-u-v;if(Math.min(u,v,t)<-1e-9)continue;return [source[ia][0]*u+source[ib][0]*v+source[ic][0]*t,source[ia][1]*u+source[ib][1]*v+source[ic][1]*t];}return null;};}
function pin(corners:readonly XY[],w:number,h:number):number[]{const rows:number[][]=[];corners.forEach(([x,y],i)=>{const u=[0,w,w,0][i],v=[0,0,h,h][i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);});for(let j=0;j<8;j++){let k=j;for(let i=j+1;i<8;i++)if(Math.abs(rows[i][j])>Math.abs(rows[k][j]))k=i;[rows[k],rows[j]]=[rows[j],rows[k]];const d=rows[j][j];for(let c=j;c<9;c++)rows[j][c]/=d;for(let r=0;r<8;r++)if(r!==j){const d=rows[r][j];for(let c=j;c<9;c++)rows[r][c]-=d*rows[j][c];}}return [...rows.map(row=>row[8]),1];}
const mul=(a:number,b:number)=>F(a*b),add=(a:number,b:number)=>F(a+b);
function lattice(x:number,y:number,z:number,seed:number){let h=Math.imul(x,0x27d4eb2d)^Math.imul(y,0x165667b1)^Math.imul(z,0x9e3779b9)^Math.imul(seed,0x85ebca6b);h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>12;h=Math.imul(h,0x297a2d39);h^=h>>>15;return F((h&65535)/65535);}
function noise(x:number,y:number,z:number,seed:number){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fade=(t:number)=>mul(mul(mul(t,t),t),add(mul(t,add(mul(t,6),-15)),10)),fx=fade(F(x-ix)),fy=fade(F(y-iy)),fz=F(z-iz),lerp=(a:number,b:number,t:number)=>add(a,mul(F(b-a),t)),plane=(dz:number)=>lerp(lerp(lattice(ix,iy,iz+dz,seed),lattice(ix+1,iy,iz+dz,seed),fx),lerp(lattice(ix,iy+1,iz+dz,seed),lattice(ix+1,iy+1,iz+dz,seed),fx),fy);return lerp(plane(0),plane(1),fz);}
function fbm(x:number,y:number,z:number,seed:number){let total=0,norm=0,amp=1,f=1;for(let i=0;i<4;i++){const weight=i===3?.5:1;total=add(total,mul(mul(noise(mul(F(x),f),mul(F(y),f),add(F(z),mul(i,F(5.17))),seed+i*101),amp),weight));norm=add(norm,mul(amp,weight));amp=mul(amp,.5);f=mul(f,2);}return F(total/norm)-.5;}

export function geometryReference(name:Name,input:Float32Array,w:number,h:number,frame:number,alpha:AlphaMode,half=false){const p=pixels(input,alpha),cx=w/2,cy=h/2;let boundary:Boundary='transparent',map:MapPoint=(x,y)=>[x,y];
 if(name==='resample')return {pixels:quantize(resize(p,w,h,21,9),half),width:21,height:9};
 switch(name){
  case 'homographyWarp':case 'cornerPin':{const m=name==='homographyWarp'?[1,.015,-.125,-.01,1,.2,.0003,-.0002,1]:pin([[.25,.25],[w-.7,.4],[w-.1,h-.3],[.4,h-.2]],w,h);map=(x,y)=>{const d=m[6]*x+m[7]*y+m[8];return Math.abs(d)<1e-12?null:[(m[0]*x+m[1]*y+m[2])/d,(m[3]*x+m[4]*y+m[5])/d];};break;}
  case 'twirl':map=(x,y)=>{const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy),radius=Math.min(w,h)*.7;if(r>=radius)return [x,y];const a=-(10+40*frame/239)*rad*(1-r/radius)**2;return [cx+dx*Math.cos(a)-dy*Math.sin(a),cy+dx*Math.sin(a)+dy*Math.cos(a)];};break;
  case 'spherize':map=(x,y)=>{const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy),radius=Math.min(w,h)*.47;if(d===0||d>=radius)return [x,y];const n=d/radius,k=Math.asin(n)/(Math.PI/2)/n;return [cx+dx*k,cy+dy*k];};break;
  case 'bulge':map=(x,y)=>{const dx=x-cx,dy=y-cy,r2=(dx/(w*.6))**2+(dy/(h*.7))**2;if(r2>=1)return [x,y];const edge=Math.max(Math.min(w,h)*.1,1),pin=Math.min(clamp(Math.min(x-.5,w-.5-x)/edge),clamp(Math.min(y-.5,h-.5-y)/edge)),k=1-.38*(1-r2)**1.5*.5*pin;return [cx+dx*k,cy+dy*k];};break;
  case 'waveWarp':map=(x,y)=>{const dx=Math.sin(31*rad),dy=-Math.cos(31*rad),u=(x-.5)/Math.max(w-1,1),v=(y-.5)/Math.max(h-1,1),pin=2*Math.min(u,1-u,v,1-v),a=Math.sin(((x*dx+y*dy)/7.3+13/360+frame/24*.1)*Math.PI*2)*.375*pin;return [x+dy*a,y-dx*a];};break;
  case 'ripple':map=(x,y)=>{const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy),radius=Math.max(w,h)*.6;if(r===0||r>=radius)return [x,y];const arg=r/4.3*2*Math.PI+(18/360-frame/24*.1)*2*Math.PI,a=.2*(1-r/radius),o=Math.sin(arg)*a,t=Math.cos(arg)*a*.5;return [x+(dx*o-dy*t)/r,y+(dy*o+dx*t)/r];};break;
  case 'mirrorWarp':map=(x,y)=>{const nx=Math.cos(23*rad),ny=Math.sin(23*rad),d=(x-cx)*nx+(y-cy)*ny;return d>0?[x-2*d*nx,y-2*d*ny]:[x,y];};break;
  case 'offset':boundary='repeat';map=(x,y)=>[x+.375,y-.625];break;
  case 'polarCoordinates':boundary='clamp';map=(x,y)=>{const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy),a=r===0?0:mod(Math.atan2(dx,-dy),2*Math.PI);return [x+(a/(2*Math.PI)*w-x)*.38,y+(h-r/Math.min(cx,cy)*h-y)*.38];};break;
  case 'turbulentDisplace':map=(x,y)=>[x+fbm(x/4.3,y/4.3,frame/240,17)*.2,y+fbm(x/4.3,y/4.3,frame/240,34)*.2];break;
  case 'opticsCompensation':map=(x,y)=>{const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy),half=20*rad,f=cx/Math.tan(half),th=r/cx*half;if(r<1e-9)return [x,y];if(th>=Math.PI/2-.0001)return null;const k=f*Math.tan(th)/r;return [cx+dx*k,cy+dy*k];};break;
  case 'magnify':map=(x,y)=>{const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy),radius=Math.min(w,h)*.4,t=clamp((r-radius+1)),weight=(1-t*t*(3-2*t))*.8;return [cx+dx/1.3,cy+dy/1.3,weight];};break;
  case 'meshWarp':{const original=grid(w,h) as XY[],dest:XY[]=[],source:XY[]=[];for(let y=0;y<=4;y++)for(let x=0;x<=4;x++){const ix=Math.min(Math.floor(x/2),1),iy=Math.min(Math.floor(y/2),1),u=(x-ix*2)/2,v=(y-iy*2)/2,ids=[iy*3+ix,iy*3+ix+1,iy*3+ix+3,iy*3+ix+4],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];dest.push([ids.reduce((s,id,k)=>s+original[id][0]*weights[k],0),ids.reduce((s,id,k)=>s+original[id][1]*weights[k],0)]);source.push([x/4*w,y/4*h]);}map=meshMap(dest,source,4,4);break;}
  case 'bezierWarp':{const e=edges(w,h),dest:XY[]=[],source:XY[]=[];for(let y=0;y<=6;y++)for(let x=0;x<=6;x++){const u=x/6,v=y/6,top=bez(e.top,u),bottom=bez([...e.bottom].reverse(),u),left=bez([...e.left].reverse(),v),right=bez(e.right,v);dest.push([(1-v)*top[0]+v*bottom[0]+(1-u)*left[0]+u*right[0]-u*w,(1-v)*top[1]+v*bottom[1]+(1-u)*left[1]+u*right[1]-v*h]);source.push([u*w,v*h]);}map=meshMap(dest,source,6,6);break;}
  case 'bend':map=(x,y)=>{const beta=12*rad,length=h-2,rho=length/beta,lx=y-1,ly=-(x-cx),theta=Math.atan2(lx,rho-ly);let u=0,v=0;if(theta>=0&&theta<=beta){u=rho*theta;v=rho-Math.hypot(lx,ly-rho);}else{const ex=lx-rho*Math.sin(beta),ey=ly-rho*(1-Math.cos(beta)),u2=ex*Math.cos(beta)+ey*Math.sin(beta);if(u2>=0){u=length+u2;v=-ex*Math.sin(beta)+ey*Math.cos(beta);}else if(lx<0){u=lx;v=ly;}else return null;}return [cx-v,1+u];};break;
  case 'lensWarp':map=(x,y)=>{const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy),radius=w*.55;if(r>=radius)return null;if(r<1e-9)return [x,y];const k=radius*(Math.asin(r/radius)/(Math.PI/2))**1.2/r;return [cx+dx*k,cy+dy*k];};break;
  case 'tiler':boundary='repeat';map=(x,y)=>{const dx=x-cx,dy=y-cy,a=11*rad;return [cx+(dx*Math.cos(a)+dy*Math.sin(a))/.87,cy+(-dx*Math.sin(a)+dy*Math.cos(a))/1.13];};break;
  case 'griddler':map=(x,y)=>{const tx=(Math.floor(x/6)+.5)*6,ty=(Math.floor(y/6)+.5)*6,dx=x-tx,dy=y-ty;if(Math.max(Math.abs(dx),Math.abs(dy))>2.7)return null;const a=12*rad;return [tx+(dx*Math.cos(a)+dy*Math.sin(a))/1.2,ty+(-dx*Math.sin(a)+dy*Math.cos(a))/.8];};break;
  case 'lensDistortion':map=(x,y)=>{const n=Math.max(w,h)/2,dx=(x-cx)/n,dy=(y-cy)/n,r=dx*dx+dy*dy,k=r*(.02+r*(-.003+r*.0002));return [x+n*(dx*k+.002*dx*dy-.002*(r+2*dx*dx)),y+n*(dy*k+.001*(r+2*dy*dy)-.004*dx*dy)];};break;
  case 'liquify':map=(x,y)=>{for(const [kind,radius,amount]of [[0,6,.4],[1,5,5*rad],[2,4,.15]]){const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy)/radius;if(r>=1)continue;const weight=(1-r*r)**2*amount;if(kind===0){x-=.5*weight;y+=.25*weight;}else if(kind===2){x+=dx*weight;y+=dy*weight;}else{const a=-weight;x+=dx*(Math.cos(a)-1)-dy*Math.sin(a);y+=dx*Math.sin(a)+dy*(Math.cos(a)-1);}}return [x,y];};break;
  case 'kaleidoscope':map=(x,y)=>{const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy),wedge=Math.PI*2/5,rotation=17*rad,a=Math.atan2(dy,dx)-rotation,folded=Math.abs(mod(a/wedge+.5,1)*wedge-wedge*.5)+rotation;return [cx+Math.cos(folded)*r,cy+Math.sin(folded)*r];};break;
  case 'cylinderWarp':map=(x,y)=>{const radius=w*.7,t=(x-cx)/radius;return Math.abs(t)>1?null:[cx+radius*(Math.asin(t)+5*rad),y];};break;
 }
 return {pixels:quantize(remap(p,w,h,map,boundary),half),width:w,height:h};
}
export function geometryChainReference(input:Float32Array,w:number,h:number,frame:number){
 const cx=w/2,cy=h/2,progress=frame/239;
 let p=quantize(input); // Centre-aligned same-size Lanczos is an exact identity.
 p=quantize(remap(Array.from(p),w,h,(x,y)=>[x,y-4*Math.sin((x/40+progress/4)*Math.PI*2)]));
 p=quantize(remap(Array.from(p),w,h,(x,y)=>{const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy),radius=Math.max(w,h)/2;if(r>=radius)return [x,y];const a=-(20+progress*30)*rad*(1-r/radius)**2;return [cx+dx*Math.cos(a)-dy*Math.sin(a),cy+dx*Math.sin(a)+dy*Math.cos(a)];}));
 p=quantize(remap(Array.from(p),w,h,(x,y)=>{const n=Math.max(w,h)/2,dx=(x-cx)/n,dy=(y-cy)/n,r=dx*dx+dy*dy,k=r*(.025-.005*r);return [x+n*dx*k,y+n*dy*k];}));
 return quantize(remap(Array.from(p),w,h,(x,y)=>{const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy),radius=Math.min(w,h)*.35,t=clamp((r-radius+4)/4);return [cx+dx/1.08,cy+dy/1.08,1-t*t*(3-2*t)];}));
}
