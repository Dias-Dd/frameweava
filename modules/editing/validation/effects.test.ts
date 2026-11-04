import test from 'node:test';import assert from 'node:assert/strict';
import {effect,withEffects,transition,sequenceWithTransitions,video,clip,at,sequence,timeline,splitClip,speedClip,reverseClip,remapClip,editingStage,editComposition} from '../index.ts';
import {activeTracks,sourcePosition} from '../sampling.ts';import {expr} from '../../../src/core/animation.ts';
const source=video('v','./v.mp4',{width:320,height:180}),a=clip(source,{duration:18}),b=clip(source,{from:6,duration:18}),t=transition('crossDissolve',{duration:12});
test('explicit transition overlaps declared samples with closed progress endpoints and half-open clip ends',()=>{
 const plan=timeline({fps:24,tracks:[sequenceWithTransitions([a,b],t)]});assert.equal(plan.duration,24);assert.equal(activeTracks(plan,5)[0].clips.length,1);
 for(const [f,progress]of [[6,0],[12,6/11],[17,1]]){const s=activeTracks(plan,f)[0];assert.equal(s.clips.length,2);assert.equal(s.progress,progress);assert.deepEqual(sourcePosition(s.clips[1],f,plan.fps),f===6?{num:1,den:4}:f===12?{num:1,den:2}:{num:17,den:24});}
 assert.equal(activeTracks(plan,18)[0].clips.length,1);assert.equal(activeTracks(plan,23)[0].clips[0].at,6);
});
test('hard cuts remain unchanged; optional boundaries and one-sample transition are explicit',()=>{
 const plain=sequence(a,b);assert.deepEqual(sequenceWithTransitions([a,b],[null]),plain);
 const p=timeline({fps:24,tracks:[sequenceWithTransitions([a,b],transition('pushTransition',{duration:1}))]});assert.equal(p.duration,35);assert.equal(activeTracks(p,17)[0].progress,1);assert.equal(activeTracks(p,18)[0].clips.length,1);
});
test('oversized, undeclared and triple overlaps fail without inventing source handles',()=>{
 for(const fn of [()=>sequenceWithTransitions([a,b],transition('crossDissolve',{duration:19})),()=>sequenceWithTransitions([a,b,a],t),()=>sequenceWithTransitions([a,b],[]),()=>timeline({fps:24,tracks:[[at(0,a),{...at(7,b),transition:t}]]}),()=>timeline({fps:24,tracks:[[{...at(0,a),transition:t}]]})])assert.throws(fn,{code:'E_EDIT_TRANSITION'});
 assert.throws(()=>timeline({fps:24,tracks:[[at(0,a),at(6,b)]]}),{code:'E_EDIT_PARAMETER'});
});
test('typed effect data is cloned and existing time helpers preserve effect chains',()=>{
 const options={stops:.5},call=effect('exposure',options),shot=withEffects(a,call,effect('blur'));options.stops=8;assert.equal(call.options.stops,.5);assert.equal(a.effects,undefined);
 for(const item of [...splitClip(shot,9),speedClip(shot,2),reverseClip(shot),remapClip(shot,expr.frame)])assert.deepEqual(item.effects,shot.effects);
 const next=withEffects(shot,effect('glow'));assert.equal(next.effects!.length,3);assert.equal(shot.effects!.length,2);
});
test('effect and transition descriptors reject unknown names, live functions and Stage-owned options',()=>{
 for(const fn of [()=>effect('fake' as any),()=>effect('blur',{radius:()=>2}as any),()=>effect('glow',{format:'rgba8unorm'}as any),()=>effect('exposure',{signal:new AbortController().signal}as any)])assert.throws(fn,{code:'E_EDIT_EFFECT'});
 for(const fn of [()=>transition('fake' as any,{duration:2}),()=>transition('crossDissolve',{duration:2,format:'rgba8unorm'}as any)])assert.throws(fn,{code:'E_EDIT_TRANSITION'});
});
test('Core Signals in clip, transition and final grade retain their actual Stage context',()=>{
 const track=sequenceWithTransitions([withEffects(a,effect('exposure',{stops:expr.time})),b],transition('crossDissolve',{duration:12,progress:expr.progress}));
 const factory=editingStage({fps:24,tracks:[track],effects:[effect('blur',{radius:expr.time})]}),graph=editComposition({factory,width:640,height:360});assert.deepEqual(graph.stages[0].props,{});
});
