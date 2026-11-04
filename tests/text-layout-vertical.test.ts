import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import * as graphics from '../modules/graphics-contracts/index.ts';
import type {TextLayoutData,PathData} from '../modules/graphics-contracts/types.ts';
import {createGlyphAnimator} from '../modules/pro-animation/src/glyph-animation.ts';
import {createBidiAnimator} from '../modules/pro-animation/src/bidi-animation.ts';
import {prepareGlyphMeshes} from '../modules/pro-animation/src/text-animation/geometry.ts';
import {createParagraphIndex} from '../modules/pro-animation/src/text-layout/queries.ts';
import type {ShapedRun} from '../modules/pro-animation/src/font-shaping.ts';
import type {FrameContext} from '../src/core/types.ts';
const context:FrameContext={frame:0,time:0,fps:{num:24,den:1},globalTime:0,globalFrame:0,dt:1/24,progress:0,durationInFrames:1,seed:1};

function horizontal():TextLayoutData{return {schema:'frameweave.text-layout',version:1,id:'horizontal',coordinates:{spaceId:'test',unit:'px',origin:'top-left',x:'right',y:'down',width:160,height:120},text:'A😀',layout:{engine:'fixture',version:'1',clusterUnit:'utf16'},fonts:[{id:'font',source:{resourceId:'font',kind:'font',sha256:'0'.repeat(64),bytes:1},faceIndex:0}],styles:[{id:'style',fontId:'font',fontSize:20,fill:{space:'srgb',alpha:'straight',rgba:[1,1,1,1]}}],paragraphs:[{id:'p',start:0,end:3,direction:'ltr'}],lines:[{id:'l',paragraphId:'p',start:0,end:3,baseline:40}],glyphs:[{id:'g',lineId:'l',styleId:'style',glyphId:3,cluster:{start:0,end:1},x:10,y:40,advanceX:20,advanceY:0}]};}
function vertical(mode:'vertical-rl'|'vertical-lr'='vertical-rl'){
 const d=horizontal();d.paragraphs[0].writingMode=mode;d.lines[0].baselineAxis='x';d.lines[0].baseline=60;
 Object.assign(d.glyphs[0],{x:50,y:20,advanceX:0,advanceY:20});return d;
}
function path(d:TextLayoutData):PathData {const g=d.glyphs[0];return {schema:'frameweave.path',version:1,id:'outline',coordinates:{...d.coordinates},fillRule:'nonzero',commands:[{op:'M',point:{id:'a',x:g.x,y:g.y}},{op:'L',point:{id:'b',x:g.x+8,y:g.y}},{op:'L',point:{id:'c',x:g.x+8,y:g.y+3}},{op:'L',point:{id:'d',x:g.x,y:g.y+3}},{op:'Z'}]};}
function shaped(layout:TextLayoutData):ShapedRun{return {layout,glyphPaths:[{glyphIndex:0,path:path(layout)}],fontInstance:{source:layout.fonts[0].source,faceIndex:0,variations:{},normalizedCoordinates:[]},diagnostics:[]};}

