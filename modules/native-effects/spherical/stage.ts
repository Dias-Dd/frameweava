import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {linear709} from '../../../src/media/surface.ts';
import {publish} from '../composite/stage.ts';
import {createNativeSphericalEffects} from './index.ts';
import {sampleOptions} from './cases.ts';
import type {FrameLayout} from './types.ts';
import {EngineError} from '../../../src/core/errors.ts';
interface Props{half?:boolean;layout?:FrameLayout;partial?:boolean;capture?:boolean;performance?:boolean;only?:'blur';segments?:boolean;suite?:boolean;single?:boolean}
const plate={abiVersion:1 as const,id:'fixture/spherical/source',version:'1.0.0',inputCount:0,parameterWords:3,code:`fn pixel(p:vec2u)->vec4f{let packing=paramU32(0u);var eye=0u;var q=p;var s=outputSize();if(packing==1u){s.x/=2u;eye=p.x/s.x;q.x%=s.x;}if(packing==2u){s.y/=2u;eye=p.y/s.y;q.y%=s.y;}let x=f32(q.x)*17./f32(s.x);let y=f32(q.y)*9./f32(s.y);let alpha=paramU32(1u);let a=f32((q.x+3u*q.y)%4u)/3.;var rgb=vec3f(.15+x*.05+y*.04+f32(eye)*2.,-.2+x*.015-y*.02,1.7-x*.03+f32(paramU32(2u))*.01);if(alpha==0u&&a>0.){rgb*=a;}if(alpha==2u){return vec4f(rgb,1.);}return vec4f(rgb,a);}`};
export const sphericalStage=defineNativeStage<Record<string,never>,Props>(async init=>{const g=init.gpu,fx=createNativeSphericalEffects(init);return {async renderAt(context,_inputs,props){const frame=props.single?context.frame%100:context.frame,kind=frame%4,layout:FrameLayout=props.suite?(kind===2?'side-by-side':kind===3?'top-bottom':'mono'):props.layout??'mono',half=props.half===true||props.suite===true&&kind===1,partial=props.partial===true||props.suite===true&&kind===3,w=props.suite?(kind===2?18:kind===3?9:17):init.width,h=props.suite?(kind===2?5:kind===3?10:9):init.height,alpha=frame%3,capture=props.capture!==false&&props.performance!==true,source=await g.run(await g.compile(plate),[],{output:{width:w,height:h,format:half?'rgba16float':'rgba32float',color:linear709,alpha:alpha===0?'premultiplied':alpha===1?'straight':'opaque'},parameters:Uint32Array.of(['mono','side-by-side','top-bottom'].indexOf(layout),alpha,frame)}),o=sampleOptions(frame,layout,partial);
  if(capture){await publish(g,'source',source);const metadata=await g.createBuffer({type:'u32',length:7},Uint32Array.of(context.seed>>>0,frame,w,h,['mono','side-by-side','top-bottom'].indexOf(layout),Number(half),Number(partial)));await g.publishBuffer('metadata',metadata,{version:1});await g.releaseBuffer(metadata);}
  return fx.processImage(source,async(image,f)=>{const see=async(name:string,value:Awaited<ReturnType<typeof f.vrBlur>>)=>{if(capture)await publish(g,name,value);if(props.segments)try{await g.flushState({version:1});}catch(error){throw new EngineError('E_SPHERICAL_QA_SUBMISSION','Spherical QA segment '+name+' failed: '+String(error));}return value;};
   if(props.only==='blur')return see('chain',await f.vrBlur(image,o.blur));
   if(props.single){let result:typeof image;switch(Math.floor(context.frame/100)){
    case 0:result=await f.vrBlur(image,o.blur);break;case 1:result=await f.vrDenoise(image,o.random);break;case 2:result=await f.vrDenoise(image,o.salt);break;
    case 3:result=await f.vrSharpen(image,o.sharpen);break;case 4:result=await f.vrGlow(image,o.glow);break;case 5:result=await f.vrChromaticAberrations(image,o.chromatic);break;
    case 6:result=await f.vrColorGradients(image,o.gradient);break;case 7:result=await f.vrFractalNoise(image,o.fractal);break;case 8:result=await f.vrDigitalGlitch(image,o.glitch);break;
    case 9:result=await f.vrRotateSphere(image,o.rotate);break;case 10:result=await f.vrConverter(image,o.cube);break;
    case 11:result=await f.vrSphereToPlane(image,o.view);break;case 12:result=await f.vrPlaneToSphere(image,{...o.plane,width:w,height:h});break;
    default:throw new EngineError('E_SPHERICAL_QA_CASE','Unknown spherical numeric QA case');}
    await see('result',result);
    // The published diagnostic buffer contains the actual operation output;
    // the fixed Stage root is only a size-compatible source preview.
    return props.suite?f.vrConverter(image,{inputLayout:layout,outputLayout:'mono',eye:layout==='mono'?undefined:'right',width:init.width,height:init.height}):image;
   }
   await see('blur',await f.vrBlur(image,o.blur));await see('random',await f.vrDenoise(image,o.random));if(!props.performance)await see('salt',await f.vrDenoise(image,o.salt));
   await see('sharpen',await f.vrSharpen(image,o.sharpen));await see('glow',await f.vrGlow(image,o.glow));await see('chromatic',await f.vrChromaticAberrations(image,o.chromatic));await see('gradient',await f.vrColorGradients(image,o.gradient));await see('fractal',await f.vrFractalNoise(image,o.fractal));await see('glitch',await f.vrDigitalGlitch(image,o.glitch));await see('rotated',await f.vrRotateSphere(image,o.rotate));
   const cube=await see('cube',await f.vrConverter(image,o.cube));await see('cube-to-sphere',await f.vrConverter(cube,{inputProjection:'cube-3x2',inputLayout:layout,outputLayout:layout,width:w,height:h}));await see('view',await f.vrSphereToPlane(image,o.view));await see('plane',await f.vrPlaneToSphere(image,{...o.plane,width:w,height:h}));
   // Actual continuous resident chain, with one explicit F16 publication per call.
   const chain=await f.vrRotateSphere(await f.vrGlow(await f.vrBlur(image,o.blur),o.glow),o.rotate);await see('chain',chain);return props.suite?f.vrConverter(chain,{inputLayout:layout,outputLayout:'mono',eye:layout==='mono'?undefined:'right',width:init.width,height:init.height}):chain;
  },{context});
 },async dispose(){await fx.dispose();await fx.dispose();}};});
