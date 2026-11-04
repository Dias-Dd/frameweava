/**
 * AFTERLIGHT / 余晖 — an original motion poem.
 * 1920 × 1080 · 30000/1001 fps · 1798 frames / 59.993266… seconds.
 *
 * Direction: one incision of light becomes folded silk, briefly leaves its
 * impression on warm paper, and withdraws. Unequal phrases and a single climax.
 * Existing Native mesh/noise/particle/image libraries carry the main image.
 * Custom WGSL is limited to original typography and the final editorial fade.
 * No Servo, external images, fonts, audio samples or remote resources.
 * Source-checkout project, using its sibling native-image-effects@0.4.0 lock.
 * AUTHORED ONLY: no compile, test, preview, render or listening was performed.
 */
import {Composition,Stage,Layer,ref,keyframes,linear709} from '@frameweave/engine';
import type {FrameContext} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {defineAudioStage,audioBlock,frameToSample} from '@frameweave/engine/audio';
import {processImage,processRaster,processPa} from 'native-image-effects';
import {Matrix4,OrthographicCamera,WebGPUCoordinateSystem} from 'three';
import {createNativeTransitions} from '../../modules/pro-animation/src/native-transitions/index.ts';
import {createFeedbackParticles,createNativeParticleRenderer,createNativeNoiseTextureRenderer}
  from '../../modules/spatial-effects/native.ts';
import {morphPositions,twistPositions,bendPositions,wavePositions,ripplePositions,
  taperPositions,transformPositions} from '../../modules/mesh-deformation/index.ts';
import {withGpuResources} from '../../modules/gpu-effects/resource-arena.ts';

export const ART={
  width:1920,height:1080,fps:{num:30000,den:1001},frames:1798,seed:1927,
  // Scene-linear colors. Gold is warm and restrained; copper appears at the crest.
  paper:[.82,.755,.635],gold:[1.60,.80,.245],copper:[1.75,.295,.10],
  ink:[.0018,.0022,.0035],glowSigma:7.5,
};
export const SOUND={volume:.9,pad:.10,bass:.045,bells:.115,air:.006,crest:.032};

