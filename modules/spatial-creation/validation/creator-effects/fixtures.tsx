import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {imageCreation,blurCreation,glowCreation,shadowCreation,innerShadowCreation,outlineCreation,sharpenCreation,pixelateCreation,chromaKeyCreation,lumaKeyCreation,wobbleCreation,maskCreation} from 'spatial-creation-candidate';
import {rasterFilters} from '../../../native-effects/raster/filters.ts';
import {createPaFilters} from '../../../native-effects/pa/filters.ts';
import {createProfessionalFilters} from '../../../gpu-image-effects/resident/filters.ts';
import {createNativeRecipeProcessor} from '../../../native-effects/images.ts';
import {alphaKernel,shadowKernel,prepareKernel} from '../../../native-effects/raster/kernels.ts';
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,formats=['rgba32float','rgba16float'] as const,objects:any[]=[],captured:any[]=[];
 const seed=await g.compile({abiVersion:1,id:'test/creator-effects/seed',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{if(paramU32(0u)==1u){return vec4f(0.);}let uv=(vec2f(p)+.5)/vec2f(outputSize());let d=length((uv-vec2f(.5))*vec2f(1.25,1.));let a=clamp((.41-d)*15.,0.,.8);let c=select(vec3f(-.2,2.4,.7),vec3f(0.,1.,0.),uv.x<.4);return vec4f(c*a,a);}'}),maskSeed=await g.compile({abiVersion:1,id:'test/creator-effects/mask',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.,0.,0.,(f32(p.x)+.5)/f32(outputSize().x));}'}),copy=await g.compile({abiVersion:1,id:'test/creator-effects/reference-copy',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p));}'});
 const base=async(index:number,name='seed',format:'rgba32float'|'rgba16float'='rgba32float')=>{const s=await imageCreation({image:name,format});return {async renderAt(c:any,i:any,p:any){const image=await s.renderAt(c,i,p);captured[index]=await g.run(copy,[image],{output:{width:image.info.width,height:image.info.height,format:image.info.format,alpha:image.info.alpha,color:image.info.color}});return image;},inspect:()=>s.inspect(),dispose:()=>s.dispose?.()};};
 const radius=keyframes([{frame:0,value:.5},{frame:23,value:1.5}]);
 for(const format of formats){const o={format,finish:false as const};for(let kind=0;kind<13;kind++){const source=await base(0,'seed',format);switch(kind){
  case 0:objects.push(await blurCreation(source,{...o,radius}));break;
  case 1:objects.push(await glowCreation(source,{...o,radius:1,intensity:.4,threshold:.6}));break;
  case 2:objects.push(await shadowCreation(source,{...o,radius:.7,offset:[1.25,1.75],opacity:.55,color:[.1,.3,1.2]}));break;
  case 3:objects.push(await innerShadowCreation(source,{...o,radius:.7,offset:[1.25,1.75],opacity:.55,color:[.1,.3,1.2]}));break;
  case 4:objects.push(await outlineCreation(source,{...o,width:1.25,color:[1.2,.8,.1],opacity:.7}));break;
  case 5:objects.push(await sharpenCreation(source,{...o,radius:1,amount:.4}));break;
  case 6:objects.push(await pixelateCreation(source,{...o,blockSize:[3,2]}));break;
  case 7:objects.push(await chromaKeyCreation(source,{...o,color:'#00ff00'}));break;
  case 8:objects.push(await lumaKeyCreation(source,{...o,low:.1,high:.8}));break;
  case 9:objects.push(await wobbleCreation(source,{...o,amount:1.5,frequency:3,seed:13,speed:.8,offset:[.25,-.4]}));break;
  case 10:objects.push(await maskCreation(source,await base(1,'mask',format),{...o,invert:format==='rgba16float',opacity:.7}));break;
  case 11:objects.push(await shadowCreation(outlineCreation(blurCreation(source,{...o,radius:.8}),{...o,width:1.25,color:[1.2,.8,.1],opacity:.7}),{...o,radius:.7,offset:[1.25,1.75],opacity:.55,color:[.1,.3,1.2]}));break;
  default:objects.push(await outlineCreation(source,{...o,width:1.25}));
 }}}
 const badSource=await imageCreation({image:'seed'}),bad=await blurCreation(badSource,{radius:keyframes([{frame:0,value:-1},{frame:1,value:1}])});let refused=0;
 const publish=async(name:string,image:any)=>{const b=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(name,b,{version:1});}finally{await g.releaseBuffer(b);}};
 return {async renderAt(c){const mode=c.frame%26,kind=mode%13,format=formats[Math.floor(mode/13)],info={width:init.width,height:init.height,format,alpha:'premultiplied' as const,color:{primaries:'rec709' as const,whitePoint:'D65' as const,transfer:'linear' as const,reference:'scene' as const,range:'full' as const,referenceWhiteNits:100}},input=await g.run(seed,[],{parameters:Uint32Array.of(Number(kind===12)),output:info}),mask=await g.run(maskSeed,[],{output:info});let result:any;const processor=createNativeRecipeProcessor({gpu:g},(scope,context,track,signal)=>({scope,r:rasterFilters(scope,context,track,signal),pa:createPaFilters(scope,context,track,signal),f:createProfessionalFilters(scope,context,track,signal)}));
  try{result=await objects[mode].renderAt(c,{seed:input,mask},{});await publish('rgba',result);await publish('source',captured[0]);
   const out={format},native={format,alpha:'premultiplied' as const},reference=await processor.processImage(captured[0],async(image,{scope,r,pa,f})=>{
    const outline=async(i:any,color:[number,number,number]=[1.2,.8,.1],opacity=.7)=>{const expanded=await f.morphology(i,{operation:'dilate',radius:1.25,boundary:'transparent',...out}),ring=await r.subtractMatte(expanded,i,native),ink=await r.fill(ring,{color,opacity,...native});return r.over(i,ink,native);};
    const legacyShadow=async(i:any)=>r.over(i,await r.dropShadow(i,{radius:.7,offset:[1.25,1.75],opacity:.55,color:[.1,.3,1.2],...native}),native);
    // Independent assembly from original kernels, never the production helper.
    const shadow=async(i:any)=>{const wide={width:i.info.width+10,height:i.info.height+10,color:i.info.color,alpha:'premultiplied' as const,format:'rgba32float' as const},p=new Float32Array(12),split=(v:number)=>[Math.fround(v),Math.fround(v-Math.fround(v))];p.set([.1,.3,1.2].map(Math.fround));p.set(split(.55),3);p.set(split(1.25),5);p.set(split(1.75),7);p[9]=5;
     const padded=await scope.run(await scope.compile(alphaKernel),[i],{parameters:Uint32Array.of(5,5,0,0),output:wide}),soft=await pa.blur(padded,{radius:.7,boundary:'transparent',format:'rgba32float',alpha:'premultiplied'}),tinted=await scope.run(await scope.compile(shadowKernel),[soft],{parameters:p,output:{...wide,width:i.info.width,height:i.info.height}}),published=await scope.run(await scope.compile(prepareKernel),[tinted],{parameters:Uint32Array.of(0,0),output:{...wide,width:i.info.width,height:i.info.height,format}});return r.over(i,published,native);
    };
    switch(kind){
     case 0:return pa.blur(image,{radius, ...native});case 1:return pa.glow(image,{radius:1,intensity:.4,threshold:.6,...native});
     case 2:await publish('legacy-shadow',await legacyShadow(image));return shadow(image);case 3:return pa.innerShadow(image,{radius:.7,offset:[1.25,1.75],opacity:.55,color:[.1,.3,1.2],...native});
     case 4:return outline(image);case 5:return f.unsharpMask(image,{radius:1,amount:.4,...out});case 6:return f.pixelate(image,{blockSize:[3,2],...out});
     case 7:return f.chromaKey(image,{color:[0,1,0],inner:.1,outer:.3,...out});case 8:return f.lumaKey(image,{low:.1,high:.8,...out});
     case 9:return pa.displacement(image,{amount:1.5,frequency:3,seed:13,speed:.8,offset:[.25,-.4],...native});
     case 10:return r.applyMatte(image,format==='rgba16float'?await r.invertMatte(captured[1],native):captured[1],{opacity:.7,...native});
     case 11:{const blurred=await pa.blur(image,{radius:.8,...native});await publish('manual-blur',blurred);const outlined=await outline(blurred);await publish('manual-outline',outlined);await publish('legacy-shadow',await legacyShadow(outlined));return shadow(outlined);
     }default:return outline(image,[1,1,1],1);
    }
   },{context:c});await publish('manual',reference);
   if(c.frame===0){try{const invalid=await bad.renderAt(c,{seed:input},{});await g.release(invalid);throw Error('Expected PA parameter refusal');}catch(e){if((e as any).code!=='E_PA_PARAMETER')throw e;refused++;}if(bad.inspect().frames!==0||badSource.inspect().frames!==1)throw Error('Incorrect parent/child failure commit');const retry=await bad.renderAt({...c,frame:1,time:1/24,globalFrame:1,globalTime:1/24,progress:1/(c.durationInFrames-1)},{seed:input},{});await g.release(retry);}
   const state=await g.createBuffer({type:'f32',length:4},Float32Array.of(mode,c.time,refused,kind));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}return result;
  }catch(e){if(result)await g.release(result);throw e;}finally{await processor.dispose();await g.release(input);await g.release(mask);for(const image of captured.splice(0))if(image)await g.release(image);}
 },async dispose(){await Promise.all(objects.map(o=>o.dispose?.()));await bad.dispose?.();}};
});
export default Composition({id:'creator-effects-verify',width:32,height:24,fps:24,durationInFrames:104,seed:37,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
