import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keyframes,expr} from '../src/core/animation.ts';
import type {FrameContext} from '../src/core/types.ts';
import {createAim2D} from '../modules/pro-animation/src/aim-2d.ts';
const ctx=(frame=0):FrameContext=>({frame,time:frame/24,globalFrame:frame,globalTime:frame/24,fps:{num:24,den:1},dt:1/24,progress:0,durationInFrames:120,seed:13});
const close=(a:number,b:number,e=1e-11)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b}; ${e}`);
test('aim uses Layer clockwise degrees and an explicit forward axis; principal tie is -180',()=>{
 for(const [x,y,angle]of [[1,0,0],[0,1,90],[-1,0,-180],[0,-1,-90],[1,1,45]] as const){const s=createAim2D({origin:[0,0],target:[x,y]}).sample(ctx());close(s.rotationDegrees,angle);close(Math.hypot(...s.direction!),1);assert.equal(s.status,'aimed');}
 close(createAim2D({origin:[0,0],target:[0,1],forwardDegrees:90,offsetDegrees:15}).rotationAt(ctx()),15);
 close(createAim2D({origin:[0,0],target:[0,1],restDegrees:720}).rotationAt(ctx()),810);
});
test('rest blend and limits compose in signed shortest-arc space, without temporal state',()=>{
 const options={origin:[0,0] as const,target:[0,1] as const,restDegrees:10,weight:.5,limitsDegrees:[-30,30] as const},s=createAim2D(options).sample(ctx());
 assert.equal(s.requestedOffsetDegrees,80);assert.equal(s.appliedOffsetDegrees,15);assert.equal(s.rotationDegrees,25);assert.equal(s.status,'limited');
 assert.equal(createAim2D({...options,weight:0}).rotationAt(ctx()),10);
 const phase=createAim2D({origin:[0,0],target:[-1,-0],restDegrees:0,weight:.5});assert.equal(phase.rotationAt(ctx()),-90);
});
test('Core Signal/keyframe/limits snapshots preserve context and random repeated queries',()=>{
 const track=keyframes<number>([{frame:0,value:-1},{frame:24,value:1}]),limits:[number,number]=[-170,170],c=ctx(8),before=structuredClone(c);
 const aim=createAim2D({origin:[0,0],target:[track,expr.add(2,expr.time)],limitsDegrees:limits}),old=aim.sample(c);track.$keyframes[0].value=30;limits[0]=0;
 assert.deepEqual(aim.sample(c),old);assert.deepEqual(c,before);assert.ok(Object.isFrozen(old)&&Object.isFrozen(old.direction));
 const seen=new Map();for(const f of [24,0,8.5,8,24,8.5,0]){const s=aim.sample(ctx(f));if(seen.has(f))assert.deepEqual(s,seen.get(f));seen.set(f,s);}
});
test('coincidence returns explicit rest or error, never an order-dependent previous heading',()=>{
 const aim=createAim2D({origin:[0,0],target:[expr.time,0],restDegrees:37});assert.equal(aim.sample(ctx(1)).status,'aimed');const s=aim.sample(ctx(0));assert.equal(s.status,'coincident');assert.equal(s.rotationDegrees,37);assert.equal(s.direction,null);assert.equal(s.requestedOffsetDegrees,null);assert.equal(s.distance,0);
 assert.throws(()=>createAim2D({origin:[1,2],target:[1,2],coincident:'error'}).sample(ctx()),{code:'E_PA_AIM'});
});
test('direction remains unit at tiny scales; overflow and invalid controls are observable',()=>{
 for(const n of [Number.MIN_VALUE,1e-300,1,1e200]){const s=createAim2D({origin:[0,0],target:[n,n]}).sample(ctx());close(s.direction![0],Math.SQRT1_2);close(s.rotationDegrees,45);}
 for(const changes of [{weight:-1},{weight:2},{target:[NaN,1]},{restDegrees:1e30}])assert.throws(()=>createAim2D({origin:[0,0],target:[1,1],...changes} as any).sample(ctx()),{code:'E_PA_AIM'});
 for(const changes of [{limitsDegrees:[30,-30]},{limitsDegrees:[-181,0]},{limitsDegrees:5},{coincident:'last'},{origin:[0]}])assert.throws(()=>createAim2D({origin:[0,0],target:[1,1],...changes} as any),{code:'E_PA_AIM'});
 assert.throws(()=>createAim2D({origin:[1e308,0],target:[-1e308,0]}).sample(ctx()),{code:'E_PA_AIM'});
});
test('fixed-seed directions obey independent geometric dot/cross alignment and bounded-angle projection',()=>{
 let seed=91;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<2000;i++){
  const origin:[number,number]=[(random()-.5)*1e5,(random()-.5)*1e5],target:[number,number]=[(random()-.5)*1e5,(random()-.5)*1e5],a=createAim2D({origin,target}).sample(ctx()),theta=a.rotationDegrees*Math.PI/180,dx=target[0]-origin[0],dy=target[1]-origin[1],length=Math.hypot(dx,dy);
  close((Math.cos(theta)*dy-Math.sin(theta)*dx)/length,0);close((Math.cos(theta)*dx+Math.sin(theta)*dy)/length,1);
  const constrained=createAim2D({origin,target,limitsDegrees:[-45,60],weight:.75}).sample(ctx());assert.ok(constrained.appliedOffsetDegrees>=-33.75&&constrained.appliedOffsetDegrees<=45);
 }
});
