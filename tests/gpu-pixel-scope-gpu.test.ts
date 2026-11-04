import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {surfaceFromPixels,pixelsFromSurface,acescg,srgb,toHalf,fromHalf,type ProfessionalSurface} from '../src/media/surface.ts';
import {blur,glow} from './fixtures/gpu-float-pass-cpu-reference.ts';
import {writeExr,readExr} from '../src/media/ocio.ts';

const hash=(p:Float32Array)=>createHash('sha256').update(new Uint8Array(p.buffer,p.byteOffset,p.byteLength)).digest('hex');
function reference(w:number,h:number,frame:number,format:'rgba16float'|'rgba32float'){
 const p=new Float32Array(w*h*4),b=new Float32Array(p.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,a=[0,.125,.5,.875,1][(x+y)%5],v=((13*x+7*y+3*frame)%29-10)*.25;p.set(a===0?[2,-1,.5,0]:[v*a,(v*.5+1)*a,(2-v*.25)*a,a],i);b.set([.25,.5,2,.5],i);}
 const s=surfaceFromPixels(w,h,p,{format,alpha:'premultiplied',color:acescg,deferBase64:true}),background=pixelsFromSurface(surfaceFromPixels(w,h,b,{format,alpha:'premultiplied',color:acescg,deferBase64:true}));
 const v=pixelsFromSurface(glow(blur(s,{radius:.7,boundary:'clamp',format}),{radius:.7,boundary:'transparent',threshold:.25,intensity:.8,format}));
 for(let i=0;i<v.length;i+=4){const a=v[i+3];for(let c=0;c<4;c++)v[i+c]=v[i+c]+background[i+c]*(1-a);}
 return pixelsFromSurface(surfaceFromPixels(w,h,v,{format,alpha:'premultiplied',color:acescg,deferBase64:true}));
}
test('resident GPU scope: real TSX, F16/F32 blur/glow/over, random frames, fixed ABI and lifecycle',{timeout:180000},async()=>{
 const parent=join(engineRoot,'artifacts/gpu-resident');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'v1-'));process.env.FRAMEWEAVE_HOME=join(dir,'user-home');
 const width=32,height=18,entry=join(dir,'project.tsx');await writeFile(entry,`import {Composition,Stage} from '@frameweave/engine';export default <Composition width={${width}} height={${height}} fps={24} durationInFrames={120}><Stage id="pixels" entry={${JSON.stringify(join(engineRoot,'tests/fixtures/gpu-pixel-scope-stage.ts'))}} outputs={{surface:'surface',stats:'json'}} props={{mode:'resident'}} /></Composition>;`);
 const started=performance.now(),build=await buildProject(entry,{outputDir:join(dir,'build')}),report:any={version:1,sampler:'gpu-resident-v1',width,height,rows:[],allPassed:false};
 const policy={preview:true,cache:false,allowWasm:false,media:{workingColor:acescg,transport:'buffer-v1' as const,preview:{color:srgb,clip:true}}};
 try{
  for(const format of ['rgba32float','rgba16float'] as const){build.manifest.stages[0].props={mode:'resident',format};const renderer=await Renderer.create(build,policy),hashes=new Map<number,string>();
   try{for(const frame of [2,0,1,2]){const t=performance.now(),result=await renderer.evaluateFrame(frame,'pixels'),out=result.stageOutputs.pixels,stats=out.stats as any,actual=pixelsFromSurface(out.surface as ProfessionalSurface),expected=reference(width,height,frame,format);let maxAbs=0,bad=0;for(let i=0;i<actual.length;i++){maxAbs=Math.max(maxAbs,Math.abs(actual[i]-expected[i]));if(actual[i]!==expected[i])bad++;}assert.ok(maxAbs<=(format==='rgba16float'?0:2e-6),JSON.stringify({format,frame,maxAbs,bad}));const digest=hash(actual);if(hashes.has(frame))assert.equal(digest,hashes.get(frame));hashes.set(frame,digest);assert.equal(stats.origin,'null');assert.equal(stats.core.backend,'webgpu');assert.equal(stats.core.backendInfo.isFallbackAdapter,false);assert.equal(stats.scope.readbacks,hashes.size===1&&frame===2?1:report.rows.filter((r:any)=>r.format===format).length+1);report.rows.push({format,frame,maxAbs,differentComponents:bad,hash:digest,evaluateMs:performance.now()-t,stats});}
    // Actual renderer PNG, decoded independently. Not a screenshot substitute.
    const png=await renderer.renderFrame(1,'pixels');const sharp=(await import('sharp')).default,meta=await sharp(png.png).metadata();assert.equal(meta.width,width);assert.equal(meta.height,height);await writeFile(join(dir,format+'.png'),png.png);
    const surface=png.stageOutputs.pixels.surface as ProfessionalSurface,exr=join(dir,format+'.exr');await writeExr(surface,exr,format);const decoded=await readExr(exr);assert.equal(hash(pixelsFromSurface(decoded.surface)),hash(pixelsFromSurface(surface)));report.rows.push({format,media:'EXR decoded exact',file:exr});
   }finally{await renderer.close();await renderer.close();}
  }
  build.manifest.stages[0].props={mode:'checks'};const renderer=await Renderer.create(build,policy);
  try{
   const result=await renderer.evaluateFrame(0,'pixels'),stats=result.stageOutputs.pixels.stats as any;
   for(const row of stats.rows)assert.equal(row.code,row.expected,JSON.stringify(row));
   for(const s of [stats.first,stats.failed]){assert.equal(s.liveBytes,0);assert.equal(s.activeImages,0);assert.equal(s.buffersCreated,s.buffersDestroyed);assert.equal(s.disposed,true);}
   const inputs=new Float32Array(Uint32Array.from(stats.halfInputBits).buffer),expected=Float32Array.from(inputs,v=>fromHalf(toHalf(v)));
   assert.deepEqual(stats.halfOutputBits,Array.from(new Uint32Array(expected.buffer)),'Half RNE ties, subnormals and signed zero');
   assert.equal(stats.uploadOrdering,true);assert.equal(stats.failed.failed,true);assert.deepEqual(stats.generatedPixels,[-2,4,.5,0]);assert.equal(stats.origin,'null');assert.equal(stats.evalBlocked,true);report.lifecycle=stats;
  }finally{await renderer.close();}
  report.allPassed=true;
 }finally{report.totalWallMs=performance.now()-started;await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:join(dir,'report.json'),allPassed:report.allPassed,totalWallMs:report.totalWallMs}));}
});
