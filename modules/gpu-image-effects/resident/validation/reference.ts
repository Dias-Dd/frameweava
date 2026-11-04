// Numerical acceptance oracle only. Never imported by the shipped GPU path.
// Scalar JS/F64 equations, with explicit F32 logical-publication boundaries.
export type Pixel=[number,number,number,number];
export const f=Math.fround;
export const smooth=(x:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const weights=[.2126,.7152,.0722].map(f);
export function key(v:Pixel,kind:'chroma'|'luma',low:number,high:number,invert=false):Pixel{
 if(v[3]===0)return v;
 const c=v.slice(0,3).map(x=>f(x/v[3]));let metric:number;
 if(kind==='luma')metric=c.reduce((s,x,i)=>s+x*weights[i],0);
 else{const d=c.map((x,i)=>x-[0,1,0][i]),y=d.reduce((s,x,i)=>s+x*weights[i],0);metric=Math.hypot(d[2]-y,d[0]-y);}
 let k=smooth(metric,f(low),f(high));if(invert)k=1-k;
 return v.map(x=>f(x*k)) as Pixel;
}
export function spill(v:Pixel,amount=.5):Pixel {const q=[...v] as Pixel;q[1]=f(q[1]-Math.max(0,q[1]-Math.max(q[0],q[2]))*f(amount));return q;}
export function mix(v:Pixel,m:number[][],offset=[0,0,0]):Pixel{return [...m.map((r,i)=>f(r.reduce((s,x,c)=>s+f(x)*v[c],0)+f(offset[i])*v[3])),v[3]] as Pixel;}
export function level(v:Pixel,outWhite=[1,1,1],gamma=[1,1,1]):Pixel{return [...v.slice(0,3).map((x,i)=>v[3]===0&&gamma[i]!==1?x:f((gamma[i]===1?x:Math.sign(x)*Math.abs(f(x/v[3]))**(1/f(gamma[i]))*v[3])*f(outWhite[i]))),v[3]] as Pixel;}
// Independent 3-knot monotone cubic for the actual acceptance red curve.
export function redCurve(x:number){const middle=f(.55),d0=2*middle,d1=2*(1-middle),m0=(3*d0-d1)/2,m2=(3*d1-d0)/2,m1=2/(1/d0+1/d1);
 if(x<=0)return x*m0;if(x>=1)return 1+(x-1)*m2;
 const right=x>=.5,t=(x-(right?.5:0))*2,h=.5,y0=right?middle:0,y1=right?1:middle,a=right?m1:m0,b=right?m2:m1;
 return (2*t**3-3*t*t+1)*y0+(t**3-2*t*t+t)*h*f(a)+(-2*t**3+3*t*t)*y1+(t**3-t*t)*h*f(b);
}
export function curve(v:Pixel):Pixel{if(v[3]===0)return v;return [f(redCurve(f(v[0]/v[3]))*v[3]),v[1],v[2],v[3]];}
export function mapPixels(p:Float32Array,fn:(v:Pixel)=>Pixel){const out=new Float32Array(p.length);for(let i=0;i<p.length;i+=4)out.set(fn(Array.from(p.subarray(i,i+4)) as Pixel),i);return out;}
export function unsharp(p:Float32Array,width:number,height:number,sigma:number,amount:number){
 const r=Math.ceil(3*f(sigma)),w=sigma===0?[1]:Array.from({length:2*r+1},(_,i)=>Math.exp(-.5*((i-r)/f(sigma))**2)),sum=w.reduce((a,b)=>a+b,0);for(let i=0;i<w.length;i++)w[i]/=sum;
 let src=mapPixels(p,v=>v[3]===0?[0,0,0,0]:v);
 for(const axis of [0,1]){const dst=new Float32Array(p.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<4;c++){let s=0;for(let k=-r;k<=r;k++){const xx=axis===0?Math.max(0,Math.min(width-1,x+k)):x,yy=axis===1?Math.max(0,Math.min(height-1,y+k)):y;s+=src[(yy*width+xx)*4+c]*w[k+r];}dst[(y*width+x)*4+c]=f(s);}src=dst;}
 const out=new Float32Array(p);for(let i=0;i<p.length;i+=4)if(p[i+3]!==0){for(let c=0;c<3;c++)out[i+c]=f(p[i+c]+f(amount)*(p[i+c]-src[i+c]*(p[i+3]/src[i+3])));}return out;
}
export function sourceScene(width:number,height:number,frame:number){const p=new Float32Array(width*height*4),cx=width*(.35+.3*frame/2);for(let y=0;y<height;y++)for(let x=0;x<width;x++)p.set((x-cx)**2+(y-height*.5)**2<22**2?[2+.006*x,.4+.002*y,-.05,1]:[0,1,0,1],(y*width+x)*4);return p;}
export function sceneReference(width:number,height:number,frame:number){let p=sourceScene(width,height,frame);p=mapPixels(p,v=>key(v,'chroma',.05,.2));p=mapPixels(p,v=>spill(v));p=mapPixels(p,v=>level(v,[f(.9+.1*frame),1,1]));p=mapPixels(p,curve);p=mapPixels(p,v=>mix(v,[[1,.05,0],[0,1,0],[0,0,1]]));p=mapPixels(p,v=>key(v,'luma',.01,.05));return unsharp(p,width,height,1.25,.5);}
