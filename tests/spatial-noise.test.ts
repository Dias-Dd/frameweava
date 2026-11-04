import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createNoise,type NoiseAlgorithm} from '../modules/spatial-effects/src/noise.ts';
import {createFeedbackParticles} from '../modules/spatial-effects/src/simulation.ts';
import {compareFloatImages} from '../modules/spatial-effects/validation/precision.ts';
const near=(a:number,b:number,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('byte-preserved FastNoiseLite sources and only vector export adapter are audited',async()=>{
  const dir='modules/spatial-effects/vendor/fastnoise-lite/',metadata=JSON.parse(await readFile(dir+'SOURCE.json','utf8'));
  assert.equal(metadata.commit,'7ccfbc16eb1c932568f177d63a9ba51d89bbe516');for(const f of metadata.files)assert.equal(createHash('sha256').update(await readFile(dir+f.local)).digest('hex'),f.sha256);
  const upstream=await readFile(dir+'FastNoiseLite.upstream.js'),adapted=await readFile(dir+'FastNoiseLite.js');assert.deepEqual(adapted.subarray(0,upstream.length),upstream);assert.match(adapted.subarray(upstream.length).toString(),/^\n\/\/ Frameweave adapter: export upstream vector classes; kernel bytes above are unchanged\.\nexport \{Vector2,Vector3\};\n$/);
});
test('2D/3D algorithms, fractals and true domain warp execute deterministically without mutating arguments',()=>{
  for(const algorithm of ['openSimplex2','openSimplex2S','cellular','perlin','valueCubic','value'] as NoiseAlgorithm[])for(const kind of ['none','fbm','ridged','pingPong'] as const){
    const o={seed:-51,algorithm,frequency:.73,fractal:{kind,octaves:4}},n=createNoise(o),p:[number,number,number]=[.13,-2.17,3.81],a=n.sample2([p[0],p[1]]),b=n.sample3(p);assert.ok(Number.isFinite(a)&&Number.isFinite(b));assert.equal(n.sample3(p),b);assert.equal(createNoise(o).sample2([p[0],p[1]]),a);assert.deepEqual(p,[.13,-2.17,3.81]);
  }
  for(const kind of ['openSimplex2','openSimplex2Reduced','basicGrid'] as const)for(const mode of ['single','progressive','independent'] as const){const n=createNoise({frequency:.3,warp:{kind,mode,amplitude:2,octaves:4}}),p:[number,number,number]=[.41,2.31,-1.17];assert.notDeepEqual(n.warp3(p),p);assert.notDeepEqual(n.warp2([p[0],p[1]]),p.slice(0,2));assert.deepEqual(n.warp3(p),createNoise(n.settings).warp3(p));}
});
test('curl is the unnormalised derivative of scalar/vector potentials, with small discrete divergence',()=>{
  const n=createNoise({seed:71,frequency:.4,algorithm:'perlin',fractal:{kind:'fbm',octaves:3}}),p:[number,number,number]=[.71,-1.19,2.2],h=.003;
  const xy=n.curl2([p[0],p[1]],h);near(xy[0],(n.sample2([p[0],p[1]+h])-n.sample2([p[0],p[1]-h]))/(2*h));
  const div2=(n.curl2([p[0]+h,p[1]],h)[0]-n.curl2([p[0]-h,p[1]],h)[0]+n.curl2([p[0],p[1]+h],h)[1]-n.curl2([p[0],p[1]-h],h)[1])/(2*h);near(div2,0,1e-10);
  let div3=0;for(let axis=0;axis<3;axis++){const plus=[...p] as typeof p,minus=[...p] as typeof p;plus[axis]+=h;minus[axis]-=h;div3+=(n.curl3(plus,h)[axis]-n.curl3(minus,h)[axis])/(2*h);}near(div3,0,1e-10);assert.ok(Math.hypot(...n.curl3(p,h))>0);
});
test('parameters, cloned settings, lattice range and configurable octave budget are explicit',()=>{
  assert.throws(()=>createNoise({frequency:NaN}),{code:'E_SPATIAL_PARAMETER'});assert.throws(()=>createNoise({algorithm:'fake'} as any),{code:'E_SPATIAL_PARAMETER'});assert.throws(()=>createNoise({warpp:{}} as any),{code:'E_SPATIAL_PARAMETER'});
  assert.throws(()=>createNoise({fractal:{octaves:33}}),{code:'E_SPATIAL_NOISE_BUDGET'});assert.ok(Number.isFinite(createNoise({maxOctaves:40,fractal:{kind:'fbm',octaves:33,lacunarity:1}}).sample2([1,2])));
  assert.throws(()=>createNoise({frequency:1e30}).sample3([1,2,3]),{code:'E_SPATIAL_NOISE_RANGE'});assert.throws(()=>createNoise().curl2([1,2],1e-300),{code:'E_SPATIAL_NOISE_RANGE'});
  const n=createNoise(),s=n.settings;s.frequency=100;assert.equal(n.settings.frequency,.01);assert.equal(createNoise({seed:-1}).sample2([1,2]),createNoise({seed:4294967295}).sample2([1,2]));
});
test('advected curl force uses absolute fixed-step time and recovers across seek/reopen',()=>{
  const o={fps:12,seed:51,rate:4,lifetime:3,substeps:2,origin:[0,0,0] as [number,number,number],velocity:[.2,0,0] as [number,number,number],forces:[{kind:'curl' as const,noise:{frequency:.8,algorithm:'perlin' as const},motion:[0,0,.2] as [number,number,number],strength:.8}]},a=createFeedbackParticles(o),ctx=(frame:number)=>({frame,time:frame/12,globalFrame:frame,globalTime:frame/12,dt:1/12,seed:51,fps:{num:12,den:1},durationInFrames:25,progress:frame/24});
  const expected=a.sample(ctx(24));assert.notEqual(expected.particles[0].position[1],0);for(const f of [0,12,3,24,24])a.sample(ctx(f));assert.deepEqual(a.sample(ctx(24)),expected);assert.deepEqual(createFeedbackParticles(o).sample(ctx(24)),expected);
});
test('numerical image gate preserves raw values, demands exact alpha and records black/white visibility',()=>{
  const reference=new Float32Array([2,-4,0,.5]),oneUlp=new Float32Array([2+2**-22,-4-2**-21,0,.5]),before=oneUlp.slice(),small=compareFloatImages(oneUlp,reference);assert.ok(small.accepted&&small.changed===2&&small.alphaChanged===0);assert.equal(small.maximumRgbError,2**-21);assert.equal(small.blackError,small.whiteError);assert.deepEqual(oneUlp,before);
  assert.equal(compareFloatImages(new Float32Array([2,-4,0,.50000006]),reference).accepted,false);assert.equal(compareFloatImages(new Float32Array([2.001,-4,0,.5]),reference).accepted,false);
});
