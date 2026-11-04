import assert from 'node:assert/strict';
import test from 'node:test';
import {layoutSize,projectionSize,kernelTable,workBudget,work,controls} from '../modules/native-effects/spherical/control.ts';
import {ray,sample,neighborhood,cubeTexel,type Image} from '../modules/native-effects/spherical/reference.ts';
import {keyframes} from '../src/core/animation.ts';
import type {FrameContext} from '../src/core/types.ts';
test('eye rectangles and cube faces use exact dimensions and fail malformed layouts',()=>{assert.deepEqual(layoutSize(18,5,'side-by-side'),{width:9,height:5,eyes:2});assert.throws(()=>layoutSize(17,5,'side-by-side'),{code:'E_NATIVE_FILTER_PARAMETER'});assert.throws(()=>projectionSize(13,8,'cube-3x2'),{code:'E_NATIVE_FILTER_PARAMETER'});projectionSize(12,8,'cube-3x2');});
test('work admission is caller adjustable, not an image-size ceiling',()=>{assert.throws(()=>work(5000,workBudget(undefined)),{code:'E_NATIVE_SPHERICAL_BUDGET'});work(5000,workBudget(10000));assert.throws(()=>workBudget(0));assert.throws(()=>kernelTable([1,2],4));});
test('positive spherical Gaussian weights normalize independently of image size',()=>{for(const radius of [[0,0],[1,2],[180,180]]){const data=kernelTable(radius,5);let total=0;for(let j=6;j<data.length;j+=8)total+=data[j]+data[j+1];assert.ok(Math.abs(total-1)<1e-12);assert.ok(data.every(Number.isFinite));}});
test('cube atlas canonical face centres obey documented OpenGL directions',()=>{const axes=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];for(let j=0;j<6;j++)assert.deepEqual(ray((j%3+.5)/3,(Math.floor(j/3)+.5)/2,'cube-3x2',[2*Math.PI,Math.PI])?.map(v=>v===0?0:v),axes[j]);});
test('full-sphere filtering retains signed HDR and isolates stereo eyes',()=>{const data=Float32Array.from({length:18*5*4},(_,j)=>{const x=Math.floor(j/4)%18;return j%4===3?1:j%4===1?-.3:x<9?2:7;}),image:Image={data,width:18,height:5,layout:'side-by-side',projection:'equirectangular',fov:[2*Math.PI,Math.PI]},out=neighborhood(image,{radiusDegrees:[40,40],kernelSize:3});for(let j=0;j<out.length;j++){const x=Math.floor(j/4)%18,expected=j%4===3?1:j%4===1?-.3:x<9?2:7;assert.ok(Math.abs(out[j]-expected)<2e-8);}});
test('odd-width pole sampling interpolates half-turn longitude without truncation',()=>{const image:Image={data:Float32Array.from({length:5*3*4},(_,j)=>j%4===3?1:Math.floor(j/4)%5),width:5,height:3,layout:'mono',projection:'equirectangular',fov:[2*Math.PI,Math.PI]},a=sample(image,[0,1,0],0);assert.ok(a.every(Number.isFinite));assert.ok(a[0]>0&&a[0]<4);});
test('nested scalar keyframes reuse existing animation with random-order frames',()=>{const v=keyframes([{frame:0,value:2},{frame:8,value:6}]);for(const frame of [8,0,4,0]){const context:FrameContext={frame,globalFrame:frame,time:frame/24,globalTime:frame/24,dt:1/24,progress:frame/8,fps:{num:24,den:1},durationInFrames:9,seed:1},p=controls('sphere-test',context,undefined);assert.equal(p.point([v,10],[0,0],'radius')[0],2+frame*.5);}assert.throws(()=>controls('sphere-test',undefined,undefined).point([v,10],[0,0],'radius'),{code:'E_NATIVE_FILTER_PARAMETER'});});

test('pole longitude is canonical for exact geodesic meridian crossings',()=>{
 const image:Image={data:Float32Array.from({length:17*9*4},(_,j)=>j%4===3?1:Math.floor(j/4)%17),width:17,height:9,layout:'mono',projection:'equirectangular',fov:[2*Math.PI,Math.PI]};
 for(const y of [-1,1]){const expected=sample(image,[0,y,0],0);for(const longitude of [-3,-1,0,2,3]){const residual=2**-48,actual=sample(image,[Math.sin(longitude)*residual,y,Math.cos(longitude)*residual],0);assert.deepEqual(actual,expected);}}
 const result=neighborhood(image,{radiusDegrees:[15,10],kernelSize:3,noiseLevel:.2},'random');assert.ok(result.every(Number.isFinite));
});

test('cube cross-face taps use exact rational nearest-pixel boundaries',()=>{
 assert.deepEqual(cubeTexel(0,-1,0,3),{face:4,x:2,y:0});
 assert.deepEqual(cubeTexel(0,3,2,3),{face:5,x:0,y:2});
 for(const n of [1,3,4,17,32768])for(let face=0;face<6;face++)for(const x of [-1,0,n-1,n])for(const y of [-1,0,n-1,n]){const q=cubeTexel(face,x,y,n);assert.ok(q.face>=0&&q.face<6&&q.x>=0&&q.x<n&&q.y>=0&&q.y<n);if(x>=0&&x<n&&y>=0&&y<n)assert.deepEqual(q,{face,x,y});}
});
