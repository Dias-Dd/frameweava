import type {LayerSpec} from '../core/types.ts';
import {EngineError} from '../core/errors.ts';
import {pixelsFromSurface,surfaceFromPixels,srgb,assertColor,type ProfessionalSurface,type ColorEncoding} from './surface.ts';
import {transformPixels} from './color.ts';
import {multiply,matrix,invert,type Affine as A} from './compositor-geometry.ts';
export interface MediaPolicy {workingColor:ColorEncoding;legacySdr?:'srgb';transport?:'base64'|'buffer-v1';previewCompute?:boolean;preview?:{color:ColorEncoding;clip:boolean;ocio?:Omit<import('./ocio.ts').OcioTransform,'outputColor'>}}
export interface ProfessionalFrame {surface:ProfessionalSurface;diagnostics:import('../core/types.ts').Diagnostic[];stageOutputs:Record<string,Record<string,import('../core/types.ts').PortValue>>;cacheHits:number;compositeCacheHit?:boolean}
export function assertMediaPolicy(policy:MediaPolicy):void {if(!policy||Object.keys(policy).some(k=>!['workingColor','legacySdr','preview','transport','previewCompute'].includes(k)))throw new EngineError('E_MEDIA_POLICY','Explicit working/preview policy required for professional surfaces');assertColor(policy.workingColor);if(policy.transport!==undefined&&!['base64','buffer-v1'].includes(policy.transport)||policy.previewCompute!==undefined&&typeof policy.previewCompute!=='boolean')throw new EngineError('E_MEDIA_POLICY','Explicit supported transport and boolean previewCompute required');if(policy.workingColor.transfer!=='linear'||policy.workingColor.reference!=='scene')throw new EngineError('E_MEDIA_WORKING_SPACE','Compositing requires an explicit scene-linear working space');if(policy.legacySdr!==undefined&&policy.legacySdr!=='srgb')throw new EngineError('E_MEDIA_COLOR','Unknown legacy SDR interpretation');if(policy.preview){assertColor(policy.preview.color);if(typeof policy.preview.clip!=='boolean')throw new EngineError('E_MEDIA_POLICY','Preview clipping policy must be explicit');}}
/** Premultiplied scene-linear floating point. RGB is never normalized/clipped to [0,1]. */
export function blendPixel(dst:Float32Array,at:number,src:ArrayLike<number>,mode:LayerSpec['blend']='source-over',opacity=1,srcAt=0):void {
  const as=src[srcAt+3]*opacity,ab=dst[at+3],alpha=mode==='lighter'?Math.min(1,as+ab):as+ab*(1-as);
  for(let c=0;c<3;c++){const cs=src[srcAt+c]*opacity,cb=dst[at+c];
    if(mode==='lighter')dst[at+c]=cs+cb;
    else if(mode==='source-over')dst[at+c]=cs+cb*(1-as);
    else{const s=as?cs/as:0,b=ab?cb/ab:0,m=mode==='multiply'?s*b:s+b-s*b;dst[at+c]=cs*(1-ab)+cb*(1-as)+as*ab*m;}
  }dst[at+3]=alpha;
}
export function compositeMedia(options:{width:number;height:number;compositionWidth:number;compositionHeight:number;background:string;layers:LayerSpec[];surfaces:Record<string,ProfessionalSurface>;sizes:Record<string,{width:number;height:number}>;workingColor:ColorEncoding;frame:number;timing?:(phase:string,durationMs:number)=>void}):ProfessionalSurface {
  const {width,height,layers,surfaces,sizes,workingColor,frame}=options;assertMediaPolicy({workingColor});
  const started=performance.now();let decodeMs=0,colorMs=0;
  const decoded=new Map<string,{data:Float32Array;width:number;height:number}>();
  for(const [key,s]of Object.entries(surfaces)){const t=performance.now();let data=pixelsFromSurface(s);decodeMs+=performance.now()-t;if(JSON.stringify(s.color)!==JSON.stringify(workingColor)){const c=performance.now();data=transformPixels(data,s.color,workingColor,s.alpha).pixels;colorMs+=performance.now()-c;}
    if(s.alpha!=='premultiplied')for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++)data[i+c]*=data[i+3];decoded.set(key,{data,width:s.width,height:s.height});}
  const out=new Float32Array(width*height*4),byParent=new Map<string|undefined,LayerSpec[]>();
  for(const l of layers)if(frame>=l.start&&frame<l.end){if(l.effects?.length)throw new EngineError('E_MEDIA_EFFECT','Canvas-only layer filters cannot process HDR; execute a float-capable Stage first');const list=byParent.get(l.parent)??[];list.push(l);byParent.set(l.parent,list);}
  if(options.background&&options.background!=='transparent'){
    const m=/^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(options.background);if(!m)throw new EngineError('E_MEDIA_BACKGROUND','Professional background must be transparent or an explicit sRGB #RRGGBB[AA]');
    const p=new Float32Array([parseInt(m[1].slice(0,2),16)/255,parseInt(m[1].slice(2,4),16)/255,parseInt(m[1].slice(4,6),16)/255,m[2]?parseInt(m[2],16)/255:1]),v=transformPixels(p,srgb,workingColor,'straight').pixels;for(let i=0;i<out.length;i+=4){for(let c=0;c<3;c++)out[i+c]=v[c]*v[3];out[i+3]=v[3];}
  }
  function sample(key:string,x:number,y:number,v:number[]):number[]{
    const image=decoded.get(key);if(!image)throw new EngineError('E_MEDIA_SOURCE',`Unavailable surface ${key}`);
    const size=sizes[key]??image,px=x*image.width/size.width-.5,py=y*image.height/size.height-.5,x0=Math.floor(px),y0=Math.floor(py),fx=px-x0,fy=py-y0;v.fill(0);
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const xx=x0+dx,yy=y0+dy;if(xx<0||yy<0||xx>=image.width||yy>=image.height)continue;const weight=(dx?fx:1-fx)*(dy?fy:1-fy);if(!weight)continue;const at=(yy*image.width+xx)*4;for(let c=0;c<4;c++)v[c]+=image.data[at+c]*weight;}return v;
  }
  function raster(target:Float32Array,key:string,transform:A,mode:LayerSpec['blend'],opacity:number,mask?:string){const inv=invert(transform);if(!inv)return;
    const image=decoded.get(key),size=sizes[key]??image,masked=mask?decoded.get(mask):undefined,maskSize=mask?(sizes[mask]??masked):undefined;
    if(image&&size&&image.width===width&&image.height===height&&!transform[1]&&!transform[2]&&!transform[4]&&!transform[5]&&transform[0]===width/size.width&&transform[3]===height/size.height&&(!mask||masked&&maskSize&&masked.width===width&&masked.height===height&&maskSize.width===size.width&&maskSize.height===size.height)){
      for(let i=0;i<target.length;i+=4)blendPixel(target,i,image.data,mode,opacity*(masked?masked.data[i+3]:1),i);return;
    }
    const v=[0,0,0,0],m=[0,0,0,0];for(let y=0;y<height;y++)for(let x=0;x<width;x++){const xx=inv[0]*(x+.5)+inv[2]*(y+.5)+inv[4],yy=inv[1]*(x+.5)+inv[3]*(y+.5)+inv[5];sample(key,xx,yy,v);blendPixel(target,(y*width+x)*4,v,mode,opacity*(mask?sample(mask,xx,yy,m)[3]:1));}}
  function draw(layer:LayerSpec,target:Float32Array,parent:A,inherited=1){
    const transform=multiply(parent,matrix(layer)),children=byParent.get(layer.id)??[],opacity=Number(layer.opacity??1)*inherited;
    if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw new EngineError('E_MEDIA_ALPHA','Layer opacity must be [0,1]');
    const key=layer.source?`${layer.source.$ref}:${layer.source.port}`:undefined,mask=layer.mask?`${layer.mask.$ref}:${layer.mask.port}`:undefined;
    if(children.length&&layer.isolation!=='pass-through'){
      const isolated=new Float32Array(out.length);if(key)raster(isolated,key,transform,'source-over',1);for(const child of children)draw(child,isolated,transform);
      const inv=mask?invert(transform):undefined,m=[0,0,0,0];for(let i=0;i<out.length;i+=4){let a=opacity;if(mask&&inv){const x=i/4%width+.5,y=Math.floor(i/4/width)+.5;a*=sample(mask,inv[0]*x+inv[2]*y+inv[4],inv[1]*x+inv[3]*y+inv[5],m)[3];}blendPixel(target,i,isolated,layer.blend,a,i);}
    }else{if(mask&&children.length)throw new EngineError('E_MEDIA_GROUP','Masked pass-through groups are ambiguous; request isolation');if(key)raster(target,key,transform,layer.blend,opacity,mask);for(const child of children)draw(child,target,transform,opacity);}
  }
  const scale:A=[width/options.compositionWidth,0,0,height/options.compositionHeight,0,0];for(const root of byParent.get(undefined)??[])draw(root,out,scale);
  const packed=performance.now(),result=surfaceFromPixels(width,height,out,{format:'rgba32float',color:workingColor,alpha:'premultiplied',deferBase64:true});
  try{options.timing?.('decode-and-format-unpack',decodeMs);options.timing?.('working-color-conversion',colorMs);options.timing?.('linear-raster-and-allocation',packed-started-decodeMs-colorMs);options.timing?.('float32-pack-and-base64',performance.now()-packed);}catch{}return result;
}