export const afterlight=defineNativeStage(async init=>{
  const gpu=init.gpu;
  const output={width:init.width,height:init.height,format:'rgba32float' as const,
    alpha:'opaque' as const,color:linear709};
  const transitions=createNativeTransitions(init);
  const camera=new OrthographicCamera(-3.2,3.2,1.8,-1.8,.01,24);
  camera.coordinateSystem=WebGPUCoordinateSystem;
  camera.position.set(0,0,7);camera.lookAt(0,0,0);
  camera.updateMatrixWorld();camera.updateProjectionMatrix();
  const matrix=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).toArray();
  const mist=await createNativeNoiseTextureRenderer(gpu,{
    width:init.width,height:init.height,workingColor:linear709,
    maxBufferBytes:512*1024*1024,maxSampleOperations:128000000,
  });
  const smooth=(a:number,b:number,t:number)=>{
    const x=Math.max(0,Math.min(1,(t-a)/(b-a)));
    return x*x*x*(x*(x*6-15)+10);
  };
  const mix=(a:number,b:number,t:number)=>a+(b-a)*t;

  // The same five ribbons persist through the film. Every target shares index
  // order; animated interpolation, deformation and projection use existing APIs.
  const lanes=5,segments=96;
  const incision:number[]=[],silk:number[]=[],corolla:number[]=[],uv:number[]=[],index:number[]=[];
  for(let lane=0;lane<lanes;lane++){
    for(let i=0;i<=segments;i++){
      const fraction=i/segments,u=fraction*Math.PI*2;
      for(const side of [-1,1]){
        const width=.024+lane*.004;
        incision.push(.026*Math.sin(u)+lane*.003+side*width*.13,
          1.10*Math.cos(u),.12*Math.sin(u+lane*.16));
        const x=(fraction-.5)*4.9;
        silk.push(x,.30*Math.sin(u*.83+lane*.20)+(lane-2)*.11+side*width,
          .32*Math.cos(u*.9+lane*.23));
        const radius=.86+lane*.055+.25*Math.cos(u*3+lane*.18)+.075*Math.sin(u*7);
        corolla.push((radius+side*width)*Math.cos(u)*1.12,
          (radius+side*width)*Math.sin(u)*.88,.32*Math.sin(u*2+lane*.24));
        // Texture V follows ribbon width, so the library gradient models the fold.
        uv.push(fraction,side===-1?0:1);
      }
      if(i<segments){const v=lane*(segments+1)*2+i*2;index.push(v,v+2,v+1,v+1,v+2,v+3);}
    }
  }
  const descriptor={type:'f32' as const,dimensions:[incision.length/3,1,1] as [number,number,number],
    components:3 as const,semantic:'position' as const,space:'afterlight.fold',units:'meter'};
  const seed=await gpu.createField(descriptor,Float32Array.from(incision));
  const stream=await gpu.createField(descriptor,Float32Array.from(silk));
  const flower=await gpu.createField(descriptor,Float32Array.from(corolla));
  const uvs=await gpu.createField({type:'f32',dimensions:[uv.length/2,1,1],components:2,
    semantic:'generic',space:'afterlight.uv',units:'dimensionless'},Float32Array.from(uv));
  const indices=await gpu.createBuffer({type:'u32',length:index.length},Uint32Array.from(index));

  const simulation=createFeedbackParticles({
    fps:ART.fps,substeps:1,seed:ART.seed,rate:12,lifetime:6,startTime:13,duration:32,
    origin:[.45,.22,.2],positionJitter:[.55,.45,.25],
    velocity:[-.16,.13,0],velocityJitter:[.27,.20,.08],radius:.008,
    trailPoints:9,trailEverySteps:3,
    bursts:[{time:35.55,count:76},{time:36.35,count:28}],
    forces:[{kind:'vortex',center:[0,.22,0],axis:[0,0,1],strength:.12,softening:.7},
      {kind:'drag',coefficient:.22},{kind:'acceleration',value:[-.018,.016,0]}],
    budgets:{maxParticles:256,maxReplaySteps:2048,checkpointInterval:90,maxCheckpoints:8,
      maxValueBytes:32*1024*1024},
  });
  const particles=createNativeParticleRenderer(gpu,{
    width:init.width,height:init.height,format:'rgba32float',maxBufferBytes:256*1024*1024,
    camera:{projection:'orthographic',position:[0,0,7],target:[0,0,0],near:.01,far:24,viewHeight:3.6},
  });
  const palette='const IVORY:vec3f=vec3f('+ART.paper.map(x=>x.toFixed(6)).join(',')+');\n'+
    'fn segment(p:vec2f,a:vec2f,b:vec2f)->f32{let v=b-a;return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),1e-9),0.,1.));}\n';

  // Original monoline letterforms, embedded as editable line segments.
  // Each string is a polyline of x/y pairs on a 0..6 × 0..10 design grid.
  const glyphs:Record<string,string[]> = {
    A:['0,10 3,0 6,10','1,6 5,6'], B:['0,10 0,0 4,0 6,2 6,3 4,5 0,5','4,5 6,7 6,8 4,10 0,10'],
    C:['6,1 4,0 2,0 0,2 0,8 2,10 4,10 6,9'], D:['0,10 0,0 3,0 6,3 6,7 3,10 0,10'],
    E:['6,0 0,0 0,10 6,10','0,5 5,5'], F:['6,0 0,0 0,10','0,5 5,5'],
    G:['6,1 4,0 2,0 0,2 0,8 2,10 6,10 6,5 3,5'], H:['0,0 0,10','6,0 6,10','0,5 6,5'],
    I:['1,0 5,0','3,0 3,10','1,10 5,10'], J:['1,0 6,0 6,8 4,10 2,10 0,8'],
    K:['0,0 0,10','6,0 0,6','2.5,3.5 6,10'], L:['0,0 0,10 6,10'],
    M:['0,10 0,0 3,5 6,0 6,10'], N:['0,10 0,0 6,10 6,0'],
    O:['2,0 4,0 6,2 6,8 4,10 2,10 0,8 0,2 2,0'],
    P:['0,10 0,0 4,0 6,2 6,3 4,5 0,5'], Q:['2,0 4,0 6,2 6,8 4,10 2,10 0,8 0,2 2,0','3,7 6,10'],
    R:['0,10 0,0 4,0 6,2 6,3 4,5 0,5','3,5 6,10'],
    S:['6,1 4,0 2,0 0,2 0,3 2,5 4,5 6,7 6,8 4,10 2,10 0,9'],
    T:['0,0 6,0','3,0 3,10'], U:['0,0 0,8 2,10 4,10 6,8 6,0'],
    V:['0,0 3,10 6,0'], W:['0,0 1.5,10 3,5 4.5,10 6,0'],
    X:['0,0 6,10','6,0 0,10'], Y:['0,0 3,5 6,0','3,5 3,10'], Z:['0,0 6,0 0,10 6,10'],
    '0':['2,0 4,0 6,2 6,8 4,10 2,10 0,8 0,2 2,0'],
    '1':['1,2 3,0 3,10','1,10 5,10'], '2':['0,1 2,0 4,0 6,2 6,3 0,10 6,10'],
    '3':['0,0 6,0 3,5 6,7 6,8 4,10 0,10','2,5 3,5'],
    '4':['5,10 5,0 0,7 6,7'], '5':['6,0 0,0 0,5 4,5 6,7 6,8 4,10 0,10'],
    '6':['6,0 2,0 0,3 0,8 2,10 4,10 6,8 6,6 4,5 0,5'],
    '/':['0,10 6,0'], '-':['0,5 6,5'], '.':['3,9 3,10'],
  };
  const point = (p:string) => {
    const [x,y]=p.split(',').map(Number);return `vec2f(${(x/10).toFixed(4)},${(y/10).toFixed(4)})`;
  };
  const glyphCode = Object.entries(glyphs).map(([char,paths]) => {
    const strokes=paths.flatMap(path=>{
      const points=path.split(' ');
      return points.slice(1).map((p,i)=>`d=min(d,segment(q,${point(points[i])},${point(p)}));`);
    }).join('\n');
    return `case ${char.charCodeAt(0)}u:{${strokes}return d;}`;
  }).join('\n');
  // Typography appears only at the beginning and the coda. No chapter labels.
  const labels=['AFTER','LIGHT','A MOTION POEM','AFTERLIGHT','LIGHT LEAVES A SHAPE'];
  const textCode=labels.map((text,id)=>`
fn text${id}(uv:vec2f,center:vec2f,height:f32,tracking:f32,reveal:f32,stroke:f32)->f32{
  let aspect=f32(outputSize().x)/f32(outputSize().y);
  let advance=.6+tracking;let width=(f32(${text.length}u)-1.)*advance+.6;
  let q=(uv-vec2f(center.x*aspect-width*height*.5,center.y-height*.5))/height;
  if(q.x<-.05||q.x>width+.05||q.y<-.05||q.y>1.05){return 0.;}
  let slot=i32(floor((q.x+tracking*.5)/advance));
  if(slot<0||slot>=${text.length}){return 0.;}
  var letters=array<u32,${text.length}>(${[...text].map(c=>c.charCodeAt(0)+'u').join(',')});
  let index=u32(slot);let local=vec2f(q.x-f32(slot)*advance,q.y);
  let distance=glyph(letters[index],local);
  let aa=.9/(height*f32(outputSize().y));
  let ink=1.-smoothstep(max(0.,stroke-aa),stroke+aa,distance);
  return ink*smoothstep(f32(index)*.035,f32(index)*.035+.65,reveal);
}`).join('\n');
  const finish=await gpu.compile({abiVersion:1,id:'studio/afterlight/letterpress',version:'1.0.0',
    inputCount:1,parameterWords:1,code:palette+`
fn glyph(code:u32,q:vec2f)->f32{var d=100.;switch code{${glyphCode}\ndefault:{return d;}}}
${textCode}

fn soft(a:f32,b:f32,t:f32)->f32{let x=clamp((t-a)/(b-a),0.,1.);return x*x*(3.-2.*x);}
fn pixel(pixel:vec2u)->vec4f{
  let size=vec2f(outputSize());let uv=(vec2f(pixel)+.5)/size.y;
  let t=paramF32(0u);var color=max(read0(vec2i(pixel)).rgb,vec3f(0.));
  let titleIn=soft(3.5,5.5,t);let titleOut=1.-soft(8.3,10.0,t);
  let opening=titleIn*titleOut;
  let breath=(1.-titleIn)*.008;
  let a=text0(uv,vec2f(.233,.414+breath),.096,.43,t-3.4,.011);
  let b=text1(uv,vec2f(.233,.540+breath),.096,.43,t-3.8,.011);
  let note=text2(uv,vec2f(.233,.662),.014,.17,t-5.0,.025);
  color=mix(color,IVORY,(a+b)*opening*.93);
  color=mix(color,IVORY*.65,note*opening*.66);
  // A long silence precedes the closing title; the picture has room to recede.
  let ending=soft(51.4,54.3,t)*(1.-soft(57.5,59.7,t));
  let c=text3(uv,vec2f(.50,.492),.078,.31,t-51.4,.011);
  let d=text4(uv,vec2f(.50,.620),.0135,.17,t-53.5,.025);
  color=mix(color,IVORY,c*ending*.88);
  color=mix(color,IVORY*.65,d*ending*.62);
  let fade=soft(0.,2.6,t)*(1.-soft(58.5,60.,t));
  return vec4f(color*fade,1.);
}
`});

  return {
    async renderAt(context,_inputs,props){
      // The authored 60-second dramaturgy shares one continuous creative clock.
      const t=Math.max(0,Math.min(60,context.frame/(ART.frames-1)*60));
      const resolution=init.height/1080;
      const unfurl=smooth(8.6,19.2,t)*(1-smooth(24.1,29.2,t));
      const blossom=smooth(26.0,34.0,t)*(1-smooth(38.0,40.2,t));
      const crest=Math.exp(-Math.pow((t-35.8)/3.1,2));
      const pause=smooth(39.65,40.05,t)*(1-smooth(41.2,43.1,t));
      const recession=smooth(43.0,51.8,t);
      const paper=smooth(33.7,34.5,t)*(1-smooth(38.5,39.55,t));
      const light=Number(props.light??1)*(1-.94*pause);
      return withGpuResources(gpu,async arena=>{
        const field=arena.image(await mist.render({dimensions:3,
          noise:{algorithm:'openSimplex2',seed:ART.seed,frequency:.82,
            fractal:{kind:'fbm',octaves:3,gain:.47,lacunarity:2},
            warp:{kind:'openSimplex2',seed:ART.seed+73,frequency:.48,amplitude:.65,
              mode:'progressive',octaves:2,gain:.5}},
          origin:[-2.6,-1.4,0],stepX:[3/init.height,0,0],stepY:[0,3/init.height,0],
          motion:[.016,-.012,.024],ink:[.5,.5,.5],base:[.5,.5,.5],alpha:1,
        },context));

        // A subdued metallic fold: existing gradient/map/blend effects provide
        // the material texture. This is art-directed shading, not a PBR claim.
        const material=await processImage(field,async(image,fx)=>{
          const fold=await fx.linearGradient(image,{
            start:[0,init.height*.06],end:[0,init.height*.82],
            colorA:[.075,.055,.035],colorB:[1.7,1.45,1.10],
          });
          const patina=await fx.gradientMap(image,{stops:[
            {position:0,color:[.12,.095,.07]},{position:.56,color:[.45,.36,.23]},
            {position:1,color:[1.0,.85,.65]},
          ],extend:'clamp'});
          return fx.overlay(patina,fold,{opacity:.17});
        },{context});

        let p=arena.buffer(await morphPositions(gpu,seed,stream,context,{amount:unfurl}));
        p=arena.buffer(await morphPositions(gpu,p,flower,context,{amount:blossom}));
        p=arena.buffer(await twistPositions(gpu,p,context,{
          axis:'x',rate:(.045+.23*unfurl+.10*blossom)*Math.sin(t*.19+.3),
        }));
        p=arena.buffer(await bendPositions(gpu,p,context,{
          axis:'x',toward:'y',curvature:.07*unfurl-.025*blossom,
        }));
        p=arena.buffer(await wavePositions(gpu,p,context,{
          direction:[1,0,0],displacement:[0,0,1],amplitude:.012+.11*unfurl+.045*blossom,
          frequency:2.1,phase:t*.38,
        }));
        p=arena.buffer(await ripplePositions(gpu,p,context,{
          axis:'z',amplitude:.006+.075*blossom*crest,frequency:4.6,phase:t*.34,decay:.65,
        }));
        p=arena.buffer(await taperPositions(gpu,p,context,{axis:'x',slope:.035+.075*unfurl}));
        const zoom=1+.62*smooth(10.5,19.0,t)-.57*smooth(23.7,29.4,t)-.70*recession;
        const x=.97-1.32*smooth(9.2,17.0,t)+.35*smooth(23.7,29.4,t)-.44*recession;
        p=arena.buffer(await transformPositions(gpu,p,context,{
          scale:[zoom,zoom,zoom],
          rotation:[.07+.28*unfurl+.1*blossom,.18*Math.sin(t*.055),-.20*unfurl+.13*blossom],
          translation:[x,.14+.1*blossom,0],
        }));
        const red=crest*.7;
        const tint=[0,1,2].map(i=>mix(ART.gold[i],ART.copper[i],red)*light) as [number,number,number];
        const silhouette=arena.image(await gpu.drawMesh({
          positions:p,indices,matrix,color:[...tint,1],
          texture:{version:1,image:material,uvs,filter:'linear',addressU:'clamp',addressV:'clamp'},
          raster:{version:1,mode:'cutout',alphaCutoff:.01},
          output:{...output,alpha:'premultiplied'},
        }));

        // Previous material has been consumed by the draw before this next
        // managed recipe. Owner lifetimes retain it for the recorded GPU pass.
        const backdrop=await processImage(field,async(image,fx)=>{
          const bed=await fx.fourColorGradient(image,{
            topLeft:[.0014,.0018,.003],topRight:[.004,.0043,.005],
            bottomLeft:[.008,.0042,.0028],bottomRight:[.002,.0024,.0035],
          });
          const smoke=await fx.gradientMap(image,{stops:[
            {position:0,color:[.001,.0015,.002]},
            {position:.55,color:[.006,.006,.005]},
            {position:1,color:[.025,.017,.008]},
          ],extend:'clamp'});
          const room=await fx.lighten(smoke,bed,{opacity:.24+.20*crest});
          return fx.exposure(room,{stops:Math.log2(.5+light*.7)});
        },{context});
        const combined=await processRaster(backdrop,(image,fx)=>fx.over(silhouette,image),{context});
        const embers=arena.image(await particles.render(simulation.sample(context),context,{
          ink:[2.25,.95,.22],opacity:(.10+.65*crest)*smooth(13,26,t)*(1-smooth(48,55,t))*(1-.95*pause),
          trailOpacity:.18,trailWidth:.42,fadeWithAge:false,
          overLife:{opacity:[{age:0,value:0},{age:.08,value:1},{age:.65,value:.55},{age:1,value:0}],
            radiusScale:[{age:0,value:.25},{age:.18,value:1},{age:1,value:.2}]},
        },{background:combined}));
        const luminous=await processPa(embers,async(image,fx)=>{
          const water=await fx.displacement(image,{
            amount:(.38+1.3*unfurl)*resolution,frequency:2.2,speed:.09,time:context.time,
            seed:ART.seed,boundary:'clamp',sampling:'bilinear',
          });
          const lens=await fx.blur(water,{radius:.30*resolution,boundary:'clamp'});
          return fx.glow(lens,{radius:ART.glowSigma*resolution,
            intensity:.24+.38*Number(props.bloom??0),threshold:.78,boundary:'clamp'});
        },{context});
        const graded=await processImage(luminous,async(image,fx)=>{
          const contrast=await fx.brightnessContrast(image,{contrast:1.025,pivot:.1});
          const colored=await fx.colorBalance(contrast,{
            shadows:[0,.0003,.0008],midtones:[.0015,.0003,-.0005],
            highlights:[.008,.002,-.002],preserveLuma:true,
          });
          // The single palette reversal is the film's crest: the same folds
          // become an ink impression. It is intentional tonal stylization.
          const impression=await fx.tritone(colored,{
            shadows:[ART.paper[0],ART.paper[1],ART.paper[2]],
            midtones:[.26,.12,.055],highlights:[.017,.014,.012],
            amount:1,clampLuma:true,
          });
          const turn=arena.image(await transitions.crossDissolve(colored,impression,{progress:paper},context));
          const quietEdges=await fx.vignette(turn,{
            center:[.52,.46],radius:.96,amount:.22*(1-paper),pinHighlights:.7,
          });
          return fx.filmGrain(quietEdges,{amount:.0018+paper*.0016,seed:ART.seed,animated:true,colored:false});
        },{context});
        const result=arena.image(await gpu.run(finish,[graded],{parameters:Float32Array.of(t),output}));
        return arena.keep(result);
      });
    },
    async dispose(){
      particles.dispose();simulation.reset();await mist.dispose();
      for(const buffer of [indices,uvs,flower,stream,seed])await gpu.releaseBuffer(buffer);
    },
  };
});

