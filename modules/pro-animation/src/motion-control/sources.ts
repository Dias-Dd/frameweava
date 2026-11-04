// SPDX-License-Identifier: Apache-2.0 AND MIT
// Composition of existing Core Signals/springs, audited Inertia and Bezier geometry.
import {spring,springAt} from '../../../../src/core/animation.ts';
import type {FrameContext,Signal,Spring} from '../../../../src/core/types.ts';
import {matrix} from '../../../../src/media/compositor-geometry.ts';
import {cubicPoint,type Cubic} from '../geometry.ts';
import {createInertia,type InertiaOptions} from '../inertia.ts';
import {motionContext,type MotionClock} from './sampling.ts';
import {remapTime} from '../time-controls.ts';
import {point,animated,source,snapshot,scalar,finite,fields,angle,phase,fail,type MotionSource2D,type AnimatedPoint2D,type Point2D} from './common.ts';

export function signalMotion2D(position:AnimatedPoint2D):MotionSource2D{const p=snapshot(position);return context=>animated(p,context,'position');}
export interface OrbitMotionOptions {center:AnimatedPoint2D;radius:AnimatedPoint2D;frequency?:number;phaseDegrees?:Signal<number>;rotationDegrees?:Signal<number>;time?:Signal<number>}
/** Rotated ellipse; frequency is cycles/local-second, not integrated animated speed. */
export function orbitMotion2D(options:OrbitMotionOptions):MotionSource2D{
 fields(options,['center','radius','frequency','phaseDegrees','rotationDegrees','time']);const p=snapshot(options),f=finite(p.frequency??1,'frequency');
 return ctx=>{const center=animated(p.center,ctx,'center'),r=animated(p.radius,ctx,'radius'),a=phase(scalar(p.time??ctx.time,ctx,'time'),f,scalar(p.phaseDegrees??0,ctx,'phase')),rot=angle(scalar(p.rotationDegrees??0,ctx,'rotation')),x=r[0]*Math.cos(a),y=r[1]*Math.sin(a);return point([center[0]+Math.cos(rot)*x-Math.sin(rot)*y,center[1]+Math.sin(rot)*x+Math.cos(rot)*y]);};
}
export interface OscillateMotionOptions {center:AnimatedPoint2D;amplitude:AnimatedPoint2D;frequencies:Point2D;phasesDegrees?:AnimatedPoint2D;time?:Signal<number>}
/** Independent-axis sine motion/Lissajous. All phase parameters explicitly use local seconds. */
export function oscillateMotion2D(options:OscillateMotionOptions):MotionSource2D{
 fields(options,['center','amplitude','frequencies','phasesDegrees','time']);const p=snapshot(options),f=point(p.frequencies,'frequencies');
 return ctx=>{const c=animated(p.center,ctx,'center'),a=animated(p.amplitude,ctx,'amplitude'),ph=animated(p.phasesDegrees??[0,0],ctx,'phases'),t=scalar(p.time??ctx.time,ctx,'time');return point([c[0]+a[0]*Math.sin(phase(t,f[0],ph[0])),c[1]+a[1]*Math.sin(phase(t,f[1],ph[1]))]);};
}
export interface SpiralMotionOptions {center:AnimatedPoint2D;radius:number;growth:number;growthMode?:'linear'|'exponential';frequency?:number;phaseDegrees?:number;startTime?:number}
/** Archimedean (px/sec) or logarithmic (1/sec) spiral. Not a particle/force simulation. */
export function spiralMotion2D(options:SpiralMotionOptions):MotionSource2D{
 fields(options,['center','radius','growth','growthMode','frequency','phaseDegrees','startTime']);const p=snapshot(options),r=finite(p.radius,'radius'),growth=finite(p.growth,'growth'),f=finite(p.frequency??1,'frequency'),ph=finite(p.phaseDegrees??0,'phase'),start=finite(p.startTime??0,'start'),mode=p.growthMode??'linear';if(!['linear','exponential'].includes(mode))fail('Known spiral growth mode required');
 return ctx=>{const t=finite(ctx.time-start,'elapsed time'),radius=finite(mode==='linear'?r+growth*t:r*Math.exp(growth*t),'spiral radius'),a=phase(t,f,ph),c=animated(p.center,ctx,'center');return point([c[0]+radius*Math.cos(a),c[1]+radius*Math.sin(a)]);};
}
export interface BezierMotionOptions {points:readonly [Point2D,Point2D,Point2D,Point2D];progress?:Signal<number>;boundary?:'clamp'|'error'|'extend'}
/** Reuses existing cubicPoint. This is uniform Bezier parameter, not uniform arclength/path follow. */
export function bezierMotion2D(options:BezierMotionOptions):MotionSource2D{
 fields(options,['points','progress','boundary']);if(!Array.isArray(options.points)||options.points.length!==4)fail('Four cubic control points required');const points=options.points.map(p=>[...point(p)]) as Cubic,progress=options.progress===undefined?undefined:snapshot(options.progress),boundary=options.boundary??'clamp';if(!['clamp','error','extend'].includes(boundary))fail('Known Bezier boundary required');
 return ctx=>{let t=scalar(progress??ctx.progress,ctx,'progress');if(boundary==='error'&&(t<0||t>1))fail('Bezier progress outside [0,1]');if(boundary==='clamp')t=Math.max(0,Math.min(1,t));return point(cubicPoint(points,t));};
}
export interface SpringMotionOptions {from:Point2D;to:Point2D;velocity?:Point2D;startFrame?:number;stiffness?:number;damping?:number;mass?:number}
/** Existing Core analytic spring independently on both axes; no spring kernel/runner added. */
export function springMotion2D(options:SpringMotionOptions):MotionSource2D{
 fields(options,['from','to','velocity','startFrame','stiffness','damping','mass']);const from=point(options.from),to=point(options.to),v=point(options.velocity??[0,0]),p:Partial<Spring['$spring']>={start:options.startFrame,stiffness:options.stiffness,damping:options.damping,mass:options.mass};
 const axes=[0,1].map(i=>spring({...p,from:from[i],to:to[i],velocity:v[i]}));return ctx=>point([springAt(axes[0],ctx),springAt(axes[1],ctx)]);
}
export interface InertiaMotionOptions {from:Point2D;velocity:Point2D;timeConstantSeconds?:number;startFrame?:number;boundsX?:InertiaOptions['bounds'];boundsY?:InertiaOptions['bounds']}
/** Audited Motion MIT inertia adapter per axis, preserving its soft-spring handoff contract. */
export function inertiaMotion2D(options:InertiaMotionOptions):MotionSource2D{
 fields(options,['from','velocity','timeConstantSeconds','startFrame','boundsX','boundsY']);const p=snapshot(options),from=point(p.from),velocity=point(p.velocity),axes=[0,1].map(i=>createInertia({from:from[i],velocity:velocity[i],timeConstantSeconds:p.timeConstantSeconds,startFrame:p.startFrame,bounds:i===0?p.boundsX:p.boundsY}));return ctx=>point([axes[0].valueAt(ctx),axes[1].valueAt(ctx)]);
}
export function staggerMotion2D(input:MotionSource2D,options:{index:number;delaySeconds:number;startTime?:number;clock?:MotionClock}):MotionSource2D{
 source(input);fields(options,['index','delaySeconds','startTime','clock']);const {index,delaySeconds}=options,clock=options.clock??'stage';if(!Number.isSafeInteger(index)||index<0)fail('Nonnegative safe instance index required');const offset=finite(index*finite(delaySeconds,'delay')+finite(options.startTime??0,'start'),'stagger offset');
 return ctx=>point(input(motionContext(ctx,finite(ctx.time-offset,'stagger source time'),clock)));
}
export function loopMotion2D(input:MotionSource2D,options:{start:number;duration:number;mode?:'cycle'|'ping-pong'|'offset';clock?:MotionClock}):MotionSource2D{
 source(input);fields(options,['start','duration','mode','clock']);const start=finite(options.start,'start'),duration=finite(options.duration,'duration'),mode=options.mode??'cycle',clock=options.clock??'stage';if(duration<=0||start+duration<=start||!['cycle','ping-pong','offset'].includes(mode))fail('Resolvable positive loop duration and known mode required');
 return ctx=>{const t=remapTime({time:ctx.time,start,duration,mode:mode==='ping-pong'?'ping-pong':'loop'},ctx),p=point(input(motionContext(ctx,t,clock)));if(mode!=='offset')return p;const cycles=Math.floor((ctx.time-start)/duration),a=point(input(motionContext(ctx,start,clock))),b=point(input(motionContext(ctx,start+duration,clock)));return point([p[0]+cycles*(b[0]-a[0]),p[1]+cycles*(b[1]-a[1])]);};
}
export interface MotionTransformOptions {x?:Signal<number>;y?:Signal<number>;rotationDegrees?:Signal<number>;scale?:Signal<number>;scaleX?:Signal<number>;scaleY?:Signal<number>;origin?:AnimatedPoint2D}
/** Existing Layer affine convention (+y down, clockwise degrees); dynamic controls remain Core Signals. */
export function transformMotion2D(input:MotionSource2D,options:MotionTransformOptions):MotionSource2D{
 source(input);fields(options,['x','y','rotationDegrees','scale','scaleX','scaleY','origin']);const p=snapshot(options);
 return ctx=>{const v=point(input(ctx)),o=animated(p.origin??[0,0],ctx,'origin'),a=matrix({id:'motion-transform',start:0,end:1,x:scalar(p.x??0,ctx,'x'),y:scalar(p.y??0,ctx,'y'),rotation:scalar(p.rotationDegrees??0,ctx,'rotation'),scale:scalar(p.scale??1,ctx,'scale'),scaleX:scalar(p.scaleX??1,ctx,'scaleX'),scaleY:scalar(p.scaleY??1,ctx,'scaleY'),originX:o[0],originY:o[1]});return point([a[0]*v[0]+a[2]*v[1]+a[4],a[1]*v[0]+a[3]*v[1]+a[5]]);};
}
export function blendMotion2D(a:MotionSource2D,b:MotionSource2D,weight:Signal<number>):MotionSource2D{
 source(a);source(b);const w=snapshot(weight);return ctx=>{const t=scalar(w,ctx,'weight');if(t<0||t>1)fail('Blend weight must be in [0,1]');const x=point(a(ctx)),y=point(b(ctx));return point([x[0]*(1-t)+y[0]*t,x[1]*(1-t)+y[1]*t]);};
}
