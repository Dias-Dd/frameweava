// Test-only independent Float64 reference. Never imported by a production Stage.
import {fromHalf,toHalf} from '../../../src/media/surface.ts';
import type {TransitionName} from '../src/native-transitions/kernels.ts';
export interface Field {width:number;height:number;pixels:Float32Array;alpha:'straight'|'premultiplied'|'opaque'}
type V=number[];
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a:V,b:V,t:number)=>a.map((v,i)=>v*(1-t)+b[i]*t);
const frac=(x:number)=>x-Math.floor(x);
const rotate=(x:number,y:number,a:number)=>[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];
function hashCell(x:number,y:number,seed:number){let h=Math.imul(x,0x8da6b343)^Math.imul(y,0xd8163841)^Math.imul(seed,0xcb1ab31f);h^=h>>>13;h=Math.imul(h,0x5bd1e995);h^=h>>>15;return (h&0x00ffffff)/16777216;}
function raw(f:Field,x:number,y:number,edge=false):V{if(edge){x=clamp(x,0,f.width-1);y=clamp(y,0,f.height-1);}if(x<0||y<0||x>=f.width||y>=f.height)return [0,0,0,0];return Array.from(f.pixels.subarray((y*f.width+x)*4,(y*f.width+x)*4+4));}
function pm(f:Field,x:number,y:number,edge=false):V{const p=raw(f,x,y,edge);if(f.alpha==='straight')return [p[0]*p[3],p[1]*p[3],p[2]*p[3],p[3]];return p;}
function sample(f:Field,x:number,y:number,edge:boolean):V{if(edge){x=clamp(x,0,f.width-1);y=clamp(y,0,f.height-1);}if(x< -1||y< -1||x>=f.width||y>=f.height)return [0,0,0,0];const i=Math.floor(x),j=Math.floor(y);return mix(mix(pm(f,i,j,edge),pm(f,i+1,j,edge),x-i),mix(pm(f,i,j+1,edge),pm(f,i+1,j+1,edge),x-i),y-j);}
/** Reference is against the declared parameter words, not unquantized JS options.
 * Mask phase/trig is F32 in production; final media is not an AE parity oracle. */
