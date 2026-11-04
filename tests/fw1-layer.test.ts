import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Composition,Stage,Layer,Rect,ref,content,planOutput,layersForMedia,validateTVG,keyframes,type TVG} from '../src/index.ts';
import type {LayerProps} from '../src/core/authoring.ts';
const scene=(children:any,durationInFrames?:number)=>Composition({width:64,height:48,fps:30,...durationInFrames===undefined?{}:{durationInFrames},children});
const stage=()=>Stage({id:'s',children:Rect({width:10,height:10})});
test('Typed Layer content forbids unrelated media fields at author time',()=>{
 const good:LayerProps={source:content.audio(ref('a','audio'),{durationSamples:48000,sampleRate:48000}),gain:keyframes([{frame:0,value:0},{frame:30,value:1}]),pan:0};void good;
 // @ts-expect-error visual attributes cannot be applied to typed audio content
 const bad:LayerProps={source:content.audio(ref('a','audio'),{durationSamples:48000,sampleRate:48000}),opacity:.5};void bad;
 // @ts-expect-error audio attributes cannot be applied to typed image content
 const badImage:LayerProps={source:content.image(ref('s')),gain:.5};void badImage;
});
test('Still vs finite sequence output is based on content and declared time, never pixel changes',()=>{
 assert.equal(planOutput(scene(stage())).format,'png');
 const video=scene([stage(),Layer({source:content.video(ref('s'),{durationInFrames:12})})]);
 assert.equal(video.composition.durationInFrames,12);assert.equal(planOutput(video).format,'mp4');
 assert.equal(planOutput(scene(stage(),30)).format,'mp4');
 assert.equal(planOutput(video,{format:'png'}).format,'png');
 const disabled=scene([stage(),Layer({enabled:false,children:Layer({source:ref('s')})})],1);
 assert.equal(disabled.layers.length,0);assert.throws(()=>planOutput(disabled),{code:'E_OUTPUT_EMPTY'});
});
test('Layer grouping, names, intervals and legacy PortRefs retain compatibility',()=>{
 const tvg=scene([stage(),Layer({id:'group',name:'Cards',children:Layer({name:'Still',source:content.image(ref('s')),start:2,end:5,opacity:.8})})]);
 assert.equal(tvg.composition.durationInFrames,5);assert.equal(tvg.layers[1].parent,'group');assert.equal(tvg.layers[1].name,'Still');
 assert.deepEqual(tvg.layers[1].source,ref('s'));assert.equal(validateTVG(tvg).length,0);
 assert.equal(scene([stage(),Layer({source:ref('s')})],3).layers[0].end,3);
 const delayed=scene([Stage({id:'late',start:10,children:Rect({width:1})}),Layer({source:ref('late')})]);assert.equal(delayed.composition.durationInFrames,11);assert.equal(delayed.layers[0].start,10);assert.equal(validateTVG(delayed).length,0);
 assert.throws(()=>scene([stage(),Layer({source:ref('s'),gain:.3})],1),{code:'E_LAYER_MEDIA'});
});
test('Unknown, infinite and animated producers require finite duration or Layer end',()=>{
 const opaque=()=>Stage({id:'opaque',entry:'./opaque.ts'});
 assert.throws(()=>scene(opaque()),{code:'E_OUTPUT_RANGE'});
 assert.throws(()=>scene([opaque(),Layer({source:content.video(ref('opaque'),{durationInFrames:'unknown'})})]),{code:'E_OUTPUT_RANGE'});
 assert.throws(()=>scene([opaque(),Layer({source:content.video(ref('opaque'),{durationInFrames:'infinite'})})]),{code:'E_OUTPUT_RANGE'});
 assert.equal(scene([opaque(),Layer({source:ref('opaque'),end:25})]).composition.durationInFrames,25);
 assert.equal(scene([opaque(),Layer({source:content.video(ref('opaque'),{durationInFrames:'unknown'}),end:25})]).composition.durationInFrames,25);
 assert.throws(()=>scene(Stage({id:'timed',children:Rect({start:10,end:20})})),{code:'E_OUTPUT_RANGE'});
 assert.throws(()=>Layer({enabled:'yes'} as any),{code:'E_LAYER_ENABLED'});
 assert.throws(()=>scene(Stage({id:'animated',children:Rect({x:keyframes([{frame:0,value:0},{frame:10,value:10}])})})),{code:'E_OUTPUT_RANGE'});
});
test('Audio/mixed output planning uses real declared ports after AU-1 integration',()=>{
 // Port inspection contract fixture only, not a runnable audio Stage or fabricated PCM.
 const tvg=scene(stage(),30);(tvg.stages[0].outputs as Record<string,string>).audio='audio';
 tvg.layers=[{id:'audio',source:ref('s','audio'),start:0,end:30}];
 assert.equal(planOutput(tvg).format,'wav');tvg.layers.push({id:'visual',source:ref('s'),start:0,end:30});
 assert.equal(planOutput(tvg).format,'mp4');assert.deepEqual(layersForMedia(tvg,'surface').map(l=>l.id),['visual']);assert.deepEqual(layersForMedia(tvg,'audio').map(l=>l.id),['audio']);assert.equal(planOutput(tvg,{format:'png'}).diagnostics[0].code,'W_OUTPUT_AUDIO_OMITTED');
 assert.equal(planOutput(tvg,{format:'wav'}).diagnostics[0].code,'W_OUTPUT_VISUAL_OMITTED');
 assert.throws(()=>scene([stage(),Layer({source:content.audio(ref('s'),{durationSamples:48000,sampleRate:48000})})]),{code:'E_LAYER_CONTENT'});
 // Audio is now a formal port type; these fixtures still only test planning, not PCM execution.
 assert.ok(!validateTVG(tvg).some(d=>d.code==='E_PORT_TYPE'));
});
test('Output interval respects full ancestor intersection and validates range',()=>{
 const tvg=scene(stage(),30);tvg.layers=[{id:'root',start:0,end:5},{id:'group',parent:'root',start:4,end:10},{id:'child',parent:'group',start:7,end:20,source:ref('s')}];
 assert.throws(()=>planOutput(tvg),{code:'E_OUTPUT_EMPTY'});
 assert.throws(()=>planOutput(scene(stage()),{end:Infinity}),{code:'E_OUTPUT_RANGE'});
});
