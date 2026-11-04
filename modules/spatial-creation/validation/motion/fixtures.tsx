import {Composition,Stage,Layer,ref,easingAt,spring,springAt} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {imageCreation,placeCreation,animateCreation,fadeInCreation,fadeOutCreation,slideInCreation,slideOutCreation,popInCreation,popOutCreation,spinInCreation,spinOutCreation,springInCreation,floatCreation,pulseCreation,swingCreation,staggerCreations} from 'spatial-creation-candidate';
import {imageCreation as originalImage,placeCreation as originalPlace,stackCreations as originalStack} from '../../composition.ts';
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,objects:any[]=[],trace:any[]=[];let current:any;const seed=await g.compile({abiVersion:1,id:'test/creator-motion/seed',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{let uv=(vec2f(p)+.5)/vec2f(outputSize());let a=clamp((.35-length((uv-vec2f(.44,.52))*vec2f(1.1,1.)))*12.,0.,.8);return vec4f(vec3f(-.2,2.4,.7)*a,a);}'});
 const base=async(format:any)=>{const s=await imageCreation({image:'seed',format});return {renderAt(c:any,i:any,p:any){trace.push({same:c===current,frame:c.frame,time:c.time,globalFrame:c.globalFrame,globalTime:c.globalTime});return s.renderAt(c,i,p);},inspect:()=>s.inspect(),dispose:()=>s.dispose?.()};};
 for(const format of ['rgba32float','rgba16float'] as const){const o={format,finish:false as const},timing={at:12,duration:24};for(let kind=0;kind<14;kind++){
  if(kind===13){objects.push(await staggerCreations(await Promise.all([0,1,2].map(async i=>placeCreation(await base(format),{...o,x:(i-1)*5,scale:.65}))),{...o,interval:3,reverse:format==='rgba16float',enter:{kind:'pop',...timing,scale:.5}}));continue;}
  const s=await base(format);switch(kind){
   case 0:objects.push(await animateCreation(s,{...o,enter:{kind:'slide',...timing,direction:'left',distance:4},exit:{kind:'fade',at:60,duration:20},idle:{kind:'float',offset:[1,2],frequency:.5}}));break;
   case 1:objects.push(await fadeInCreation(s,{...o,...timing}));break;case 2:objects.push(await fadeOutCreation(s,{...o,...timing}));break;
   case 3:objects.push(await slideInCreation(s,{...o,...timing,offset:[3,-2]}));break;case 4:objects.push(await slideOutCreation(s,{...o,...timing,direction:'right',distance:4}));break;
   case 5:objects.push(await popInCreation(s,{...o,...timing,scale:.5}));break;case 6:objects.push(await popOutCreation(s,{...o,...timing,scale:.5}));break;
   case 7:objects.push(await spinInCreation(s,{...o,...timing,angle:45,scale:.6}));break;case 8:objects.push(await spinOutCreation(s,{...o,...timing,angle:45,scale:.6}));break;
   case 9:objects.push(await springInCreation(s,{...o,...timing,scale:.5,spring:{damping:14}}));break;case 10:objects.push(await floatCreation(s,{...o,offset:[2,3],frequency:.4,phase:.1}));break;
   case 11:objects.push(await pulseCreation(s,{...o,amount:.08,frequency:.6,phase:.2}));break;case 12:objects.push(await swingCreation(s,{...o,angle:8,frequency:.7,phase:.3}));break;
  }
 }}
 const publish=async(name:string,image:any)=>{const b=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(name,b,{version:1});}finally{await g.releaseBuffer(b);}};
 // Independent expected transform assembly from Core curves. The oracle never
 // imports or calls motion.ts / motion-recipes.ts, nor production diagnostics.
 const expected=(kind:number,c:any,index=0,reverse=false)=>{const t=easingAt(kind===2||kind===4||kind===6||kind===8?'easeIn':'easeOut',(c.frame-12)/24),q=kind===2||kind===4||kind===6||kind===8?t:1-t;let x=0,y=0,scale=1,rotation=0,opacity=1;
  if(kind<10)opacity=kind===2||kind===4||kind===6||kind===8?1-t:t;
  if(kind===0){const wave=Math.sin(2*Math.PI*.5*c.time);x=-4*(1-t)+wave;y=2*wave;opacity=t*(1-easingAt('easeIn',(c.frame-60)/20));}
  if(kind===3){x=3*q;y=-2*q;}if(kind===4)x=4*q;
  if(kind===5||kind===6)scale=1-.5*q;if(kind===7||kind===8){scale=1-.4*q;rotation=45*q;}
  if(kind===9)scale=1-.5*(1-springAt(spring({from:0,to:1,start:12,damping:14}),c));
  if(kind===10){const wave=Math.sin(2*Math.PI*.4*c.time+.1);x=2*wave;y=3*wave;}
  if(kind===11)scale=1+.08*Math.sin(2*Math.PI*.6*c.time+.2);if(kind===12)rotation=8*Math.sin(2*Math.PI*.7*c.time+.3);
  if(kind===13){const p=easingAt('easeOut',(c.frame-12-(reverse?2-index:index)*3)/24);scale=1-.5*(1-p);opacity=p;}
  return {x,y,scale,rotation,opacity};
 };
 return {async renderAt(c){current=c;trace.length=0;const mode=c.frame%28,kind=mode%14,format:'rgba32float'|'rgba16float'=mode<14?'rgba32float':'rgba16float',info={width:init.width,height:init.height,format,alpha:'premultiplied' as const,color:{primaries:'rec709' as const,whitePoint:'D65' as const,transfer:'linear' as const,reference:'scene' as const,range:'full' as const,referenceWhiteNits:100}},input=await g.run(seed,[],{output:info}),inputs={seed:input},o={format,finish:false as const};let result:any,manual:any;
  try{result=await objects[mode].renderAt(c,inputs,{});await publish('rgba',result);const traceOK=trace.length===(kind===13?3:1)&&trace.every(t=>t.same&&t.frame===c.frame&&t.time===c.time&&t.globalFrame===c.globalFrame&&t.globalTime===c.globalTime);if(!traceOK)throw Error('Child time/identity/order changed');
   if(kind===13){const parts=[];for(let i=0;i<3;i++){const source=await originalPlace(init,await originalImage(init,{...o,image:'seed'}),{...o,x:(i-1)*5,scale:.65});parts.push(await originalPlace(init,source,{...o,...expected(kind,c,i,mode>=14)}));}manual=await originalStack(init,parts,o);}else manual=await originalPlace(init,await originalImage(init,{...o,image:'seed'}),{...o,...expected(kind,c)});
   const reference=await manual.renderAt(c,inputs,{});try{await publish('manual',reference);}finally{await g.release(reference);}const state=await g.createBuffer({type:'f32',length:4},Float32Array.of(mode,c.time,trace.length,Number(traceOK)));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}return result;
  }catch(e){if(result)await g.release(result);throw e;}finally{await manual?.dispose?.();await g.release(input);}
 },async dispose(){await Promise.all(objects.map(o=>o.dispose?.()));}};
});
export default Composition({id:'motion-verify',width:32,height:24,fps:24,durationInFrames:112,seed:37,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
