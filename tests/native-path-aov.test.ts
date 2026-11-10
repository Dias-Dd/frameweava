import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {mediaPython} from '../src/media/python.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pathAovChannels,writePathAovExr} from '../modules/native-gpu/path-aov.ts';

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('path transport AOVs reconstruct raw Beauty and write independently readable multichannel EXR', {
  skip: executable ? false : 'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
  const root=resolve('.frameweave/scene3d');
  await mkdir(root,{recursive:true});
  const dir=await mkdtemp(join(root,'path-aov-'));
  const entry=join(dir,'project.tsx');
  await writeFile(entry,`
import {BoxGeometry} from 'three';
import {Composition,Layer,Stage,ref} from '@frameweave/engine';
import {createNativePathTracer,defineNativeStage,type NativeScene3D,type SceneTransform} from '@frameweave/engine/native';
const box=new BoxGeometry(),p=box.getAttribute('position');
const mesh={restPositions:Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)] as [number,number,number]),indices:Array.from(box.index!.array)};
box.dispose();
const pose=(x:number):SceneTransform=>[.9,0,0,x,0,.9,0,0,0,0,.2,0];
const names=['diffuse','specular','transmit','emitter','under-fog'] as const;
const scene:NativeScene3D={
 geometries:{mesh},
 materials:{
  diffuse:{kind:'diffuse',color:[.5,.6,.7]},
  specular:{kind:'metal',color:[1,.7,.5],roughness:0},
  transmit:{kind:'dielectric',ior:1,absorption:[.05,.05,.05]},
  emitter:{kind:'emissive',radiance:[3,4,5]},
  'under-fog':{kind:'diffuse',color:[.4,.6,.7]},
 },
 nodes:names.map((material,i)=>({id:material,material,geometry:'mesh',transform:pose(i*2-4)})),
 volumes:[{bounds:{min:[3.4,-1,.5],max:[4.6,1,2]},extinction:.8,albedo:[.75,.75,.75]}],
 environment:{lower:[1.5,1,1],upper:[1.5,1,1]},
 sun:{direction:[0,0,1],radiance:[.5,.5,.5]},
 sample({frame}){
  const x=frame*.1;
  return {camera:{projection:'orthographic',position:[x,0,4],target:[x,0,0],near:.1,far:9,viewHeight:1.5}};
 },
};
export const shot=defineNativeStage(init=>createNativePathTracer(init,scene,{samples:16,maxBounces:4,aovs:true,cryptomatte:true,motionVectors:true}));
export default <Composition width={96} height={12} fps={24} durationInFrames={2}>
 <Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
  const build=await buildProject(entry);
  const renderer=await Renderer.create(build,{nativeGpu:{
    executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
  }});
  const file=join(dir,'beauty-and-passes.exr');
  try {
    let first:Float32Array|undefined;
    for (const frame of [1,0,1]) {
      const ticket=await renderer.submitNativeFrame(frame);
      await ticket.completed;
      const transport=(await renderer.exportNativeBuffer(ticket,'shot/path-transport')).values as Float32Array;
      const guide=(await renderer.exportNativeBuffer(ticket,'shot/path-guide')).values as Float32Array;
      const cryptomatte=await renderer.exportNativeBuffer(ticket,'shot/path-cryptomatte');
      const motion=await renderer.exportNativeBuffer(ticket,'shot/path-motion');
      const surface=(await renderer.exportNativeBuffer(ticket,'frameweave.final-surface')).values as Float32Array;
      const channels=pathAovChannels({width:96,height:12,transport,guide,cryptomatte,motion}).channels;
      assert.doesNotThrow(()=>pathAovChannels({width:96,height:12,transport,guide},1));
      let maxError=0,edges=0;
      const objectCoverage=channels['CryptoObject00.G'],materialCoverage=channels['CryptoMaterial00.G'];
      assert.deepEqual(objectCoverage,materialCoverage);
      for(let i=0;i<objectCoverage.length;i++) {
        const coverage=objectCoverage[i];
        assert.ok(coverage>=0&&coverage<=1&&Number.isInteger(coverage*16));
        if(coverage>0&&coverage<1)edges++;
      }
      assert.ok(edges>30,'expected subpixel camera coverage on actual object edges');
      for(let pixel=0;pixel<96*12;pixel++)for(let c=0;c<3;c++){
        const at=pixel*18;
        const layers=transport[at+3+c]+transport[at+6+c]+transport[at+9+c]+transport[at+12+c]+transport[at+15+c];
        maxError=Math.max(maxError,Math.abs(layers-transport[at+c]));
        assert.equal(transport[at+c],surface[pixel*4+c]);
      }
      assert.ok(maxError<=1e-6,String(maxError));
      for (let i=0;i<5;i++) {
        const center=6*96+16+i*16;
        assert.equal(channels.ObjectID[center],i);
        assert.equal(objectCoverage[center],1);
        if(frame===0)assert.equal(channels['Motion.Valid'][center],0);
        else {
          assert.equal(channels['Motion.Valid'][center],1);
          assert.ok(Math.abs(channels['Motion.X'][center]-.8)<.00001);
          assert.ok(Math.abs(channels['Motion.Y'][center])<.00001);
        }
        assert.ok(Math.abs(channels.Depth[center]-3.8)<.00001);
        assert.equal(channels['Normal.Z'][center],1);
        assert.ok(transport[center*18+3+i*3]>.01);
      }
      if(frame===1){if(first)assert.deepEqual(transport,first);first=transport;}
      if(frame===0) {
        const receipt=await writePathAovExr(file,{width:96,height:12,transport,guide,cryptomatte,motion});
        assert.equal(receipt.channels,39);
        const loaded=execFileSync(mediaPython('E_AOV_IO_UNAVAILABLE'),['-c',`
import json,sys,numpy as np,OpenEXR
with OpenEXR.File(sys.argv[1],separate_channels=True) as f:
 c=f.channels()
 assert c['ObjectID'].pixels.dtype==np.uint32
 assert c['Normal.Z'].pixels.dtype==np.float32
 assert np.max(c['Beauty.R'].pixels)>2
 header=f.header()
 object_key=next(k[:-4] for k in header if k.startswith('cryptomatte/') and k.endswith('name') and header[k]=='CryptoObject')
 assert header[object_key+'hash']=='MurmurHash3_32' and header[object_key+'conversion']=='uint32_to_float32'
 names=json.loads(header[object_key+'manifest'])
 bits=c['CryptoObject00.R'].pixels.view(np.uint32)
 assert bits[6,16]==int(names['diffuse'],16)
 assert c['CryptoObject00.G'].pixels[6,16]==1
 assert bits[0,0]==0
 assert np.count_nonzero((c['CryptoObject00.G'].pixels>0)&(c['CryptoObject00.G'].pixels<1))>30
 assert np.allclose(c['Beauty.R'].pixels,sum(c[n+'.R'].pixels for n in ('Diffuse','Specular','Transmission','Emission','Volume')),rtol=0,atol=1e-6)
 print(json.dumps({'channels':sorted(c),'metadata':json.loads(f.header()['frameweavePathAov'])}))
`,file],{encoding:'utf8',windowsHide:true});
        console.log(JSON.stringify({file,maxError,edges,...JSON.parse(loaded)}));
      }
    }
  }finally{await renderer.close();}
});
