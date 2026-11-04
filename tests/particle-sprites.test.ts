import {test} from 'node:test';import assert from 'node:assert/strict';
import {evaluateParticleLife,prepareParticleLife} from '../modules/spatial-effects/src/appearance.ts';
import {prepareSpriteAtlas,createSpriteTexture} from '../modules/spatial-effects/src/sprite-atlas.ts';
import {keyframes,keyframesAt} from '../src/core/animation.ts';
import {surfaceFromPixels,linear709,srgb} from '../src/media/surface.ts';
import type {ParticleLifeCurves} from '../modules/spatial-effects/src/appearance.ts';

test('particle life reuses Core interpolation/easing, has identity defaults and clamps to authored endpoints',()=>{
 assert.deepEqual(evaluateParticleLife({},.3),{radiusScale:1,opacity:1,rotation:0,spriteFrame:0,ink:[1,1,1]});
 const curves:ParticleLifeCurves={radiusScale:[{age:.2,value:.5},{age:.8,value:2,easing:{bezier:[.1,0,.9,1]}}],opacity:[{age:0,value:0},{age:.5,value:1,easing:'step'},{age:1,value:0}],ink:[{age:0,value:[-2,4,.5]},{age:1,value:[2,-4,1.5]}],rotation:[{age:0,value:-Math.PI},{age:1,value:Math.PI*3}],spriteFrame:[{age:0,value:0},{age:1,value:7}]};
 const prepared=prepareParticleLife(curves),reference=keyframes(curves.radiusScale!.map(k=>({frame:k.age,value:k.value,easing:k.easing})));
 for(const age of [0,.1,.2,.33,.499999,.5,.8,1]){const value=prepared(age);assert.equal(value.radiusScale,keyframesAt(reference,age));assert.ok(Math.abs(value.ink[0]-(-2+4*age))<1e-14);assert.equal(value.spriteFrame,7*age);assert.equal(value.opacity,age<.5?0:2*(1-age));}
 curves.radiusScale![0].value=100;assert.equal(prepared(0).radiusScale,.5,'prepared curves own their values');
});

test('life invalid age/order/NaN/unknown fields reject; overshooting opacity is explicit, not clipped',()=>{
 for(const age of [-.1,1.1,NaN,Infinity])assert.throws(()=>evaluateParticleLife({},age),{code:'E_SPATIAL_PARAMETER'});
 for(const c of [{radiusScale:[]},{radiusScale:[{age:0,value:-1}]},{opacity:[{age:0,value:2}]},{spriteFrame:[{age:0,value:-1}]},{ink:[{age:0,value:[1,2,NaN]}]},{unknown:[]},{radiusScale:[{age:2,value:1}]}])assert.throws(()=>prepareParticleLife(c as any),{code:'E_SPATIAL_PARAMETER'});
 assert.throws(()=>prepareParticleLife({rotation:[{age:.5,value:0},{age:.5,value:1}]}),{code:'E_KEYFRAMES'});
 assert.throws(()=>evaluateParticleLife({opacity:[{age:0,value:0},{age:1,value:1,easing:{bezier:[0,3,1,3]}}]},.5),{code:'E_SPATIAL_PARAMETER'});
});

test('float atlas validates actual layout/color before decoding and preserves source ownership',()=>{
 const s=surfaceFromPixels(4,2,new Float32Array(32).fill(.5),{format:'rgba32float',color:linear709,alpha:'straight'}),a=prepareSpriteAtlas({source:s,columns:2,rows:1,count:2},linear709),texture=createSpriteTexture(a);
 assert.equal(a.tileWidth,2);assert.equal(a.tileHeight,2);assert.equal(a.plannedBytes,384);assert.equal(texture.flipY,false);assert.equal(texture.generateMipmaps,false);assert.equal(texture.image.data!.length,32);texture.dispose();assert.equal(s.width,4);
 for(const options of [{columns:3},{rows:3},{count:3},{frameBlending:1},{sampling:'bad'},{boundary:'repeat'},{extra:true}])assert.throws(()=>prepareSpriteAtlas({source:s,columns:2,rows:1,...options} as any,linear709),{code:'E_SPATIAL_PARAMETER'});
 for(const source of [{...s,color:srgb},surfaceFromPixels(4,2,new Float32Array(32).fill(.5),{format:'rgba8unorm',color:linear709})])assert.throws(()=>prepareSpriteAtlas({source,columns:2,rows:1},linear709),{code:'E_SPATIAL_COLOR'});
});