export function transitionReference(name:TransitionName,a:Field,b:Field,m:Field,p:Float32Array,half=false){
 const {width:w,height:h}=a,u=new Uint32Array(p.buffer,p.byteOffset,p.length),t=p[0]+p[1],cx=p[4],cy=p[5],edge=u[13]!==0;
 const cov=(rank:number)=>{const s=p[2];if(s===0)return Number(t-rank>=0);const q=clamp((t*(1+s)-rank)/s);return q*q*(3-2*q);};
 const mask=(x:number,y:number)=>{const v=raw(m,clamp(x,0,w-1),clamp(y,0,h-1));let c=v.slice(0,3);if(m.alpha==='premultiplied')c=v[3]>0?c.map(n=>n/v[3]):[0,0,0];let g=c[0]*p[22]+c[1]*p[23]+c[2]*p[24];const k=u[27];if(k<3)g=c[k];else if(k===3)g=v[3];else if(k>=5){const mx=Math.max(...c),mn=Math.min(...c),d=mx-mn;g=(mx+mn)*.5;if(k===6){g=0;if(d>0){g=mx===c[0]?(c[1]-c[2])/d:mx===c[1]?(c[2]-c[0])/d+2:(c[0]-c[1])/d+4;g=frac(g/6);}}if(k===7){const scale=Math.max(...c.map(Math.abs));g=scale>0?d/scale:0;}}return clamp((g-p[20])/(p[21]-p[20]));};
 const gradient=(x:number,y:number)=>[(mask(x+1,y)-mask(x-1,y))*.5,(mask(x,y+1)-mask(x,y-1))*.5];
 const out=new Float32Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const A=pm(a,x,y),B=pm(b,x,y),uv=[(x+.5)/w,(y+.5)/h],d=[(uv[0]-cx)*w,(uv[1]-cy)*h],far=[Math.max(cx,1-cx)*w,Math.max(cy,1-cy)*h];
  const at=(q:V)=>sample(a,q[0],q[1],edge),bt=(q:V)=>sample(b,q[0],q[1],edge),inside=(q:V)=>q[0]>=-.5&&q[1]>=-.5&&q[0]<w-.5&&q[1]<h-.5;
  let v:V=A;
  if(t>=1)v=B;else if(t>0)switch(name){
   case 'crossDissolve':v=mix(A,B,t);break;
   case 'fadeThroughColor':v=t<.5?mix(A,Array.from(p.slice(16,20)),t*2):mix(Array.from(p.slice(16,20)),B,(t-.5)*2);break;
   case 'directionalWipe':v=mix(A,B,cov((uv[0]-.5)*p[25]+(uv[1]-.5)*p[26]+.5));break;
   case 'clockWipe':v=mix(A,B,cov(d[0]||d[1]?frac(Math.atan2(d[1],d[0])/Math.PI/2-p[3]):0));break;
   case 'irisWipe':v=mix(A,B,cov(Math.hypot(...d)/Math.hypot(...far)));break;
   case 'diamondWipe':v=mix(A,B,cov((Math.abs(d[0])+Math.abs(d[1]))/(far[0]+far[1])));break;
   case 'boxWipe':v=mix(A,B,cov(Math.max(Math.abs(d[0])/far[0],Math.abs(d[1])/far[1])));break;
   case 'venetianWipe':v=mix(A,B,cov(frac(uv[u[11]]*u[6])));break;
   case 'checkerWipe':{const q=[uv[0]*u[6],uv[1]*u[7]];v=mix(A,B,cov((frac(q[0])+frac(q[1]))*.25+((Math.floor(q[0])+Math.floor(q[1]))&1)*.5));break;}
   case 'randomBlocksWipe':v=mix(A,B,cov(hashCell(Math.floor(uv[0]*u[6]),Math.floor(uv[1]*u[7]),u[12])));break;
   case 'orderedDissolve':{const i=x&3,j=y&3,lo=((i^j)&1)*2+(j&1),hi=(((i>>1)^(j>>1))&1)*2+((j>>1)&1);v=mix(A,B,cov((lo*4+hi+.5)/16));break;}
   case 'lumaWipe':{const q=raw(m,x,y),rgb=m.alpha==='premultiplied'?(q[3]>0?q.slice(0,3).map(c=>c/q[3]):[0,0,0]):q.slice(0,3);v=mix(A,B,cov(clamp((rgb.reduce((s,c,i)=>s+c*p[22+i],0)-p[20])/(p[21]-p[20]))));break;}
   case 'alphaWipe':v=mix(A,B,cov(clamp((raw(m,x,y)[3]-p[20])/(p[21]-p[20]))));break;
   case 'pushTransition':case 'slideTransition':{const dd=[p[25]*w,p[26]*h],pa=[x-t*dd[0],y-t*dd[1]],pb=[x+(1-t)*dd[0],y+(1-t)*dd[1]];v=name==='pushTransition'?(inside(pa)?at(pa):bt(pb)):(inside(pb)?bt(pb):A);break;}
   case 'splitTransition':{const axis=u[11],right=uv[axis]>=.5,pa=[x,y];pa[axis]-=(right?1:-1)*t*[w,h][axis]*.5;const mid=[w,h][axis]*.5-.5;v=inside(pa)&&(right?pa[axis]>=mid:pa[axis]<mid)?at(pa):B;break;}
   case 'zoomTransition':v=mix(at([cx*w-.5+d[0]*(1+t*p[8]),cy*h-.5+d[1]*(1+t*p[8])]),bt([cx*w-.5+d[0]*(1+(1-t)*p[8]),cy*h-.5+d[1]*(1+(1-t)*p[8])]),t);break;
   case 'rotateTransition':{const qa=rotate(d[0],d[1],t*p[8]*2*Math.PI),qb=rotate(d[0],d[1],(t-1)*p[8]*2*Math.PI);v=mix(at([cx*w-.5+qa[0],cy*h-.5+qa[1]]),bt([cx*w-.5+qb[0],cy*h-.5+qb[1]]),t);break;}
   case 'rippleTransition':{const q=[(uv[0]-.5)*w/h,uv[1]-.5],wave=Math.sin(2*Math.PI*(Math.hypot(...q)*p[9]-t*p[10]))*p[8]*t*(1-t);v=mix(at([x+q[0]*wave,y+q[1]*wave]),B,t);break;}
   case 'displacementTransition':{const q=raw(m,x,y);let rg=q.slice(0,2);if(m.alpha==='premultiplied')rg=q[3]>0?rg.map(c=>c/q[3]):[(p[20]+p[21])*.5,(p[20]+p[21])*.5];const off=rg.map(c=>((c-p[20])/(p[21]-p[20])*2-1)*p[8]);v=mix(at([x+off[0]*t,y+off[1]*t]),bt([x-off[0]*(1-t),y-off[1]*(1-t)]),t);break;}
   case 'starWipe':{const angle=d[0]||d[1]?Math.atan2(d[1],d[0]):0,r=p[8]+(1-p[8])*(.5+.5*Math.cos(angle*u[6]));v=mix(A,B,cov(Math.hypot(...d)*p[8]/(Math.hypot(...far)*r)));break;}
   case 'cardFlipWipe':{const cell=[Math.floor(uv[0]*u[6]),Math.floor(uv[1]*u[7])],q=[frac(uv[0]*u[6])-.5,frac(uv[1]*u[7])-.5],phase=clamp(t*(1+p[28])-cell[0]/Math.max(u[6]-1,1)*p[28]),k=Math.cos(phase*Math.PI);q[u[11]]/=Math.abs(k);if(Math.abs(k)<.0001||q.some(c=>Math.abs(c)>.5))v=[0,0,0,0];else {const xy=[(cell[0]+.5+q[0])/u[6]*w-.5,(cell[1]+.5+q[1])/u[7]*h-.5];v=k<0?bt(xy):at(xy);v=v.map((c,i)=>i===3?c:c*(1-p[29]*(1-Math.abs(k))));}break;}
   case 'glassWipe':case 'warpTransition':{const q=cov(mask(x,y)),g=gradient(x,y);if(name==='glassWipe'){const off=g.map(c=>c*p[8]*4*q*(1-q)*10);v=mix(at([x+off[0],y+off[1]]),bt([x-off[0],y-off[1]]),q);}else {const aoff=g.map(c=>c*p[8]*q);let boff=g.map(c=>c*p[8]*(1-q));if(u[30]===1)boff=boff.map(c=>-c);if(u[30]===2)boff=[-boff[1],boff[0]];v=mix(at([x+aoff[0],y+aoff[1]]),bt([x+boff[0],y+boff[1]]),q);}break;}
   case 'imageWipe':v=mix(A,B,cov(u[31]?1-mask(x,y):mask(x,y)));break;
   case 'gridWipe':{const q=rotate(d[0],d[1],-p[3]),cs=[w/u[6],h/u[7]],cc=q.map((c,i)=>(Math.floor(c/cs[i])+.5)*cs[i]);let rank=u[30]===0?Math.abs(cc[0])/Math.hypot(...far):u[30]===2?Math.max(...cc.map(Math.abs))/Math.max(...far):Math.hypot(...cc)/Math.hypot(...far);rank=clamp(rank);if(u[31])rank=1-rank;const pr=clamp((t*1.25-rank)/.25),metric=Math.max(...q.map((c,i)=>Math.abs((c-cc[i])/cs[i])*2));let keep=p[2]>0?clamp((1-pr-metric)/p[2]+.5):Number(metric<1-pr);if(pr===0)keep=1;v=mix(A,B,1-keep);break;}
   case 'jawsWipe':{const q=rotate(d[0],d[1],-p[3]),ph=frac(q[0]/(w/u[6]));let tooth=1-4*Math.abs(ph-.5);if(u[30]===1)tooth=clamp(tooth*2,-1,1);if(u[30]===2)tooth=ph<.5?1:-1;if(u[30]===3)tooth=Math.sin(ph*2*Math.PI);tooth*=p[8];const travel=t*(Math.hypot(w,h)+Math.abs(p[8]));let sy=q[1],hit=true;if(sy+travel<tooth)sy+=travel;else if(sy-travel>=tooth)sy-=travel;else hit=false;const xy=rotate(q[0],sy,p[3]);v=hit?at([xy[0]+cx*w-.5,xy[1]+cy*h-.5]):B;break;}
   case 'lightWipe':{const q=cov((uv[0]-.5)*p[25]+(uv[1]-.5)*p[26]+.5),band=4*q*(1-q)*p[8];v=mix(A,B,q);v=v.map((c,i)=>i===3?c:c+p[16+i]*band*v[3]);break;}
   case 'lineSweepWipe':{let k=Math.floor(uv[1]*u[7]);if(u[31])k=u[7]-1-k;const rank=(uv[0]+Math.abs(p[8])*(p[8]<0?u[7]-1-k:k)/u[7])/(1+Math.abs(p[8]));v=mix(A,B,cov(rank));break;}
   case 'radialScaleWipe':{const radius=Math.hypot(...d),maxd=Math.hypot(...far);if(u[31])v=radius>=(1-t)*maxd?B:at([cx*w+d[0]/(1-t)-.5,cy*h+d[1]/(1-t)-.5]);else {const hole=t*maxd,rs=(radius-hole)/(1-t);v=radius<=hole?B:at([cx*w+d[0]/radius*rs-.5,cy*h+d[1]/radius*rs-.5]);}break;}
   case 'scaleWipe':{const q=cov((uv[0]-.5)*p[25]+(uv[1]-.5)*p[26]+.5),l=Math.hypot(p[25],p[26]),dir=[p[25]/l,p[26]/l],delta=[(uv[0]-.5)*w,(uv[1]-.5)*h],distance=delta[0]*dir[0]+delta[1]*dir[1],back=distance>0?distance-distance/(1+p[8]*t):0;v=mix(at([x-dir[0]*back,y-dir[1]*back]),B,q);break;}
   case 'twisterTransition':{const q=rotate(d[0],d[1],-p[3]),order=clamp(q[0]/(Math.hypot(w,h)*.5)*.5+.5),phase=clamp(t*2-order),k=Math.cos(Math.PI*phase);if(Math.abs(k)<.0001)v=[0,0,0,0];else {const xy=rotate(q[0],q[1]/k,p[3]);v=k<0?bt([xy[0]+cx*w-.5,xy[1]+cy*h-.5]):at([xy[0]+cx*w-.5,xy[1]+cy*h-.5]);v=v.map((c,i)=>i===3?c:c*(1-p[29]*(1-Math.abs(k))));}break;}
  }
  for(let c=0;c<4;c++)out[(y*w+x)*4+c]=half?fromHalf(toHalf(v[c])):v[c];
 }
 return out;
}