test('old horizontal normalized bytes/hash are identical to the captured pre-change validator',()=>{
 const source=horizontal(),value=graphics.validateTextLayoutData(source);
 assert.equal(createHash('sha256').update(JSON.stringify(value)).digest('hex'),'dd2186312a4aa97c0b0c52fabc3d969aef8321ae4de777a1146a845f218fdf4f');
 assert.deepEqual(value,source);assert.ok(!Object.hasOwn(value.paragraphs[0],'writingMode'));assert.ok(!Object.hasOwn(value.lines[0],'baselineAxis'));assert.ok(!Object.hasOwn(value.glyphs[0],'orientation'));
});
test('real original-library CJK vertical substitutions and sideways Latin examples now pass without losing data',async()=>{
 const proof=JSON.parse(await readFile('docs/pro-animation/font-execution-validation/vertical-examples.json','utf8'));
 assert.equal(proof.cases.length,2);for(const c of proof.cases){
  const source=structuredClone(c.candidate);assert.deepEqual(graphics.validateTextLayoutData(source),source);
  assert.equal(source.paragraphs[0].direction,'ltr');assert.equal(source.paragraphs[0].writingMode,'vertical-rl');
  assert.ok(source.glyphs.every((g:{advanceX:number;advanceY:number})=>g.advanceX===0&&g.advanceY>0));
 }
 assert.notDeepEqual(proof.cases[0].vertical.glyphs.map((g:{glyphId:number})=>g.glyphId),proof.cases[0].horizontal.glyphs.map((g:{glyphId:number})=>g.glyphId),'actual vertical punctuation substitution must remain in the fixture');
});
test('both vertical block directions and omitted axis have explicit geometry semantics',()=>{
 for(const mode of ['vertical-rl','vertical-lr'] as const){
  const d=vertical(mode);delete d.lines[0].baselineAxis;const before=structuredClone(d),g=graphics.createTextLayoutGeometry(d);
  assert.deepEqual(g.lineAxes('l'),{writingMode:mode,baselineAxis:'x',inlineAxis:'y',baseline:60,blockProgression:mode==='vertical-rl'?-1:1});
  assert.deepEqual(g.glyphAnchor(0),[60,20]);assert.deepEqual(d,before);
 }
});
test('Bidi direction is independent from writing mode and zero advance is valid for marks',()=>{
 const d=vertical();d.paragraphs[0].direction='rtl';d.glyphs[0].advanceY=0;
 assert.deepEqual(graphics.validateTextLayoutData(d),d);assert.deepEqual(graphics.createTextLayoutGeometry(d).glyphAnchor(0),[60,20]);
});
test('inconsistent axes, invalid modes, horizontal sideways glyphs and malformed orientations are rejected',()=>{
 const cases:unknown[]=[];let d=vertical();d.lines[0].baselineAxis='y';cases.push(d);
 d=horizontal();d.lines[0].baselineAxis='x';cases.push(d);
 d=horizontal();d.glyphs[0].orientation='sideways-right';cases.push(d);
 cases.push({...vertical(),paragraphs:[{...vertical().paragraphs[0],writingMode:'sideways'}]});
 cases.push({...vertical(),glyphs:[{...vertical().glyphs[0],orientation:90}]});
 for(const value of cases)assert.throws(()=>graphics.validateTextLayoutData(value),{code:'E_GRAPHICS_DATA'});
});
test('sideways rotates ink and curve controls exactly about glyph origin, without rotating metrics',()=>{
 for(const orientation of ['sideways-right','sideways-left'] as const){
  const d=vertical();d.glyphs[0].orientation=orientation;const original=structuredClone(d),geometry=graphics.createTextLayoutGeometry(d),source=path(d),out=geometry.orientGlyphPath(0,source),point=out.commands[1];
  assert.notEqual(point.op,'Z');if(point.op==='Z')throw Error('point');assert.deepEqual(point.point,{id:'b',x:50,y:orientation==='sideways-right'?28:12});
  const curve={...source,commands:[source.commands[0],{op:'C' as const,control1:{id:'e',x:52,y:21},control2:{id:'f',x:54,y:22},point:{id:'z',x:58,y:23}}]};
  const rotated=geometry.orientGlyphPath(0,curve).commands[1];assert.equal(rotated.op,'C');if(rotated.op==='C')assert.equal(rotated.control1.x,orientation==='sideways-right'?49:51);
  assert.deepEqual(d,original);assert.deepEqual(source,path(d));assert.equal(out.commands.length,source.commands.length);
 }
});
test('glyph animation uses the vertical baseline anchor and applies orientation once',()=>{
 const d=vertical();d.glyphs[0].orientation='sideways-right';const run=shaped(d),animator=createGlyphAnimator(graphics,run);
 assert.deepEqual(animator.units()[0].anchor,[60,20]);
 const a=animator.animate({},context),b=animator.animate({},context);
 assert.deepEqual(a,b);assert.deepEqual(a.glyphs[0].path,graphics.createTextLayoutGeometry(d).orientGlyphPath(0,run.glyphPaths[0].path));
});
test('Bidi adapter preserves paragraph mode, baseline axis and orientation when extracting local runs',()=>{
 const d=vertical();d.text='A';d.paragraphs[0].end=d.lines[0].end=1;d.layout.engine='unicode-bidi+harfrust';d.glyphs[0].orientation='sideways-right';const run=shaped(d);
 const source={...run,runs:[{text:'A',fontId:'font',item:{start:0,end:1,direction:'ltr'},sourceUnits:[0],globalGlyphIndices:[0],localClusters:[{start:0,end:1}]}],fontInstances:[{...run.fontInstance,fontId:'font'}]} as unknown as Parameters<typeof createBidiAnimator>[1];
 const animator=createBidiAnimator(graphics,source);assert.deepEqual(animator.units()[0].anchor,[60,20]);
 const frame=animator.animate({},context);assert.deepEqual(frame.sourceLayout,d);assert.deepEqual(frame.glyphs[0].path,graphics.createTextLayoutGeometry(d).orientGlyphPath(0,run.glyphPaths[0].path));
});
test('actual mesh preparation consumes oriented geometry before tessellation',async()=>{
 const d=vertical();d.glyphs[0].orientation='sideways-right';let observed:PathData|undefined;
 // An already canonical rectangle needs no Boolean changes. This records the
 // preparation boundary; real Clipper2/font qualification remains separate.
 const operations={async *booleanPathsStream(paths:PathData[]){observed=paths[0];yield paths[0];}} as unknown as Parameters<typeof prepareGlyphMeshes>[1]['pathOperations'];
 const prepared=await prepareGlyphMeshes(shaped(d),{pathOperations:operations});
 assert.deepEqual(observed,graphics.createTextLayoutGeometry(d).orientGlyphPath(0,path(d)));assert.equal(prepared.preparation.triangles,2);
 assert.deepEqual([Math.min(...prepared.positions.filter((_,i)=>i%3===0)),Math.max(...prepared.positions.filter((_,i)=>i%3===0))],[47,50]);
});
test('horizontal-only paragraph consumers reject vertical data rather than dropping metadata',()=>{
 assert.throws(()=>createParagraphIndex({layout:vertical()} as unknown as Parameters<typeof createParagraphIndex>[0]),{code:'E_GRAPHICS_WRITING_MODE'});
 assert.doesNotThrow(()=>graphics.assertHorizontalTextLayout(horizontal(),'fixture'));
});
