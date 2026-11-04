import type {ProfessionalComposite} from './professional.ts';
import {matrix,multiply,invert,type Affine} from '../../src/media/compositor-geometry.ts';
import {EngineError} from '../../src/core/errors.ts';

export type PreparedProfessionalPixels={data:Float32Array;width:number;height:number};
export type ProfessionalPrecisionResult={qualified:boolean;reason?:string};
type Range={lo:number;hi:number};
type RGB=[Range,Range,Range];
type Bounds={rgb:RGB;a:Range;straight?:RGB;cone?:RGB;binary:boolean;integer:boolean;uncertain:boolean;gain:number;nonlinear:number};
const LIMIT=65504,STRAIGHT_LIMIT=2**40,F32_MAX=3.4028234663852886e38;
const r=(lo:number,hi=lo):Range=>({lo,hi});
const hull=(a:Range,b:Range)=>r(Math.min(a.lo,b.lo),Math.max(a.hi,b.hi));
const times=(a:Range,b:Range)=>{const v=[a.lo*b.lo,a.lo*b.hi,a.hi*b.lo,a.hi*b.hi];return r(Math.min(...v),Math.max(...v));};
const plus=(a:Range,b:Range)=>r(a.lo+b.lo,a.hi+b.hi);
const minusOne=(a:Range)=>r(1-a.hi,1-a.lo);
const magnitude=(a:Range)=>Math.max(Math.abs(a.lo),Math.abs(a.hi));
const maxRGB=(b:Bounds)=>Math.max(...b.rgb.map(magnitude));
const rgbZero=(b:Bounds)=>b.rgb.every(v=>v.lo===0&&v.hi===0);
const rgbaZero=(b:Bounds)=>!b.uncertain&&rgbZero(b)&&b.a.hi===0;
const unionRGB=(a:RGB,b:RGB):RGB=>a.map((v,c)=>hull(v,b[c])) as RGB;
const productRGB=(a:RGB,b:Range):RGB=>a.map(v=>times(v,b)) as RGB;
const zeroRGB=():RGB=>[r(0),r(0),r(0)];
function scan(data:Float32Array):Bounds{
 const rgb:RGB=[r(Infinity,-Infinity),r(Infinity,-Infinity),r(Infinity,-Infinity)],a=r(Infinity,-Infinity),straight:RGB=[r(Infinity,-Infinity),r(Infinity,-Infinity),r(Infinity,-Infinity)];
 let binary=true,cone=true;
 for(let i=0;i<data.length;i+=4){const alpha=data[i+3];if(!Number.isFinite(alpha))throw new EngineError('E_MEDIA_RANGE','Non-finite working input');a.lo=Math.min(a.lo,alpha);a.hi=Math.max(a.hi,alpha);binary&&=alpha===0||alpha===1;
  for(let c=0;c<3;c++){const v=data[i+c];if(!Number.isFinite(v))throw new EngineError('E_MEDIA_RANGE','Non-finite working input');rgb[c].lo=Math.min(rgb[c].lo,v);rgb[c].hi=Math.max(rgb[c].hi,v);if(alpha===0&&v!==0)cone=false;const q=alpha===0?0:v/alpha;straight[c].lo=Math.min(straight[c].lo,q);straight[c].hi=Math.max(straight[c].hi,q);}
 }
 return {rgb,a,straight,cone:cone?straight:undefined,binary,integer:true,uncertain:false,gain:1,nonlinear:0};
}
function transparent():Bounds{return {rgb:zeroRGB(),a:r(0),straight:zeroRGB(),cone:zeroRGB(),binary:true,integer:true,uncertain:false,gain:1,nonlinear:0};}
function normalized(b:Bounds):RGB|undefined{
 if(b.a.hi===0)return zeroRGB();
 if(b.cone)return b.cone;
 if(b.straight)return b.straight;
 if(b.a.lo>0)return b.rgb.map(v=>times(v,r(1/b.a.hi,1/b.a.lo))) as RGB;
 return undefined;
}
function publish(b:Bounds):Bounds{
 const rgb=b.rgb.map(v=>r(Math.fround(v.lo),Math.fround(v.hi))) as RGB,a=r(Math.fround(b.a.lo),Math.fround(b.a.hi));
 // Keep uncertainty even when the CPU interval happens to collapse to zero:
 // later HDR multiplication can amplify an otherwise invisible Pair residual.
 const result={...b,rgb,a,integer:true};
 if(!b.cone)result.straight=undefined;
 if(!result.cone&&a.lo>0)result.straight=normalized(result);
 if(!result.cone&&result.binary)result.straight=rgb.map(v=>hull(v,r(0))) as RGB;
 return result;
}

