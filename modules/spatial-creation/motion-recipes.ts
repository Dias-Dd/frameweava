import {easingAt,validateEasing,spring,springAt,evaluate,expr} from '../../src/core/animation.ts';
import type {FrameContext,Signal,Easing,Transform,Spring} from '../../src/core/types.ts';
import {assetOptions,assetNumber} from './physics-assets.ts';
import {scalar,fail} from './lifecycle.ts';

export interface PhaseTiming {/** Local Stage frame, not seconds. Exit omission ends at the last frame. */at?:number;duration?:number;easing?:Easing;fade?:boolean}
export type MotionDirection='left'|'right'|'top'|'bottom';
export interface SlideControls {direction?:MotionDirection;distance?:Signal<number>;offset?:readonly [Signal<number>,Signal<number>]}
export interface PopControls {scale?:Signal<number>}
export interface SpinControls extends PopControls {angle?:Signal<number>}
export interface SpringControls extends PopControls {spring?:Partial<Pick<Spring['$spring'],'stiffness'|'damping'|'mass'|'velocity'>>}
export type CreationPhase=PhaseTiming&({kind:'fade'}|({kind:'slide'}&SlideControls)|({kind:'pop'}&PopControls)|({kind:'spin'}&SpinControls)|({kind:'spring'}&SpringControls));
export interface IdleTiming {frequency?:Signal<number>;phase?:Signal<number>}
export interface FloatControls extends IdleTiming {offset?:readonly [Signal<number>,Signal<number>]}
export interface PulseControls extends IdleTiming {amount?:Signal<number>}
export interface SwingControls extends IdleTiming {angle?:Signal<number>}
export type CreationIdle=({kind:'float'}&FloatControls)|({kind:'pulse'}&PulseControls)|({kind:'swing'}&SwingControls);
export interface MotionRecipe {enter?:CreationPhase|false;exit?:CreationPhase|false;idle?:CreationIdle|false}
const phaseFields={fade:[],slide:['direction','distance','offset'],pop:['scale'],spin:['scale','angle'],spring:['scale','spring']} as const;
const idleFields={float:['offset'],pulse:['amount'],swing:['angle']} as const;
export const motionPhaseFields=(kind:CreationPhase['kind'])=>['at','duration','easing','fade',...phaseFields[kind]];
export const motionIdleFields=(kind:CreationIdle['kind'])=>['frequency','phase',...idleFields[kind]];
function pair(value:unknown,name:string){if(value!==undefined&&(!Array.isArray(value)||value.length!==2))fail(name+' requires two scalar Signals');}
function timing(v:CreationPhase){
 if(!Object.hasOwn(phaseFields,v?.kind))fail('Unknown creation motion phase');assetOptions(v,['kind',...motionPhaseFields(v.kind)],'motion phase');
 if(v.at!==undefined)assetNumber(v.at,'at (local frame)',0);const duration=assetNumber(v.duration??12,'duration (frames)',Number.MIN_VALUE),at=v.at??0;
 if(!Number.isFinite(at+duration)||at+duration===at)fail('Motion duration must form a distinct finite frame interval');validateEasing(v.easing);
 if(v.fade!==undefined&&typeof v.fade!=='boolean')fail('fade must be boolean');
 if(v.kind==='slide'){if(v.direction!==undefined&&!['left','right','top','bottom'].includes(v.direction))fail('Unknown slide direction');pair(v.offset,'slide offset');if(v.offset!==undefined&&(v.direction!==undefined||v.distance!==undefined))fail('Choose offset or direction/distance for a slide');}
 if(v.kind==='spring'&&v.spring!==undefined){assetOptions(v.spring,['stiffness','damping','mass','velocity'],'spring controls');spring({from:0,to:1,...v.spring});}
}
/** Configuration/recipe only. No frame rewrite, simulation state or second
 * interpolation/spring implementation; all curves use the existing Core. */
export function prepareMotion(o:MotionRecipe):Readonly<MotionRecipe>{
 const value={enter:o.enter===undefined?{kind:'slide' as const}:o.enter,exit:o.exit===undefined?false:o.exit,idle:o.idle===undefined?false:o.idle};
 for(const phase of [value.enter,value.exit])if(phase!==false)timing(phase);
 if(value.idle!==false){const v=value.idle;if(!Object.hasOwn(idleFields,v?.kind))fail('Unknown idle motion');assetOptions(v,['kind',...motionIdleFields(v.kind)],'idle motion');if(v.kind==='float')pair(v.offset,'float offset');}
 try{return structuredClone(value);}catch{fail('Motion controls require serializable Core Signals');}
}
function samplePhase(v:CreationPhase|false|undefined,exit:boolean,c:FrameContext,width:number,height:number){
 if(!v)return {x:0,y:0,scale:1,rotation:0,opacity:1};
 const duration=v.duration??12,at=v.at??(exit?c.durationInFrames-1-duration:0),t=easingAt(v.easing??(exit?'easeIn':'easeOut'),(c.frame-at)/duration);
 // A user Bezier may overshoot; geometry retains it while coverage is bounded.
 const coverage=Math.max(0,Math.min(1,t)),response=v.kind==='spring'?springAt(spring({from:0,to:1,start:at,damping:18,...v.spring}),c):t,q=exit?response:1-response;
 let x=0,y=0,scale=1,rotation=0;
 if(v.kind==='slide'){const distance=scalar(v.distance??Math.min(width,height)*.15,c,'slide distance',0),direction=v.direction??'bottom',offset=v.offset??(direction==='left'?[-distance,0]:direction==='right'?[distance,0]:direction==='top'?[0,-distance]:[0,distance]);x=scalar(offset[0],c,'slide offset.x')*q;y=scalar(offset[1],c,'slide offset.y')*q;}
 if(v.kind==='pop'||v.kind==='spin'||v.kind==='spring')scale=1+(scalar(v.scale??.65,c,'hidden scale',0)-1)*q;
 if(v.kind==='spin')rotation=scalar(v.angle??-45,c,'hidden angle')*q;
 return {x,y,scale,rotation,opacity:v.fade===false?1:exit?1-coverage:coverage};
}
export function sampleMotion(o:Readonly<MotionRecipe>,c:FrameContext,width:number,height:number):Transform{
 const enter=samplePhase(o.enter,false,c,width,height),exit=samplePhase(o.exit,true,c,width,height);let x=0,y=0,scale=1,rotation=0;
 if(o.idle){const v=o.idle,frequency=scalar(v.frequency??.6,c,'frequency (Hz)',0),phase=scalar(v.phase??0,c,'phase (radians)'),wave=evaluate(expr.sin(expr.add(expr.mul(2*Math.PI,frequency,expr.time),phase)),c) as number;
  if(v.kind==='float'){x=scalar(v.offset?.[0]??0,c,'float offset.x')*wave;y=scalar(v.offset?.[1]??12,c,'float offset.y')*wave;}
  if(v.kind==='pulse')scale=1+scalar(v.amount??.04,c,'pulse amount',0)*wave;
  if(v.kind==='swing')rotation=scalar(v.angle??4,c,'swing angle')*wave;
 }
 const transform={x:enter.x+exit.x+x,y:enter.y+exit.y+y,scale:enter.scale*exit.scale*scale,rotation:enter.rotation+exit.rotation+rotation,opacity:enter.opacity*exit.opacity};
 if(Object.values(transform).some(n=>!Number.isFinite(n)))fail('Motion controls produced a nonfinite transform');return transform;
}