/** Original interval-based stereo score: sustained glass/air, isolated notes,
 * one tense crest, a real pause, and an unfinished-sounding final resonance. */
export const score=defineAudioStage({sampleRate:48000,layout:'stereo',
  durationSamples:frameToSample(ART.frames,48000,ART.fps)},init=>{
  const tau=Math.PI*2,duration=init.durationSamples/init.sampleRate;
  const clock=(ART.frames-1)*ART.fps.den/(ART.fps.num*60);
  const frequency=(m:number)=>440*Math.pow(2,(m-69)/12);
  const soft=(a:number,b:number,t:number)=>{
    const x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*(3-2*x);
  };
  const pan=(x:number)=>({left:Math.cos((x+1)*Math.PI/4),right:Math.sin((x+1)*Math.PI/4)});
  const phrases=[
    {at:1.7,end:16.2,notes:[50,57,64],gain:.58},
    {at:10.6,end:29.5,notes:[46,53,60,64],gain:.77},
    {at:24.3,end:39.9,notes:[48,55,62,65],gain:.86},
    {at:31.8,end:40.5,notes:[50,53,63,69],gain:1.03},
    {at:43.2,end:59.3,notes:[50,57,64,69],gain:.43},
  ].map(p=>({...p,start:p.at*clock,end:p.end*clock,bass:frequency(p.notes[0]-12),
    voices:p.notes.map((note,i)=>({f:frequency(note),phase:i*.91,...pan((i-1.5)*.4)}))}));
  const notes:Array<{start:number;end:number;f:number;gain:number;decay:number;left:number;right:number}>=[];
  const strike=(at:number,note:number,gain:number,position:number,decay:number)=>{
    for(let echo=0;echo<3;echo++){
      const start=at*clock+echo*.58;
      notes.push({start,end:start+decay*5,f:frequency(note),gain:gain*Math.pow(.23,echo),
        decay,...pan(echo%2?-.8*position:position)});
    }
  };
  // Irregular, deliberate notes rather than a repeating arpeggiator.
  strike(5.4,74,.43,-.45,2.6);strike(14.8,69,.32,.5,2.4);
  strike(22.3,76,.43,-.2,2.2);strike(29.4,77,.5,.3,2.0);
  strike(34.6,81,.54,-.4,1.9);strike(35.2,88,.32,.45,1.8);
  strike(35.9,84,.36,.1,1.9);strike(47.4,76,.26,.35,2.8);
  strike(51.1,74,.34,-.35,3.0);strike(55.0,69,.19,.1,2.9);
  const hash=(n:number,s:number)=>{
    let x=(n^s)|0;x=Math.imul(x^(x>>>16),0x7feb352d);
    x=Math.imul(x^(x>>>15),0x846ca68b);return ((x^(x>>>16))>>>0)/2147483648-1;
  };
  const air=(t:number,s:number)=>{
    const x=t*670,n=Math.floor(x),u=x-n,w=u*u*(3-2*u);
    return hash(n,s)*(1-w)+hash(n+1,s)*w;
  };
  return {evaluateInterval(request){
    const r=request.local,start=r.start/init.sampleRate,end=r.endExclusive/init.sampleRate;
    const chords=phrases.filter(p=>p.start<end&&p.end>start);
    const ringing=notes.filter(n=>n.start<end&&n.end>start);
    const values=new Float32Array((r.endExclusive-r.start)*2);
    for(let i=0;i<values.length/2;i++){
      const t=(r.start+i)/init.sampleRate,film=t/clock;
      const crest=Math.exp(-Math.pow((film-35.7)/2.7,2));
      const pause=soft(39.7,40.0,film)*(1-soft(41.2,43.0,film));
      let left=0,right=0;
      for(const chord of chords){
        const e=soft(chord.start,chord.start+3.5,t)*(1-soft(chord.end-4.2,chord.end,t))*chord.gain;
        for(const voice of chord.voices){
          const phase=tau*voice.f*t+voice.phase;
          const wave=(Math.sin(phase)+.14*Math.sin(phase*2+.3)
            +.18*Math.sin(tau*voice.f*1.0006*t+voice.phase+.5))/1.32;
          const value=wave*SOUND.pad/chord.voices.length*e;
          left+=value*voice.left;right+=value*voice.right;
        }
        const bass=Math.sin(tau*chord.bass*t)*SOUND.bass*e*.7071;
        left+=bass;right+=bass;
      }
      for(const note of ringing){
        const age=t-note.start;if(age<0||t>=note.end)continue;
        const phase=tau*note.f*age;
        const bell=(Math.sin(phase)+.24*Math.sin(phase*2.003)*Math.exp(-age*1.4)
          +.06*Math.sin(phase*4.01)*Math.exp(-age*3))/1.3;
        const e=soft(0,.035,age)*Math.exp(-age/note.decay)*(1-soft(note.end-.35,note.end,t));
        const value=bell*e*note.gain*SOUND.bells;
        left+=value*note.left;right+=value*note.right;
      }
      const wind=(SOUND.air+crest*SOUND.crest)*soft(1.5,14,film)*(1-soft(43,57,film));
      left+=air(t,ART.seed)*wind;right+=air(t+.173,ART.seed+17)*wind;
      const fade=soft(0,3.5,t)*(1-soft(duration-4.5,duration-1/init.sampleRate,t));
      const silence=1-.975*pause;
      values[i*2]=Math.tanh(left)*.9*fade*silence;
      values[i*2+1]=Math.tanh(right)*.9*fade*silence;
    }
    return {audio:audioBlock(values,{sampleRate:init.sampleRate,layout:'stereo',startSample:r.start})};
  }};
});

