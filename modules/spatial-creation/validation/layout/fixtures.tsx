import {Composition,Stage,Layer,ref,seededRandom} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {imageCreation,arrangeCreations,rowCreations,columnCreations,gridCreations,radialCreations,arcCreations,spiralCreations,scatterCreations,cascadeCreations,fanCreations,frameCreation,cardCreation,creationGallery} from 'spatial-creation-candidate';
import {imageCreation as originalImage,placeCreation as originalPlace,solidBackground as originalSolid,stackCreations as originalStack} from '../../composition.ts';import {shadowCreation as originalShadow} from '../../creator-effects.ts';
import {rowCreations as sourceRows} from '../../layout.ts';
import {textureQuad,placement} from '../../composition-core.ts';
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,objects:any[]=[],trace:any[]=[];let current:any;const seed=await g.compile({abiVersion:1,id:'test/creator-layout/seed',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{if(paramU32(0u)==1u){return vec4f(0.);}let uv=(vec2f(p)+.5)/vec2f(outputSize());let a=clamp((.35-length((uv-vec2f(.44,.52))*vec2f(1.1,1.)))*12.,0.,.8);return vec4f(vec3f(-.2,2.4,.7)*a,a);}'});
 const base=async(format:any)=>{const s=await imageCreation({image:'seed',format});return {renderAt(c:any,i:any,p:any){trace.push(c===current&&c.frame===current.frame&&c.time===current.time&&c.globalFrame===current.globalFrame&&c.globalTime===current.globalTime);return s.renderAt(c,i,p);},inspect:()=>s.inspect(),dispose:()=>s.dispose?.()};};
 for(const format of ['rgba32float','rgba16float'] as const){const o={format,finish:false as const,padding:1,gap:1,itemSize:[8,6] as const};for(let kind=0;kind<16;kind++){
  if(kind===13){objects.push(await rowCreations([],{...o}));continue;}if(kind===14){objects.push(await rowCreations([await base(format)],o));continue;}if(kind===15){const source={async renderAt(c:any){trace.push(c===current);return g.run(seed,[],{parameters:Uint32Array.of(0),output:{width:16,height:12,format,alpha:'premultiplied',color:{primaries:'rec709',whitePoint:'D65',transfer:'linear',reference:'scene',range:'full',referenceWhiteNits:100}}});},inspect:()=>({})};objects.push(await sourceRows(init,[source],o));continue;}
  if(kind===10||kind===11){const s=await base(format),frame={format,finish:false as const,size:[26,18] as const,padding:1,color:[.2,.3,.4] as const,frameOpacity:.6};objects.push(await(kind===10?frameCreation(s,frame):cardCreation(s,{...frame,shadow:{radius:.6,offset:[1,1],opacity:.4}})));continue;}
  const sources=await Promise.all([0,1,2].map(()=>base(format)));switch(kind){
   case 0:objects.push(await arrangeCreations(sources,{...o,layout:{kind:'grid',columns:2,align:'end'}}));break;
   case 1:objects.push(await rowCreations(sources,o));break;case 2:objects.push(await columnCreations(sources,o));break;case 3:objects.push(await gridCreations(sources,{...o,columns:2}));break;
   case 4:objects.push(await radialCreations(sources,{...o,radius:6,startAngle:-90,orient:'tangent'}));break;case 5:objects.push(await arcCreations(sources,{...o,radius:6,startAngle:-140,endAngle:-40,orient:'radial'}));break;
   case 6:objects.push(await spiralCreations(sources,{...o,radius:7,innerRadius:1,turns:1.25,startAngle:-90}));break;case 7:objects.push(await scatterCreations(sources,{...o,seed:13,angleSpread:8}));break;
   case 8:objects.push(await cascadeCreations(sources,{...o,step:[3,2],angleStep:-4}));break;case 9:objects.push(await fanCreations(sources,{...o,radius:7,startAngle:-25,endAngle:25}));break;
   default:objects.push(await creationGallery(sources,{format,finish:false,cards:false,background:false,padding:1,gap:1,layout:{kind:'grid',columns:2}}));
  }
 }}
 let foreign:any,refused=0;const foreignSource={async renderAt(){return foreign=await g.run(seed,[],{parameters:Uint32Array.of(0),output:{width:16,height:12,format:'rgba32float',alpha:'premultiplied',color:{primaries:'rec709',whitePoint:'D65',transfer:'linear',reference:'scene',range:'full',referenceWhiteNits:100}}});},inspect:()=>({})},invalidOwner=await rowCreations([foreignSource],{padding:1,gap:1});
 const publish=async(name:string,image:any)=>{const b=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(name,b,{version:1});}finally{await g.releaseBuffer(b);}};
 // Independent fixed-fixture positions and original Native operators. Never
 // import/call layout.ts, layout-recipes.ts or cards.ts in the reference path.
 const position=(kind:number,i:number)=>{let x=0,y=0,rotation=0,scaleX=8/32,scaleY=6/24;
  if(kind===0||kind===3||kind===12){x=i===2?(kind===0?7.75:0):i===0?-7.75:7.75;y=i<2?-5.75:5.75;if(kind===12){scaleX=14/32;scaleY=10.5/24;}}
  if(kind===1)x=(i-1)*(30/3+1/3);if(kind===2)y=(i-1)*(22/3+1/3);
  if(kind===4){const a=-90+120*i;x=6*Math.cos(a*Math.PI/180);y=6*Math.sin(a*Math.PI/180);rotation=a+90;}
  if(kind===5){const a=-140+50*i;x=6*Math.cos(a*Math.PI/180);y=6*Math.sin(a*Math.PI/180);rotation=a;}
  if(kind===6){const a=(-90+360*1.25*i/2)*Math.PI/180,r=1+6*(i+.5)/3;x=r*Math.cos(a);y=r*Math.sin(a);}
  if(kind===7){x=(seededRandom(13,i,'creation-layout/1/x')-.5)*22;y=(seededRandom(13,i,'creation-layout/1/y')-.5)*16;rotation=(2*seededRandom(13,i,'creation-layout/1/angle')-1)*8;}
  if(kind===8){x=(i-1)*3;y=(i-1)*2;rotation=(i-1)*-4;}
  if(kind===9){const a=-25+25*i;x=7*Math.sin(a*Math.PI/180);y=7*(1-Math.cos(a*Math.PI/180));rotation=a;}
  return {x,y,scaleX,scaleY,rotation};
 };
 return {async renderAt(c){current=c;trace.length=0;const mode=c.frame%32,kind=mode%16,format:'rgba32float'|'rgba16float'=mode<16?'rgba32float':'rgba16float',o={format,finish:false as const},input=await g.run(seed,[],{parameters:Uint32Array.of(Number(kind===14)),output:{width:init.width,height:init.height,format,alpha:'premultiplied',color:{primaries:'rec709',whitePoint:'D65',transfer:'linear',reference:'scene',range:'full',referenceWhiteNits:100}}}),inputs={seed:input};let result:any,manual:any;
  try{if(c.frame===0){try{const bad=await invalidOwner.renderAt(c,inputs,{});await g.release(bad);throw Error('Expected resource owner rejection');}catch(e){if((e as any).code!=='E_NATIVE_RESOURCE_OWNER')throw e;refused++;}finally{if(foreign){await g.release(foreign);foreign=undefined;}}}result=await objects[mode].renderAt(c,inputs,{});await publish('rgba',result);if(trace.length!==(kind===13?0:kind===10||kind===11||kind===14||kind===15?1:3)||!trace.every(Boolean))throw Error('Layout changed child invocation time/count');
   if(kind===13)manual=await originalStack(init,[],o);else if(kind===15){const quad=await textureQuad(init);manual={async renderAt(){const image=await g.run(seed,[],{parameters:Uint32Array.of(0),output:{width:16,height:12,format,alpha:'premultiplied',color:{primaries:'rec709',whitePoint:'D65',transfer:'linear',reference:'scene',range:'full',referenceWhiteNits:100}}});try{return await quad.render(image,placement({scaleX:.25,scaleY:.25},c,32,24),'stretch',format,'linear');}finally{await g.release(image);}},dispose:()=>quad.dispose()};}else if(kind===14)manual=await originalPlace(init,originalImage(init,{...o,image:'seed'}),{...o,scale:.25});else if(kind===10||kind===11){const background=await originalPlace(init,originalSolid(init,{...o,color:[.2,.3,.4],opacity:.6}),{...o,scaleX:26/32,scaleY:18/24}),front=await originalPlace(init,originalImage(init,{...o,image:'seed'}),{...o,scale:2/3});manual=await originalStack(init,[background,front],o);if(kind===11)manual=await originalShadow(init,manual,{...o,radius:.6,offset:[1,1],opacity:.4});}
   else{const parts=[];for(let i=0;i<3;i++)parts.push(await originalPlace(init,originalImage(init,{...o,image:'seed'}),{...o,...position(kind,i)}));manual=await originalStack(init,parts,o);}
   const reference=await manual.renderAt(c,inputs,{});try{await publish('manual',reference);}finally{await g.release(reference);}const state=await g.createBuffer({type:'f32',length:5},Float32Array.of(mode,c.time,trace.length,1,refused));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}return result;
  }catch(e){if(result)await g.release(result);throw e;}finally{await manual?.dispose?.();await g.release(input);}
 },async dispose(){await Promise.all(objects.map(o=>o.dispose?.()));await invalidOwner.dispose?.();}};
});
export default Composition({id:'layout-verify',width:32,height:24,fps:24,durationInFrames:128,seed:37,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
