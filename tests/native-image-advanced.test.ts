import test from 'node:test';import assert from 'node:assert/strict';
import {linear709} from '../src/media/surface.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import type {NativeStageInit} from '../modules/native-gpu/authoring.ts';
import type {GpuPixelImage} from '../modules/gpu-effects/pixel-types.ts';
import {compose,withImageSources,imageStage,createImageTools,floatImageResource,lightWrap,keyAdvanced,rotoMatte,spatialDeblur,twirl,wireRemove,type ImageSource} from '../modules/native-effects/authoring/index.ts';
const image={info:{version:1,width:17,height:13,format:'rgba32float',alpha:'premultiplied',color:linear709}} as GpuPixelImage;
const context={frame:6,globalFrame:6,time:.25,globalTime:.25,dt:1/24,progress:.5,fps:{num:24,den:1},durationInFrames:12,seed:37};
function init():NativeStageInit {const scope=new NativeRecordingScope();return {gpu:new Proxy(scope.api,{get(g,key){if(key==='capabilities')return ()=>({...g.capabilities(),backend:'native-wgpu',hardwareVerified:true});return Reflect.get(g,key);}}),width:17,height:13,seed:37,resources:{}};}
test('compositions propagate immutable auxiliary declarations without IO',()=>{const a=floatImageResource('a'),b=floatImageResource('b');const effect=compose(lightWrap(a),keyAdvanced({inside:a,background:b}));assert.deepEqual(effect.sources,[a,b]);assert.ok(Object.isFrozen(effect.sources));assert.equal(typeof rotoMatte([]),'function');});
test('same source prepares once, same auxiliary evaluates once per invocation and disposes once',async()=>{let prepare=0,run=0,dispose=0;const source:ImageSource=()=>{throw Error('Unprepared');};source.prepare=()=>{prepare++;return {source:()=>{run++;return image;},dispose(){dispose++;}};};const stage=await imageStage(withImageSources(async(i,f)=>{assert.equal(await f.input(source),await f.input(source));return i;},source),{source})(init());for(const frame of [6,0,6])await stage.renderAt({...context,frame},{},{});assert.equal(prepare,1);assert.equal(run,3);await stage.dispose?.();await stage.dispose?.();assert.equal(dispose,1);});
test('undeclared prepared sources fail with an actionable error before running them',async()=>{const tools=createImageTools(init()),source=floatImageResource('not-declared');await assert.rejects(tools.apply(image,async(i,f)=>{await f.input(source);return i;}),{code:'E_IMAGE_SOURCE_INITIALIZATION'});await assert.rejects(tools.prepareSources([source]),{code:'E_IMAGE_SOURCE_INITIALIZATION'});await tools.dispose();});
test('failed Stage initialization releases previously prepared sources',async()=>{let disposed=0;const a:ImageSource=()=>image,b:ImageSource=()=>image;a.prepare=()=>({source:a,dispose(){disposed++;}});b.prepare=()=>{throw Error('Preparation failed');};await assert.rejects(async()=>imageStage(withImageSources(i=>i,a,b))(init()),/Preparation failed/);assert.equal(disposed,1);});
test('source preparation rejects malformed results and unknown runtime sources',async()=>{const tools=createImageTools(init()),a:ImageSource=()=>image;a.prepare=()=>({source:1} as never);await assert.rejects(tools.prepareSources([a]),{code:'E_IMAGE_AUTHORING_PARAMETER'});await tools.dispose();assert.throws(()=>withImageSources(i=>i,'arbitrary-path' as never),{code:'E_IMAGE_AUTHORING_PARAMETER'});});
function typeChecks(){twirl({angle:1});keyAdvanced({inside:floatImageResource('holdout'),view:'combined-matte'});
 // @ts-expect-error required physical endpoints are not invented
 wireRemove();
 // @ts-expect-error a PSF is required calibration data
 spatialDeblur();
 // @ts-expect-error source strings do not grant filesystem access
 lightWrap('image.png');
 // @ts-expect-error preserve professional float output
 twirl({format:'rgba8'});
}void typeChecks;