// Keyframe numbers use the same creative clock as the frame and PCM generators.
const frame=(seconds:number)=>Math.round(seconds/60*(ART.frames-1));
export default (
  <Composition id="afterlight-a-motion-poem" width={ART.width} height={ART.height}
    fps={ART.fps} durationInFrames={ART.frames} seed={ART.seed} background="#000000">
    <Stage id="picture" factory={afterlight} props={{
      light:keyframes([
        {frame:0,value:.12},{frame:frame(6.5),value:.46,easing:'easeInOut'},
        {frame:frame(17),value:.86,easing:'easeInOut'},
        {frame:frame(26),value:.59,easing:'easeInOut'},
        {frame:frame(35.6),value:1.24,easing:'easeInOut'},
        {frame:frame(40.2),value:.06,easing:'easeInOut'},
        {frame:frame(47),value:.23,easing:'easeInOut'},
        {frame:frame(53),value:.16,easing:'easeInOut'},
        {frame:1797,value:0,easing:'easeInOut'},
      ]),
      bloom:keyframes([
        {frame:0,value:.12},{frame:frame(20),value:.35,easing:'easeInOut'},
        {frame:frame(29),value:.20,easing:'easeInOut'},
        {frame:frame(35.8),value:.95,easing:'easeInOut'},
        {frame:frame(40),value:.03,easing:'easeInOut'},
        {frame:frame(49),value:.15,easing:'easeInOut'},{frame:1797,value:0},
      ]),
    }}/>
    <Stage id="soundtrack" factory={score}/>
    <Layer id="image" name="Afterlight / picture" source={ref('picture')}/>
    <Layer id="sound" name="Afterlight / original score" source={ref('soundtrack','audio')}
      start={0} end={ART.frames} gain={SOUND.volume} pan={0}/>
  </Composition>
);