/** Conservative admission for the existing compensated compositor, not a CPU
 * rasterizer or a general F64 emulation/proof. Call after normal validation and
 * F32 working-space preparation, BEFORE any GPU allocation/upload/submission.
 * Wide inputs are retained only for explicit integer/F32-safe linear subsets.
 */
export function analyzeProfessionalPrecision(input:ProfessionalComposite,prepared:ReadonlyMap<string,PreparedProfessionalPixels>,background:Float32Array):ProfessionalPrecisionResult{
 let drawIndex=0,location='background';
 const reject=(why:string):never=>{throw new Error('draw '+drawIndex+' '+location+': '+why);};
 try{
  const images=new Map<string,Bounds>();for(const [key,image]of prepared)images.set(key,scan(image.data));
  let target=scan(background.subarray(0,4));
  const finite=(b:Bounds)=>b.rgb.every(v=>Number.isFinite(v.lo)&&Number.isFinite(v.hi)&&magnitude(v)<=F32_MAX)&&Number.isFinite(b.a.lo)&&Number.isFinite(b.a.hi)&&b.a.lo>=0&&b.a.hi<=1;
  if(!finite(target))reject('background is outside finite F32/alpha bounds');
  const byParent=new Map<string|undefined,typeof input.layers>();
  for(const l of input.layers)if(input.frame>=l.start&&input.frame<l.end){if(l.effects?.length)throw new EngineError('E_MEDIA_EFFECT','Canvas layer effects cannot process HDR');const list=byParent.get(l.parent)??[];list.push(l);byParent.set(l.parent,list);}
  function sampled(b:Bounds,image:{width:number;height:number},size:{width:number;height:number},t:Affine,direct=false):Bounds{
   if(direct)return {...b,integer:true};
   const inv=invert(t);if(!inv)return transparent();
   const sx=image.width/size.width,sy=image.height/size.height;
   const coeff=[inv[0]*sx,inv[2]*sx,inv[4]*sx-.5,inv[1]*sy,inv[3]*sy,inv[5]*sy-.5];
   if(coeff.some(v=>!Number.isFinite(v)||Math.abs(v)>2**24))reject('sampling coefficients outside the bounded coordinate profile');
   const xs=[.5,input.width-.5],ys=[.5,input.height-.5],px:number[]=[],py:number[]=[];
   for(const x of xs)for(const y of ys){px.push((inv[0]*x+inv[2]*y+inv[4])*sx-.5);py.push((inv[1]*x+inv[3]*y+inv[5])*sy-.5);}
   if([...px,...py].some(v=>!Number.isFinite(v)||Math.abs(v)>2**24))reject('sampling cells exceed exact integer coordinate range');
   const cpuDirect=image.width===input.width&&image.height===input.height&&!t[1]&&!t[2]&&!t[4]&&!t[5]&&t[0]===input.width/size.width&&t[3]===input.height/size.height;
   const gpuDirect=coeff[0]===1&&coeff[1]===0&&coeff[2]===-.5&&coeff[3]===0&&coeff[4]===1&&coeff[5]===-.5;
   const unit=size.width===image.width&&size.height===image.height&&inv[1]===0&&inv[2]===0&&Math.abs(inv[0])===1&&Math.abs(inv[3])===1&&Number.isInteger(inv[4])&&Number.isInteger(inv[5]);
   const integer=cpuDirect&&gpuDirect||unit;
   if(Math.max(...px)<=-1||Math.min(...px)>=image.width||Math.max(...py)<=-1||Math.min(...py)>=image.height)return transparent();
   const covered=Math.min(...px)>=0&&Math.max(...px)<=image.width-1&&Math.min(...py)>=0&&Math.max(...py)<=image.height-1;
   const out:Bounds={...b,rgb:covered?b.rgb:b.rgb.map(v=>hull(v,r(0))) as RGB,a:covered?b.a:hull(b.a,r(0)),integer,binary:integer&&b.binary};
   if(!integer)out.straight=out.cone;
   return out;
  }
  function blend(dst:Bounds,src:Bounds,opacity:number,mask:Bounds|undefined,mode:NonNullable<typeof input.layers[number]['blend']>):Bounds{
   const effective=times(r(opacity),mask?mask.a:r(1)),sRGB=productRGB(src.rgb,effective),sa=times(src.a,effective),ba=dst.a;
   const effectiveBinary=effective.lo===effective.hi&&(effective.lo===0||effective.lo===1)||!!mask?.binary&&src.integer&&mask.integer&&(opacity===0||opacity===1);
   const fixedF32=effective.lo===effective.hi&&Math.fround(effective.lo)===effective.lo||!!mask?.binary&&mask.integer&&Math.fround(opacity)===opacity;
   const sourceInteger=src.integer&&(!mask||mask.integer);
   if(mode==='source-over'&&sourceInteger&&effective.lo===1&&effective.hi===1&&rgbZero(dst)&&dst.a.lo===1&&dst.a.hi===1){
    // Existing flatten-to-black contract: RGB is an unchanged F32 copy even
    // for hidden emission/tiny alpha; destination coverage is exactly one.
    return {...src,a:r(1),straight:src.rgb,cone:src.rgb,binary:true,integer:true};
   }
   if(mode==='source-over'&&sourceInteger&&effective.lo===1&&effective.hi===1&&(rgbaZero(dst)||src.a.lo===1&&src.a.hi===1)){
    return {...src,integer:true}; // exact copy/opaque overwrite; hidden RGB stays.
   }
   const wideLinear=sourceInteger&&(mode==='lighter'&&fixedF32||mode==='source-over'&&effectiveBinary&&src.binary);
   const wide=maxRGB(src)>LIMIT||maxRGB(dst)>LIMIT;
   if(wide&&(!wideLinear||src.uncertain||dst.uncertain))reject('wide RGB requires an exact integer linear subset with no prior uncertain publication');
   if(!wide){
    const ns=normalized(src),nb=normalized(dst);
    if(mode==='multiply'||mode==='screen'){
     if(!ns||!nb||[...ns,...nb].some(v=>!Number.isFinite(magnitude(v))||magnitude(v)>STRAIGHT_LIMIT))reject('nonlinear unassociated RGB cannot be bounded by 2^40');
    }
   }
   const a=mode==='lighter'?r(Math.min(1,sa.lo+ba.lo),Math.min(1,sa.hi+ba.hi)):r(sa.lo+ba.lo*(1-sa.lo),sa.hi+ba.hi*(1-sa.hi));
   let rgb:RGB,cone:RGB|undefined,amplification=1;
   if(mode==='lighter'){
    rgb=sRGB.map((v,c)=>plus(v,dst.rgb[c])) as RGB;
    if(src.cone&&dst.cone)cone=productRGB(unionRGB(src.cone,dst.cone),r(1,Math.max(1,sa.hi+ba.hi)));
   }else if(mode==='source-over'){
    rgb=sRGB.map((v,c)=>plus(v,times(dst.rgb[c],minusOne(sa)))) as RGB;
    if(src.cone&&dst.cone)cone=unionRGB(src.cone,dst.cone);
   }else{
    const ns=normalized(src)!,nb=normalized(dst)!;
    const mixed=ns.map((v,c)=>{const w=nb[c],f=(x:number,y:number)=>mode==='multiply'?x*y:x+y-x*y,points=[f(v.lo,w.lo),f(v.lo,w.hi),f(v.hi,w.lo),f(v.hi,w.hi)];return r(Math.min(...points),Math.max(...points));}) as RGB;
    const factor=times(sa,ba);
    rgb=sRGB.map((v,c)=>plus(plus(times(v,minusOne(ba)),times(dst.rgb[c],minusOne(sa))),times(factor,mixed[c]))) as RGB;
    if(src.cone&&dst.cone)cone=unionRGB(unionRGB(src.cone,dst.cone),mixed);
    // A bounded safety fence against amplification of earlier stored error,
    // including CPU-zero intervals. It is not a universal F64 error theorem.
    if(dst.uncertain)amplification=Math.max(amplification,...sRGB.map(v=>mode==='multiply'?1+magnitude(v):magnitude(minusOne(v))));
    if(src.uncertain)amplification=Math.max(amplification,...dst.rgb.map(v=>mode==='multiply'?1+magnitude(v):magnitude(minusOne(v))));
   }
   if(cone){const coupled=productRGB(cone,a);rgb=rgb.map((v,c)=>r(Math.max(v.lo,coupled[c].lo),Math.min(v.hi,coupled[c].hi))) as RGB;}
   const previous=Math.max(src.gain,dst.gain),gain=previous*amplification,nonlinear=Math.max(src.nonlinear,dst.nonlinear)+(amplification>1?1:0);
   if(gain>32||nonlinear>2)reject('prior approximate publication followed by unqualified nonlinear amplification (gain '+gain+', depth '+nonlinear+')');
   const binary=effectiveBinary&&src.binary&&dst.binary;
   const out=publish({rgb,a,cone,binary,integer:true,uncertain:src.uncertain||dst.uncertain||!wideLinear,gain,nonlinear});
   if(!finite(out))reject('draw/group F32 publication cannot be bounded as finite with alpha [0,1]');
   return out;
  }
  function raster(dst:Bounds,key:string,t:Affine,mode:NonNullable<typeof input.layers[number]['blend']>,opacity:number,mask?:string,group?:Bounds):Bounds{
   const inv=invert(t);if(!inv&&!group)return dst;
   const image=group?{width:input.width,height:input.height}:prepared.get(key);const state=group??images.get(key);if(!image||!state)throw new EngineError('E_MEDIA_SOURCE','Unavailable surface '+key);
   const size=group?image:input.sizes[key]??image,src=sampled(state,image,size,t,!!group);
   let m:Bounds|undefined;if(mask&&inv){const mi=prepared.get(mask),mb=images.get(mask);if(!mi||!mb)throw new EngineError('E_MEDIA_SOURCE','Unavailable mask '+mask);m=sampled(mb,mi,input.sizes[mask]??mi,t);}
   return blend(dst,src,opacity,m,mode);
  }
  function draw(l:typeof input.layers[number],dst:Bounds,parent:Affine,inherited=1):Bounds{
   const t=multiply(parent,matrix(l)),children=byParent.get(l.id)??[],opacity=Number(l.opacity??1)*inherited,key=l.source?l.source.$ref+':'+l.source.port:undefined,mask=l.mask?l.mask.$ref+':'+l.mask.port:undefined;
   if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw new EngineError('E_MEDIA_ALPHA','Layer opacity must be [0,1]');
   if(children.length&&l.isolation!=='pass-through'){
    let isolated=transparent();if(key){drawIndex++;location='layer '+l.id+' isolated-source';isolated=raster(isolated,key,t,'source-over',1);}
    for(const child of children)isolated=draw(child,isolated,t);
    drawIndex++;location='layer '+l.id+' isolated-publication '+(l.blend??'source-over');return raster(dst,'',t,l.blend??'source-over',opacity,mask,isolated);
   }
   if(mask&&children.length)throw new EngineError('E_MEDIA_GROUP','Masked pass-through needs isolation');
   if(key){drawIndex++;location='layer '+l.id+' '+(l.blend??'source-over');dst=raster(dst,key,t,l.blend??'source-over',opacity,mask);}
   for(const child of children)dst=draw(child,dst,t,opacity);return dst;
  }
  const root:Affine=[input.width/input.compositionWidth,0,0,input.height/input.compositionHeight,0,0];
  for(const l of byParent.get(undefined)??[])target=draw(l,target,root);
  return {qualified:true};
 }catch(e){if(e instanceof EngineError)throw e;return {qualified:false,reason:e instanceof Error?e.message:'precision analysis could not establish the bounded profile'};}
}
