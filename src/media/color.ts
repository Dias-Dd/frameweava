import {EngineError} from '../core/errors.ts';
import {assertColor,pixelsFromSurface,surfaceFromPixels,type ColorEncoding,type ProfessionalSurface,type PixelFormat} from './surface.ts';
type V=[number,number,number];type M=[V,V,V];
const mul=(m:M,v:V):V=>m.map(row=>row[0]*v[0]+row[1]*v[1]+row[2]*v[2]) as V;
const product=(a:M,b:M):M=>a.map(row=>[0,1,2].map(j=>row.reduce((s,x,i)=>s+x*b[i][j],0))) as M;
function inverse(m:M):M {const [[a,b,c],[d,e,f],[g,h,i]]=m,det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);return [[e*i-f*h,c*h-b*i,b*f-c*e],[f*g-d*i,a*i-c*g,c*d-a*f],[d*h-e*g,b*g-a*h,a*e-b*d]].map(r=>r.map(v=>v/det)) as M;}
const whites={D65:[.3127,.3290],D60:[.32168,.33767]};
const primaries={rec709:[[.64,.33],[.30,.60],[.15,.06]],rec2020:[[.708,.292],[.170,.797],[.131,.046]],'display-p3':[[.68,.32],[.265,.69],[.15,.06]],acescg:[[.713,.293],[.165,.830],[.128,.044]]};
const xyz=([x,y]:number[]):V=>[x/y,1,(1-x-y)/y];
function toXYZ(c:ColorEncoding):M {const p=primaries[c.primaries].map(xyz),m=[0,1,2].map(i=>p.map(v=>v[i])) as M,scale=mul(inverse(m),xyz(whites[c.whitePoint]));return m.map(r=>r.map((v,i)=>v*scale[i])) as M;}
export function gamutMatrix(from:ColorEncoding,to:ColorEncoding):M {
  assertColor(from);assertColor(to);if(from.primaries===to.primaries&&from.whitePoint===to.whitePoint)return [[1,0,0],[0,1,0],[0,0,1]];let adapt:M=[[1,0,0],[0,1,0],[0,0,1]];
  if(from.whitePoint!==to.whitePoint){const b:M=[[.8951,.2664,-.1614],[-.7502,1.7135,.0367],[.0389,-.0685,1.0296]],a=mul(b,xyz(whites[from.whitePoint])),z=mul(b,xyz(whites[to.whitePoint]));adapt=product(inverse(b),b.map((r,i)=>r.map(v=>v*z[i]/a[i])) as M);}
  return product(inverse(toXYZ(to)),product(adapt,toXYZ(from)));
}
export function pqEncode(nits:number):number {if(!Number.isFinite(nits)||nits<0||nits>10000)throw new EngineError('E_MEDIA_RANGE','PQ encodes absolute luminance in [0,10000] nits; request explicit clipping or an output transform');const y=(nits/10000)**(2610/16384);return ((3424/4096+2413/128*y)/(1+2392/128*y))**(2523/32);}
export function pqDecode(value:number):number {if(!Number.isFinite(value)||value<0||value>1)throw new EngineError('E_MEDIA_RANGE','PQ code must be [0,1]');const p=value**(32/2523);return 10000*(Math.max(p-3424/4096,0)/(2413/128-2392/128*p))**(16384/2610);}
const signed=(v:number,fn:(x:number)=>number)=>Math.sign(v)*fn(Math.abs(v));
const curveIn=(v:number,t:string)=>t==='srgb'?signed(v,x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4):t==='rec709'?signed(v,x=>x<.081?x/4.5:((x+.099)/1.099)**(1/.45)):v;
const curveOut=(v:number,t:string)=>t==='srgb'?signed(v,x=>x<=.0031308?x*12.92:1.055*x**(1/2.4)-.055):t==='rec709'?signed(v,x=>x<.018?x*4.5:1.099*x**.45-.099):v;
const hlgIn=(v:number)=>v<=.5?v*v/3:(Math.exp((v-.55991073)/.17883277)+.28466892)/12;
const hlgOut=(v:number)=>v<=1/12?Math.sqrt(3*v):.17883277*Math.log(12*v-.28466892)+.55991073;
/** Colorimetric transform, not an ACES rendering/view transform or artistic tone mapper. */
export function transformPixels(pixels:Float32Array,from:ColorEncoding,to:ColorEncoding,alpha:'straight'|'premultiplied'|'opaque',clip=false):{pixels:Float32Array;clippedSamples:number}{
  assertColor(from);assertColor(to);if(['primaries','whitePoint','transfer','reference','range','referenceWhiteNits','peakNits','hlgSystemGamma'].every(k=>from[k as keyof ColorEncoding]===to[k as keyof ColorEncoding]))return {pixels:new Float32Array(pixels),clippedSamples:0};const m=gamutMatrix(from,to),out=new Float32Array(pixels.length);let clippedSamples=0;
  if(from.transfer==='linear'&&to.transfer==='linear'){
    for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3],f=alpha==='premultiplied'&&a!==0?1/a:1,g=alpha==='premultiplied'&&a!==0?a:1,x=pixels[i]*f*from.referenceWhiteNits,y=pixels[i+1]*f*from.referenceWhiteNits,z=pixels[i+2]*f*from.referenceWhiteNits;
      out[i]=(m[0][0]*x+m[0][1]*y+m[0][2]*z)/to.referenceWhiteNits*g;out[i+1]=(m[1][0]*x+m[1][1]*y+m[1][2]*z)/to.referenceWhiteNits*g;out[i+2]=(m[2][0]*x+m[2][1]*y+m[2][2]*z)/to.referenceWhiteNits*g;out[i+3]=a;}
    return {pixels:out,clippedSamples:0};
  }
  for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3],factor=alpha==='premultiplied'?a===0?0:1/a:1;let rgb:V=[pixels[i]*factor,pixels[i+1]*factor,pixels[i+2]*factor];
    if(from.transfer==='pq')rgb=rgb.map(pqDecode) as V;
    else if(from.transfer==='hlg'){if(rgb.some(v=>v<0||v>1))throw new EngineError('E_MEDIA_RANGE','HLG codes must be [0,1]');rgb=rgb.map(hlgIn) as V;const y=Math.max(0,.2627*rgb[0]+.6780*rgb[1]+.0593*rgb[2]),f=y**(from.hlgSystemGamma!-1)*from.peakNits!;rgb=rgb.map(v=>v*f) as V;}
    else rgb=rgb.map(v=>curveIn(v,from.transfer)*from.referenceWhiteNits) as V;
    rgb=mul(m,rgb);
    if(to.transfer==='pq'){rgb=rgb.map(v=>{if(clip&&(v<0||v>10000)){clippedSamples++;v=Math.max(0,Math.min(10000,v));}return pqEncode(v);}) as V;}
    else if(to.transfer==='hlg'){rgb=rgb.map(v=>{if(v<0||v>to.peakNits!){if(!clip)throw new EngineError('E_MEDIA_RANGE','Display HLG luminance outside its explicit peak');clippedSamples++;return Math.max(0,Math.min(to.peakNits!,v));}return v;}) as V;
      const normalized=rgb.map(v=>v/to.peakNits!) as V,y=.2627*normalized[0]+.6780*normalized[1]+.0593*normalized[2],gain=y>0?y**((1-to.hlgSystemGamma!)/to.hlgSystemGamma!):0;rgb=normalized.map(v=>hlgOut(v*gain)) as V;}
    else rgb=rgb.map(v=>curveOut(v/to.referenceWhiteNits,to.transfer)) as V;
    for(let c=0;c<3;c++)out[i+c]=rgb[c]*(alpha==='premultiplied'?a:1);out[i+3]=a;
  }return {pixels:out,clippedSamples};
}
export function transformSurface(surface:ProfessionalSurface,to:ColorEncoding,options:{format?:PixelFormat;clip?:boolean}={}){
  const result=transformPixels(pixelsFromSurface(surface),surface.color,to,surface.alpha,options.clip);
  return {surface:surfaceFromPixels(surface.width,surface.height,result.pixels,{format:options.format??'rgba32float',color:to,alpha:surface.alpha}),clippedSamples:result.clippedSamples};
}
export interface CubeLut {kind:'1d'|'3d';size:number;domainMin:V;domainMax:V;values:number[]}
export function parseCube(text:string):CubeLut {
  let kind:CubeLut['kind']='3d',size=0,min:V=[0,0,0],max:V=[1,1,1];const values:number[]=[];
  for(const raw of text.split(/\r?\n/)){const line=raw.replace(/#.*/,'').trim();if(!line||line.startsWith('TITLE'))continue;const [key,...rest]=line.split(/\s+/);
    if(key==='LUT_1D_SIZE'||key==='LUT_3D_SIZE'){if(size)throw new EngineError('E_MEDIA_LUT','One LUT per cube file');kind=key==='LUT_1D_SIZE'?'1d':'3d';size=Number(rest[0]);}
    else if(key==='DOMAIN_MIN')min=rest.map(Number) as V;else if(key==='DOMAIN_MAX')max=rest.map(Number) as V;else values.push(...[key,...rest].map(Number));}
  if(!Number.isInteger(size)||size<2||size>(kind==='3d'?129:65536)||min.length!==3||max.length!==3||min.some((v,i)=>!Number.isFinite(v)||v>=max[i])||values.length!==(kind==='3d'?size**3:size)*3||values.some(v=>!Number.isFinite(v)))throw new EngineError('E_MEDIA_LUT','Invalid cube size/domain/data');return {kind,size,domainMin:min,domainMax:max,values};
}
export function applyCube(pixels:Float32Array,lut:CubeLut,domain:'error'|'clamp'='error'):Float32Array {
  const out=new Float32Array(pixels);for(let i=0;i<pixels.length;i+=4){const p=[0,1,2].map(c=>{const x=(pixels[i+c]-lut.domainMin[c])/(lut.domainMax[c]-lut.domainMin[c]);if(domain==='error'&&(x<0||x>1))throw new EngineError('E_MEDIA_LUT_DOMAIN','Sample outside LUT domain; request explicit clamp');return Math.max(0,Math.min(1,x))*(lut.size-1);});
    if(lut.kind==='1d')for(let c=0;c<3;c++){const lo=Math.floor(p[c]),hi=Math.min(lo+1,lut.size-1),f=p[c]-lo;out[i+c]=lut.values[lo*3+c]*(1-f)+lut.values[hi*3+c]*f;}
    else{const lo=p.map(Math.floor),f=p.map((v,c)=>v-lo[c]);for(let c=0;c<3;c++){let value=0;for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){const at=((Math.min(lo[2]+z,lut.size-1)*lut.size+Math.min(lo[1]+y,lut.size-1))*lut.size+Math.min(lo[0]+x,lut.size-1))*3+c;value+=lut.values[at]*(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);}out[i+c]=value;}}
  }return out;
}
