import type {CreationInit} from '../types.ts';
import {silkRibbon,particleBurst,puppetCard,characterMotion,ownedPost} from '../index.ts';
import {keyframes} from '../../../src/core/animation.ts';
import {windFlag,clothSheet,ballBody,springJoint} from '../index.ts';
declare const init:CreationInit;
silkRibbon(init,{width:keyframes([{frame:0,value:.1},{frame:24,value:.6}]),ink:[1,.2,.1],speed:.5});
particleBurst(init,{count:250,style:{ink:[keyframes([{frame:0,value:1}]),.5,2]}});
// @ts-expect-error creation stays in float HDR
silkRibbon(init,{format:'rgba8unorm'});
// @ts-expect-error geometry is not an image
ownedPost(()=>({positions:[1,2,3]}));
// @ts-expect-error simulation birth history cannot use a current-frame Signal
particleBurst(init,{simulation:{rate:keyframes([{frame:0,value:10}])}});
// @ts-expect-error a Puppet needs real MeshData + declared texture input
puppetCard(init,{pins:{}});
// @ts-expect-error no animation of arbitrary JS functions
silkRibbon(init,{width:()=>.2});
// @ts-expect-error character assets are typed Graphics contracts
characterMotion(init,{asset:{mesh:{},skeleton:{}}});
silkRibbon(init,{finish:'cinema'});
particleBurst(init,{finish:[{preset:'neon',glow:{intensity:keyframes([{frame:0,value:0},{frame:24,value:.4}])}},{vignette:.2}]});
particleBurst(init,{finish:[false,{enabled:keyframes([{frame:0,value:0},{frame:12,value:1,easing:'step'}]),preset:'cinema'}]});
// @ts-expect-error checkbox controls cannot be strings
silkRibbon(init,{finish:{enabled:keyframes([{frame:0,value:'yes'}])}});
// @ts-expect-error preset names are enumerated
silkRibbon(init,{finish:'warmish'});
// @ts-expect-error ownership and image buffers are not look parameters
silkRibbon(init,{finish:{glow:{ownership:'owned'}}});
windFlag(init,{wind:[0,0,keyframes([{frame:0,value:1},{frame:24,value:2}])],simulation:{substeps:8}});
clothSheet({segments:[12,8],plane:'xz'});ballBody({id:'ball',radius:.2});springJoint({id:'tether',between:['anchor','ball']});
// @ts-expect-error geometry is immutable simulation setup, not a current-frame Signal
windFlag(init,{size:[keyframes([{frame:0,value:1}]),2]});
// @ts-expect-error body helpers are real rigid data, not images
ownedPost(()=>ballBody({id:'ball'}));
import {puppetImage,puppetSway} from '../index.ts';
puppetImage(init,{image:'art',pins:{hand:{at:[.4,.2],offset:[keyframes([{frame:0,value:0},{frame:24,value:.1}]),0]}}});
puppetSway(init,{image:{resource:'plant',size:[320,400]},amount:keyframes([{frame:0,value:0},{frame:24,value:.1}])});
// @ts-expect-error normalized rest topology is immutable, not a Signal
puppetImage(init,{pins:{hand:{at:[keyframes([{frame:0,value:.4}]),.2]}}});
// @ts-expect-error no GPU handle is a resource or image input name
puppetSway(init,{image:init.gpu});
// @ts-expect-error no per-instance auto-WASM/worker authorization
puppetSway(init,{solver:{worker:true}});
import {particleField,confettiField} from '../index.ts';
confettiField(init,{radius:keyframes([{frame:0,value:.03},{frame:24,value:.06}]),color:[1,.3,keyframes([{frame:0,value:1},{frame:24,value:2}])],wind:[.1,0,0]});
particleField(init,{emitter:{shape:'sphere',radius:1,surface:true},sprite:{image:'atlas',columns:2,rows:1},style:{spriteFrame:.5}});
// @ts-expect-error birth history is static; never fake current-frame Signal evaluation
particleField(init,{rate:keyframes([{frame:0,value:10},{frame:24,value:20}])});
// @ts-expect-error shape topology does not accept GPU buffers
particleField(init,{emitter:{shape:'sphere',radius:init.gpu}});
