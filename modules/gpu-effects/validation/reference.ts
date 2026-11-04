// Independent scalar CPU oracle. Never used in a timed GPU path.
import type {ResolvedEffect} from '../parameters.ts';
const clamp=(x:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
const linear=(x:number)=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);
const encoded=(value:number)=>{const x=clamp(value);return x<=.0031308?x*12.92:1.055*Math.pow(x,1/2.4)-.055;};
function write(dst:Uint8Array,i:number,rgb:number[],alpha:number){dst[i+3]=Math.round(clamp(alpha)*255);for(let k=0;k<3;k++)dst[i+k]=alpha<=0?0:Math.round(clamp(rgb[k])*255);}
function blur(source:Uint8Array,w:number,h:number,dx:number,dy:number){
  const out=new Uint8Array(source.length),weights=[1,4,6,4,1];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const rgb=[0,0,0];let alpha=0;
    for(let n=0;n<5;n++){const i=(clamp(y+dy*(n-2),0,h-1)*w+clamp(x+dx*(n-2),0,w-1))*4,a=source[i+3]/255,weight=weights[n]/16;alpha+=a*weight;for(let k=0;k<3;k++)rgb[k]+=linear(source[i+k]/255)*a*weight;}
    write(out,(y*w+x)*4,rgb.map(v=>encoded(v/Math.max(alpha,1e-6))),alpha);
  }
  return out;
}
export function reference(input:Uint8Array|Uint8ClampedArray,w:number,h:number,effects:ResolvedEffect[]){
  let data=new Uint8Array(input);
  for(const effect of effects){
    if(effect.kind==='blur'){data=blur(blur(data,w,h,effect.radius,0),w,h,0,effect.radius);continue;}
    const out=new Uint8Array(data.length);
    if(effect.kind==='color')for(let i=0;i<data.length;i+=4){const rgb=[0,1,2].map(k=>linear(data[i+k]/255)),l=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];write(out,i,rgb.map((v,k)=>encoded((l+(v-l)*effect.saturation)*effect.gain[k])),data[i+3]/255);}
    else{
      const mask=new Uint8Array(data.length);
      for(let i=0;i<data.length;i+=4){const rgb=[0,1,2].map(k=>data[i+k]/255),l=rgb.map(linear),y=.2126*l[0]+.7152*l[1]+.0722*l[2];write(mask,i,rgb,data[i+3]/255*(effect.threshold===1?0:clamp((y-effect.threshold)/(1-effect.threshold))));}
      const glow=blur(blur(mask,w,h,effect.radius,0),w,h,0,effect.radius);
      for(let i=0;i<data.length;i+=4){const ba=data[i+3]/255,ga=glow[i+3]/255,a=clamp(ba+(1-ba)*ga*effect.intensity);write(out,i,[0,1,2].map(k=>encoded((linear(data[i+k]/255)*ba+linear(glow[i+k]/255)*ga*effect.intensity)/Math.max(a,1e-6))),a);}
    }
    data=out;
  }
  // Final premultiplied GPU canvas, then Canvas2D unpremultiplication, both 8-bit.
  for(let i=0;i<data.length;i+=4){const a=data[i+3];for(let k=0;k<3;k++)data[i+k]=a?Math.round(Math.round(data[i+k]*a/255)*255/a):0;}
  return data;
}
export function difference(a:ArrayLike<number>,b:ArrayLike<number>){
  if(a.length!==b.length)throw Error('Image sizes differ');
  let rgbaMax=0,rgbaSum=0,alphaMax=0,alphaSum=0,blackMax=0,whiteMax=0,blackSum=0,whiteSum=0,changed=0;
  for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);rgbaMax=Math.max(rgbaMax,d);rgbaSum+=d;if(d)changed++;if(i%4===3){alphaMax=Math.max(alphaMax,d);alphaSum+=d;}}
  for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++){
    const aa=a[i+3]/255,ba=b[i+3]/255,dark=Math.abs(a[i+k]*aa-b[i+k]*ba),light=Math.abs((a[i+k]*aa+255*(1-aa))-(b[i+k]*ba+255*(1-ba)));
    blackMax=Math.max(blackMax,dark);whiteMax=Math.max(whiteMax,light);blackSum+=dark;whiteSum+=light;
  }
  return {rgbaMax,rgbaMAE:rgbaSum/a.length,alphaMax,alphaMAE:alphaSum/(a.length/4),blackCompositeMax:blackMax,blackCompositeMAE:blackSum/(a.length/4*3),whiteCompositeMax:whiteMax,whiteCompositeMAE:whiteSum/(a.length/4*3),changedChannels:changed};
}
