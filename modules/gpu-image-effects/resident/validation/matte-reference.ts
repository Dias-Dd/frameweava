// Acceptance-only scalar reference: brute-force 2D windows, not the GPU's
// ternary interval decomposition. Never imported by effect runtime/bindings.
const f=Math.fround;
export function morphology(p:Float32Array,w:number,h:number,radius:number,operation:'erode'|'dilate'|'open'|'close',axis:'both'|'horizontal'|'vertical'='both',clamp=false){
 function integer(src:Float32Array,r:number,max:boolean){const out=new Float32Array(src.length),rx=axis==='vertical'?0:r,ry=axis==='horizontal'?0:r;for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(!max&&!clamp&&(x-rx<0||y-ry<0||x+rx>=w||y+ry>=h)){out[y*w+x]=0;continue;}
  let v=max?0:1;for(let yy=Math.max(0,y-ry);yy<=Math.min(h-1,y+ry);yy++)for(let xx=Math.max(0,x-rx);xx<=Math.min(w-1,x+rx);xx++)v=max?Math.max(v,src[yy*w+xx]):Math.min(v,src[yy*w+xx]);out[y*w+x]=v;
 }return out;}
 function fractional(src:Float32Array,max:boolean){const r=Math.floor(f(radius)),t=f(f(radius)-r),a=integer(src,r,max);if(t===0)return a;const b=integer(src,r+1,max);return Float32Array.from(a,(x,i)=>f((1-t)*x+t*b[i]));}
 const max=operation==='dilate'||operation==='close',a=fractional(p,max);return operation==='open'||operation==='close'?fractional(a,!max):a;
}
export function feather(p:Float32Array,w:number,h:number,sigma:number,clamp=false){const r=Math.ceil(3*f(sigma)),weights=sigma===0?[1]:Array.from({length:2*r+1},(_,i)=>Math.exp(-.5*((i-r)/f(sigma))**2)),sum=weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++)weights[i]/=sum;
 let a=p;for(const axis of [0,1]){const b=new Float32Array(p.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0;for(let k=-r;k<=r;k++){let xx=axis===0?x+k:x,yy=axis===1?y+k:y;if(clamp){xx=Math.max(0,Math.min(w-1,xx));yy=Math.max(0,Math.min(h-1,yy));}else if(xx<0||yy<0||xx>=w||yy>=h)continue;s+=a[yy*w+xx]*weights[k+r];}b[y*w+x]=f(s);}a=b;}return a;
}
export function levels(p:Float32Array,black:number,white:number,gamma=1,invert=false){black=f(black);white=f(white);gamma=f(gamma);return Float32Array.from(p,a=>{const x=a<=black?0:a>=white?1:f((a-black)/(white-black)),v=f(x**(1/gamma));return invert?f(1-v):v;});}
export function maskPixels(alpha:Float32Array){const p=new Float32Array(alpha.length*4);for(let i=0;i<alpha.length;i++)p[4*i+3]=alpha[i];return p;}
export function apply(image:Float32Array,alpha:Float32Array,straight=false){const p=new Float32Array(image.length);for(let i=0;i<alpha.length;i++)for(let c=0;c<4;c++)p[4*i+c]=f((straight&&c!==3?f(image[4*i+c]*image[4*i+3]):image[4*i+c])*alpha[i]);return p;}
export function matteScene(w:number,h:number,frame:number){const image=new Float32Array(w*h*4),alpha=new Float32Array(w*h),cx=w*(.4+.2*frame/2);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=y*w+x;image.set([2+.005*x,.3+.003*y,-.08,1],4*at);const body=(x-cx)**2+(y-45)**2<24**2,hole=Math.abs(x-cx)<2&&Math.abs(y-45)<2,spot=(x===12&&y===12)||(x===140&&y===73);alpha[at]=spot||body&&!hole?1:0;}return {image,alpha};}
export function matteSceneReference(w:number,h:number,frame:number){const {image,alpha}=matteScene(w,h,frame),opened=morphology(alpha,w,h,1,'open'),closed=morphology(opened,w,h,2,'close'),soft=feather(closed,w,h,1.1),remapped=levels(soft,.1+.05*frame,.85);return apply(image,remapped);}
