import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {nativeMediaEnvironment} from '../modules/native-gpu/media-environment.ts';
import {nativeOwnerEnvironment} from '../modules/native-gpu/executable.ts';
import {inspectExr,readExr} from '../src/media/ocio.ts';
import {prepareNativeMediaExport} from '../modules/native-gpu/media-export.ts';
import {linear709,pq2020} from '../src/media/surface.ts';

test('media runtime discovery preserves explicit overrides and never mutates caller environment',()=>{
  const explicit={FRAMEWEAVE_MEDIA_RUNTIME:'missing-reviewed-runtime',PATH:'preserved'};
  assert.equal(nativeMediaEnvironment(explicit),explicit);
  const env={PATH:'preserved'};
  const selected=nativeMediaEnvironment(env);
  assert.equal(selected.PATH,'preserved');
  assert.deepEqual(env,{PATH:'preserved'});
});

test('combined owner discovery preserves both explicit Servo and media overrides',()=>{
  const env={FRAMEWEAVE_SERVO_RUNTIME:'reviewed-servo',FRAMEWEAVE_MEDIA_RUNTIME:'reviewed-media',PATH:'preserved'};
  assert.equal(nativeMediaEnvironment(nativeOwnerEnvironment(env)),env);
  const original={PATH:'preserved'};
  const selected=nativeMediaEnvironment(nativeOwnerEnvironment(original));
  assert.equal(selected.PATH,original.PATH);
  assert.deepEqual(original,{PATH:'preserved'});
});

test('selected EXR cancellation and EXR-specific missing-runtime errors survive managed discovery',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(readExr('not-opened.exr',{color:linear709,alpha:'opaque',signal:controller.signal}),{code:'E_RENDER_CANCELLED'});
  const old=process.env.FRAMEWEAVE_MEDIA_PYTHON;
  process.env.FRAMEWEAVE_MEDIA_PYTHON='missing-frameweave-exr-environment/python.exe';
  try{await assert.rejects(inspectExr(fileURLToPath(new URL('../package.json',import.meta.url))),{code:'E_MEDIA_EXR_UNAVAILABLE'});}
  finally{if(old===undefined)delete process.env.FRAMEWEAVE_MEDIA_PYTHON;else process.env.FRAMEWEAVE_MEDIA_PYTHON=old;}
});

test('GPU OCIO preparation uses the shared managed-Python locator and rejects a bad override',async()=>{
  const old=process.env.FRAMEWEAVE_MEDIA_PYTHON;
  process.env.FRAMEWEAVE_MEDIA_PYTHON='missing-frameweave-ocio-environment/python.exe';
  try{
    await assert.rejects(prepareNativeMediaExport('unused.hevc',linear709,{
      preset:'hdr10',width:320,height:180,fps:{num:24,den:1},encoder:'hevc_nvenc',outputColor:pq2020,
      alpha:{mode:'flatten',matte:[0,0,0]},conversion:{kind:'ocio',clip:true,transform:{
        source:'Linear Rec.709 (sRGB)',display:'Rec.2100-PQ - Display',view:'ACES 2.0 - HDR 1000 nits (Rec.2020)',
      }},
      hdr10:{masteringDisplay:{red:[.708,.292],green:[.17,.797],blue:[.131,.046],white:[.3127,.329],
        minNits:.005,maxNits:1000},maxCLL:1000,maxFALL:400},
    }),{code:'E_MEDIA_OCIO_UNAVAILABLE',message:'The configured media Python executable is missing'});
  }finally{if(old===undefined)delete process.env.FRAMEWEAVE_MEDIA_PYTHON;else process.env.FRAMEWEAVE_MEDIA_PYTHON=old;}
});
