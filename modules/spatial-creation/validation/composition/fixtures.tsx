/** Diagnostic-only manual recipe. Creator examples need none of these buffers. */
import {Composition,Stage,Layer,ref,linear709,surfaceFromPixels,keyframes,evaluate} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {stackCreations,fadeCreation,crossfadeCreations,placeCreation,imageCreation,solidBackground,gradientBackground,starlitRibbonScene,celebrationScene,energyScene} from 'spatial-creation-candidate';
import {binaryKernel,prepareKernel} from '../../../native-effects/raster/kernels.ts';
import {split} from '../../../native-effects/pa/filters.ts';
import {createGpuPixelEffects} from '../../../gpu-effects/pixel-effects.ts';
import {createUtilityFilters} from '../../../gpu-image-effects/resident/foundations/utility.ts';
import {matrix} from '../../../../src/media/compositor-geometry.ts';
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,w=init.width,h=init.height,objects:any[]=[],formats=['rgba32float','rgba16float'] as const;
 const indices=await g.createBuffer({type:'u32',length:6},Uint32Array.of(0,1,2,0,2,3)),uvs=await g.createField({type:'f32',components:2,dimensions:[4,1,1],semantic:'generic',space:'uv-top-left',units:'dimensionless'},Float32Array.of(0,0,1,0,1,1,0,1));
 const pk=await g.compile(prepareKernel),bk=await g.compile(binaryKernel),fx=createGpuPixelEffects(g);
 const amount=keyframes([{frame:0,value:.2},{frame:83,value:.8}]);
 const copy=(name:string,format:'rgba16float'|'rgba32float')=>imageCreation({image:name,format});
 const solid=(format:any,rgba:number[])=>g.upload(surfaceFromPixels(w,h,Array.from({length:w*h},()=>rgba).flat(),{format,alpha:'premultiplied',color:linear709}));
 async function mix(a:any,b:any,t:number,format:any){const p=Float32Array.of(0,...split(t),0);new Uint32Array(p.buffer)[0]=2;return g.run(bk,[a,b],{parameters:new Uint32Array(p.buffer),output:{format,alpha:'premultiplied'}});}
 async function quad(source:any,format:any,transform:any={},fit='stretch'){const sw=source.info.width,sh=source.info.height,s=fit==='cover'?Math.max(w/sw,h/sh):Math.min(w/sw,h/sh),sx=fit==='stretch'?w/sw:s,sy=fit==='stretch'?h/sh:s,ox=(w-sw*sx)/2,oy=(h-sh*sy)/2,m=matrix({id:'reference',originX:w/2,originY:h/2,...transform}),values=[[0,0],[sw,0],[sw,sh],[0,sh]].flatMap(([u,v])=>{const x=u*sx+ox,y=v*sy+oy;return [2*(m[0]*x+m[2]*y+m[4])/w-1,1-2*(m[1]*x+m[3]*y+m[5])/h,.5];}),p=await g.createField({type:'f32',components:3,dimensions:[4,1,1],semantic:'position',space:'clip',units:'normalized'},Float32Array.from(values));try{return await g.drawMesh({positions:p,indices,texture:{version:1,image:source,uvs,filter:'linear',addressU:'transparent',addressV:'transparent'},output:{width:w,height:h,format,alpha:'premultiplied',color:linear709}});}finally{await g.releaseBuffer(p);}}
 for(const format of formats)objects.push(
  await stackCreations([copy('a',format),Promise.resolve(copy('b',format))],{format}),
  await fadeCreation(copy('a',format),.35,{format}),
  await crossfadeCreations(copy('a',format),copy('b',format),amount,{format}),
  await placeCreation(copy('a',format),{format,x:4,y:-2,rotation:15,scale:.72,opacity:.6}),
  await imageCreation({format,image:'small',fit:'contain',scaleX:-1}),
  await solidBackground({format,color:[-.2,2,.1],opacity:.5}),
  await gradientBackground({format,center:[2,.1,-.2],edge:[.01,.2,.4]}),
  await starlitRibbonScene({format,ribbon:{segments:12},stars:{initialCount:8},dust:{initialCount:10}}),
  await celebrationScene({format,confetti:{initialCount:12,rate:2},sparks:{initialCount:6,rate:2}}),
  await energyScene({format,energy:{initialCount:12,rate:2},stars:{initialCount:7}}),
  await stackCreations([],{format}),
  await placeCreation(copy('a',format),{format,scale:0}),
  await imageCreation({format,image:'straight',fit:'cover',scale:.85}),
  await crossfadeCreations(copy('a',format),copy('b',format),0,{format}),
 );
 const publish=async(name:string,image:any)=>{const view=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(name,view,{version:1});}finally{await g.releaseBuffer(view);}};
 let missingChecked=false;
 return {async renderAt(c){const mode=c.frame%28,kind=mode%14,format=formats[Math.floor(mode/14)],owned:any[]=[];const keep=(i:any)=>{owned.push(i);return i;};try{
  const pixelsA:number[]=[],pixelsB:number[]=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=Math.max(0,Math.min(1,(1-Math.hypot((x-w*.43)/(w*.4),(y-h*.5)/(h*.4)))*5));pixelsA.push(2*a,-.2*a,.4*a,a);const b=x>w*.2&&x<w*.85&&y>h*.2&&y<h*.75?.35:0;pixelsB.push(.1*b,.5*b,2.4*b,b);}
  const a=keep(await g.upload(surfaceFromPixels(w,h,pixelsA,{format,alpha:'premultiplied',color:linear709}))),b=keep(await g.upload(surfaceFromPixels(w,h,pixelsB,{format,alpha:'premultiplied',color:linear709}))),small=keep(await g.upload(surfaceFromPixels(4,2,[2,0,0,1,0,0,0,0,0,.5,1,.5,0,0,0,0,1,.5,0,.5,0,0,0,0,0,0,3,1,0,0,0,0],{format,alpha:'premultiplied',color:linear709}))),straight=keep(await g.upload(surfaceFromPixels(4,2,[2,-.2,.4,1,9,9,9,0,.4,2,.1,.5,0,0,0,0,2,.3,.1,.5,4,4,4,0,0,0,3,1,0,0,0,0],{format,alpha:'straight',color:linear709})));
  if(!missingChecked){try{await objects[4].renderAt(c,{},{});throw Error('missing input accepted');}catch(e){if((e as any).code!=='E_CREATION_INPUT')throw e;missingChecked=true;}}
  const result=keep(await objects[mode].renderAt(c,{a,b,small,straight},{token:9}));await publish('rgba',result);await publish('source',a);
  let manual:any;const ca=[0,1,2,3,13].includes(kind)?keep(await quad(a,format)):a,cb=[0,2,13].includes(kind)?keep(await quad(b,format)):b;
  if(kind===0)manual=keep(await fx.over(cb,ca,{format}));
  if(kind===1||kind===2||kind===13){const clear=kind===1?keep(await solid(format,[0,0,0,0])):ca;manual=keep(await mix(clear,kind===1?ca:cb,kind===1?.35:kind===13?0:evaluate(amount,c),format));}
  if(kind===3){const moved=keep(await quad(ca,format,{x:4,y:-2,rotation:15,scale:.72})),clear=keep(await solid(format,[0,0,0,0]));manual=keep(await mix(clear,moved,.6,format));}
  if(kind===4)manual=keep(await quad(small,format,{scaleX:-1},'contain'));
  if(kind===5)manual=keep(await solid(format,[-.1,1,.05,.5]));
  if(kind===6){const extent=keep(await solid(format,[0,0,0,1]));manual=keep(await createUtilityFilters(g,c).radialGradient(extent,{format,start:[w*.48,h*.43],end:[w*.98,h*.9],colorA:[2,.1,-.2],colorB:[.01,.2,.4]}));}
  if(kind===10||kind===11)manual=keep(await solid(format,[0,0,0,0]));
  if(kind===12){const pm=keep(await g.run(pk,[straight],{parameters:Uint32Array.of(1,0),output:{format,alpha:'premultiplied'}}));manual=keep(await quad(pm,format,{scale:.85},'cover'));}
  if(manual)await publish('manual',manual);
  const state=await g.createBuffer({type:'f32',length:4},Float32Array.of(mode,c.time,g.stats().activeImages,missingChecked?1:0));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}
  owned.splice(owned.indexOf(result),1);return result;
 }finally{for(const i of owned)await g.release(i);}},async dispose(){for(const o of objects)await o.dispose?.();await g.releaseBuffer(indices);await g.releaseBuffer(uvs);}};
});
export default Composition({id:'composition-verify',width:64,height:48,fps:24,durationInFrames:84,seed:37,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
