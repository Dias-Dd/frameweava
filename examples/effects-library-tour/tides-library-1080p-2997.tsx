/**
 * T I D E S / LIBRARY EDITION — a study in light.
 * 1920 × 1080 · 30000/1001 fps · 1798 frames (59.993266… seconds).
 *
 * A six-movement generative film with an original synthesized ambient score.
 * Edit ART, SOUND, the chapter cards, and the
 * library recipes below. No Servo, downloaded images, font files, or network access.
 * Native library noise → mesh deformation → particles → transitions → image effects.
 * Scene-linear RGBA32F throughout; original vector typography and stereo score.
 * Explicit source imports target this repository; image effects use locked R1 0.4.0.
 * Authored without compiling, testing, previewing, or rendering, as requested.
 */
import {Composition, Stage, Layer, ref, keyframes, linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {defineAudioStage, audioBlock, frameToSample} from '@frameweave/engine/audio';
import {processImage, processRaster, processPa} from 'native-image-effects';
import type {FrameContext} from '@frameweave/engine';
import {Matrix4, OrthographicCamera, WebGPUCoordinateSystem} from 'three';
import {createNativeTransitions} from '../../modules/pro-animation/src/native-transitions/index.ts';
import {createFeedbackParticles, createNativeParticleRenderer, createNativeNoiseTextureRenderer}
  from '../../modules/spatial-effects/native.ts';
import {morphPositions, twistPositions, bendPositions, wavePositions, ripplePositions,
  taperPositions, transformPositions} from '../../modules/mesh-deformation/index.ts';
import type {GpuResourceArena} from '../../modules/gpu-effects/resource-arena.ts';
import {withGpuResources} from '../../modules/gpu-effects/resource-arena.ts';

export const ART = {
  width:1920, height:1080, fps:{num:30000, den:1001}, frames:1798, seed:271828,
  // Scene-linear RGB. Small highlights deliberately exceed reference white.
  midnight:[.0025,.006,.014], jade:[.08,.63,.64], gold:[1.65,.80,.25],
  coral:[1.25,.19,.14], ivory:[.88,.83,.69],
  glowRadius:8.5, glowIntensity:.52, glowThreshold:.62,
};

export const SOUND = {
  volume:.82, // Ordinary audio Layer gain. Set to 0 to mute the score.
  pad:.105, bass:.046, bells:.115, air:.010, transitions:.018,
};

export const tides = defineNativeStage(async init => {
  const gpu = init.gpu;
  const output = {width:init.width, height:init.height, format:'rgba32float' as const,
    alpha:'opaque' as const, color:linear709};

  // Palette constants are part of the editable shot, not a new effect API.
  const rgb = (v:number[]) => `vec3f(${v.map(n=>n.toFixed(6)).join(',')})`;
  const palette = `
const IVORY:vec3f=${rgb(ART.ivory)};
fn segment(p:vec2f,a:vec2f,b:vec2f)->f32{
  let ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/max(dot(ab,ab),1e-9),0.,1.));
}
`;

  // Library engines share this Stage's admitted GPU owner; no extra renderer.
  const transitions=createNativeTransitions(init);
  const camera=new OrthographicCamera(-3.2,3.2,1.8,-1.8,.01,24);
  camera.coordinateSystem=WebGPUCoordinateSystem;
  camera.position.set(0,0,7);camera.lookAt(0,0,0);
  camera.updateMatrixWorld();camera.updateProjectionMatrix();
  const matrix=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).toArray();
  const noise=await createNativeNoiseTextureRenderer(gpu,{
    width:init.width,height:init.height,workingColor:linear709,
    maxBufferBytes:512*1024*1024,maxSampleOperations:128000000,
  });

  // Corresponding ribbon vertices are authored geometry, not a replacement
  // deformation kernel. The existing library performs every animated deformation.
  const lanes=6,segments=64,ring:number[]=[],flower:number[]=[],stream:number[]=[],triangles:number[]=[];
  for(let lane=0;lane<lanes;lane++){
    for(let i=0;i<=segments;i++){
      const u=i/segments*Math.PI*2;
      for(const edge of [-1,1]){
        const width=.011+lane*.0015;
        const r=.95+lane*.065+edge*width;
        ring.push(r*Math.cos(u),r*.77*Math.sin(u),.20*Math.sin(u*2+lane*.17));
        const petal=.91+lane*.038+.25*Math.cos(u*5+lane*.09)+edge*width;
        flower.push(petal*Math.cos(u),petal*Math.sin(u),.24*Math.sin(u*3+lane*.15));
        const x=(i/segments-.5)*4.65;
        stream.push(x,(lane-2.5)*.085+.24*Math.sin(u*.8+lane*.14)+edge*width,
          .22*Math.cos(u+lane*.15));
      }
      if(i<segments){const v=lane*(segments+1)*2+i*2;triangles.push(v,v+2,v+1,v+1,v+2,v+3);}
    }
  }
  const descriptor={type:'f32' as const,dimensions:[ring.length/3,1,1] as [number,number,number],
    components:3 as const,semantic:'position' as const,space:'tides.sculpture',units:'meter'};
  const base=await gpu.createField(descriptor,Float32Array.from(ring));
  const petalTarget=await gpu.createField(descriptor,Float32Array.from(flower));
  const streamTarget=await gpu.createField(descriptor,Float32Array.from(stream));
  const indices=await gpu.createBuffer({type:'u32',length:triangles.length},Uint32Array.from(triangles));

  // Six deliberate silhouettes. Morph target order and topology remain explicit.
  const shots=[
    {stream:0,flower:0,twist:.06,bend:.02,wave:.025,ripple:.012,taper:0,scale:.90,x:0,tilt:.30,turn:0},
    {stream:1,flower:0,twist:.22,bend:.045,wave:.16,ripple:.03,taper:.07,scale:.94,x:.24,tilt:.10,turn:-.12},
    {stream:0,flower:0,twist:.40,bend:.01,wave:.04,ripple:.025,taper:0,scale:1.06,x:.70,tilt:1.0,turn:.35},
    {stream:0,flower:1,twist:.13,bend:.045,wave:.065,ripple:.09,taper:.03,scale:1.02,x:0,tilt:.16,turn:0},
    {stream:1,flower:0,twist:.30,bend:-.05,wave:.20,ripple:.055,taper:-.08,scale:1.04,x:.1,tilt:.22,turn:.13},
    {stream:0,flower:0,twist:.025,bend:.012,wave:.012,ripple:.008,taper:0,scale:.55,x:0,tilt:.16,turn:0},
  ];
  async function sculpture(chapter:number,c:FrameContext,arena:GpuResourceArena){
    const shot=shots[chapter],t=c.time;
    let positions=arena.buffer(await morphPositions(gpu,base,streamTarget,c,{amount:shot.stream}));
    positions=arena.buffer(await morphPositions(gpu,positions,petalTarget,c,{amount:shot.flower}));
    positions=arena.buffer(await twistPositions(gpu,positions,c,{axis:'x',rate:shot.twist*Math.sin(t*.24+.4)}));
    positions=arena.buffer(await bendPositions(gpu,positions,c,{axis:'x',toward:'y',curvature:shot.bend}));
    positions=arena.buffer(await wavePositions(gpu,positions,c,{direction:[1,0,0],displacement:[0,0,1],
      amplitude:shot.wave,frequency:2.4,phase:t*.55}));
    positions=arena.buffer(await ripplePositions(gpu,positions,c,{axis:'z',amplitude:shot.ripple,
      frequency:5.5,phase:t*.48,decay:.7}));
    positions=arena.buffer(await taperPositions(gpu,positions,c,{axis:'x',slope:shot.taper}));
    positions=arena.buffer(await transformPositions(gpu,positions,c,{
      scale:[shot.scale,shot.scale,shot.scale],
      rotation:[shot.tilt+.08*Math.sin(t*.13),.15*Math.sin(t*.09),shot.turn+.05*Math.sin(t*.11)],
      translation:[shot.x,.27,0],
    }));
    const echo=arena.buffer(await transformPositions(gpu,positions,c,{
      center:[shot.x,.27,0],scale:[1.055,1.055,1.055],rotation:[0,.09,0],
    }));
    const warm=chapter===3;
    const main=arena.image(await gpu.drawMesh({positions,indices,matrix,
      color:warm?[ART.coral[0]*2,ART.coral[1]*3.2,ART.coral[2]*1.5,1]
        :[ART.gold[0]*1.3,ART.gold[1]*1.37,ART.gold[2]*1.5,1],
      raster:{version:1,mode:'cutout',alphaCutoff:.01},
      output:{...output,alpha:'premultiplied'},
    }));
    const rim=arena.image(await gpu.drawMesh({positions:echo,indices,matrix,
      color:[ART.jade[0],ART.jade[1]*1.8,ART.jade[2]*2.1,1],
      raster:{version:1,mode:'cutout',alphaCutoff:.01},
      output:{...output,alpha:'premultiplied'},
    }));
    return {main,rim};
  }

  const simulation=createFeedbackParticles({
    fps:ART.fps,seed:ART.seed,substeps:1,rate:22,lifetime:4.5,duration:60,
    origin:[-1.25,-.25,.4],positionJitter:[.55,.7,.30],
    velocity:[.4,.19,0],velocityJitter:[.22,.25,.10],radius:.007,
    trailPoints:10,trailEverySteps:3,
    bursts:[{time:30.4,count:34},{time:40.4,count:20}],
    forces:[{kind:'vortex',center:[0,.27,0],axis:[0,0,1],strength:.24,softening:.55},
      {kind:'attractor',center:[0,.27,0],strength:.045,softening:.65},
      {kind:'drag',coefficient:.15}],
    budgets:{maxParticles:256,maxReplaySteps:2048,checkpointInterval:90,maxCheckpoints:8,
      maxValueBytes:32*1024*1024},
  });
  const particles=createNativeParticleRenderer(gpu,{
    width:init.width,height:init.height,format:'rgba32float',maxBufferBytes:256*1024*1024,
    camera:{projection:'orthographic',position:[0,0,7],target:[0,0,0],near:.01,far:24,viewHeight:3.6},
  });

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
  const cards = [
    {title:'TIDES',   line:'A STUDY IN LIGHT',         x:.50,y:.745,h:.125,spacing:.57},
    {title:'DRIFT',   line:'LET THE SILENCE MOVE',     x:.24,y:.760,h:.080,spacing:.32},
    {title:'ORBIT',   line:'EVERYTHING FINDS A CENTER',x:.25,y:.760,h:.075,spacing:.28},
    {title:'BLOOM',   line:'THE DARK HOLDS A GARDEN',  x:.50,y:.785,h:.090,spacing:.35},
    {title:'CURRENT', line:'NOTHING STAYS THE SAME',   x:.30,y:.755,h:.070,spacing:.25},
    {title:'STILL',   line:'AND EVERYTHING RETURNS',   x:.50,y:.725,h:.090,spacing:.50},
  ];
  const labels=[...cards.flatMap(card=>[card.title,card.line]),
    'TIDES / A MOTION POEM','FRAMEWEAVE','01 / 06','02 / 06','03 / 06','04 / 06','05 / 06','06 / 06'];
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
  const cardCode=cards.map((card,i)=>`
  {
    let age=t-${i*10}.;let envelope=smoothstep(.6,1.8,age)*(1.-smoothstep(7.7,9.3,age));
    if(envelope>.0001){
      let enter=1.-pow(1.-clamp((age-.6)/1.8,0.,1.),3.);
      let rise=(1.-enter)*.018;
      let heading=text${i*2}(uv,vec2f(${card.x},${card.y}+rise),${card.h},${card.spacing},age-.65,.009);
      let caption=text${i*2+1}(uv,vec2f(${card.x},${card.y+.094}+rise),.013,.18,age-1.5,.022);
      color=mix(color,IVORY,heading*envelope*.9);
      color=mix(color,IVORY*.66,caption*envelope*.62);
      let number=text${14+i}(uv,vec2f(.905,.925),.012,.15,age-.7,.025);
      color=mix(color,IVORY*.65,number*envelope*.52);
    }
  }`).join('\n');

  const finish = await gpu.compile({abiVersion:1, id:'studio/tides/editorial-finish', version:'1.0.0',
    inputCount:1, parameterWords:1, code:palette+`
fn glyph(code:u32,q:vec2f)->f32{
  var d=100.;switch code{${glyphCode}\ndefault:{return d;}}
}
${textCode}
fn pixel(pixel:vec2u)->vec4f{
  let size=vec2f(outputSize());let uv=(vec2f(pixel)+.5)/size.y;
  let screen=(vec2f(pixel)+.5)/size;let t=paramF32(0u);
  var color=read0(vec2i(pixel)).rgb;
  // A quieter lower third gives the typography a consistent reading field.
  color*=1.-.34*smoothstep(.64,.88,screen.y);
  ${cardCode}
  let open=smoothstep(.4,2.5,t)*(1.-smoothstep(56.5,59.,t));
  let credit=text12(uv,vec2f(.198,.080),.012,.15,t-1.1,.025);
  let signature=text13(uv,vec2f(.118,.925),.012,.14,t-1.8,.025);
  color=mix(color,IVORY*.6,credit*open*.50);
  color=mix(color,IVORY*.6,signature*open*.45);
  // Editorial hairlines, not a dashboard. Their reveal is purely time based.
  let rule=smoothstep(.065,.066,screen.x)*(1.-smoothstep(.934,.935,screen.x));
  let line=1.-smoothstep(.00025,.001,abs(screen.y-.891));
  color+=IVORY*rule*line*.05*open;
  color=max(color,vec3f(0.)); // Grain comes from the existing effect library.
  let fade=smoothstep(0.,1.65,t)*(1.-smoothstep(58.2,60.,t));
  return vec4f(color*fade,1.);
}`});

  return {
    async renderAt(context,_inputs,props) {
      const time=Math.max(0,Math.min(60,context.frame/(ART.frames-1)*60));
      const scale=init.height/1080;
      return withGpuResources(gpu,async arena=>{
        // FastNoiseLite's existing Native fBm + domain warp, not a new WGSL noise.
        const field=arena.image(await noise.render({dimensions:3,
          noise:{algorithm:'openSimplex2',seed:ART.seed,frequency:1.1,
            fractal:{kind:'fbm',octaves:4,gain:.5,lacunarity:2},
            warp:{kind:'openSimplex2',seed:ART.seed+31,frequency:.6,amplitude:.7,
              mode:'progressive',octaves:2,gain:.5}},
          origin:[-2.4,-1.4,0],stepX:[3/init.height,0,0],stepY:[0,3/init.height,0],
          motion:[.025,-.017,.035],ink:[.5,.5,.5],base:[.5,.5,.5],alpha:1,
        },context));
        const warm=.5+.5*Math.sin(time*.105-1.3);
        const backdrop=await processImage(field,async(image,fx)=>{
          const base=await fx.fourColorGradient(image,{
            topLeft:[.0015,.004,.012],topRight:[.004,.016,.025],
            bottomLeft:[.015+warm*.012,.008,.007],bottomRight:[.0015,.005,.013],
          });
          const clouds=await fx.gradientMap(image,{stops:[
            {position:0,color:[.001,.003,.009]},
            {position:.46,color:[.007,.030,.043]},
            {position:.78,color:[.045,.053,.031]},
            {position:1,color:[.10,.071,.024]},
          ],extend:'clamp'});
          const halo=await fx.radialGradient(image,{
            start:[init.width*.55,init.height*.38],end:[init.width*.94,init.height*.38],
            colorA:[.020,.033,.039],colorB:[0,0,0],
          });
          const mist=await fx.lighten(clouds,base,{opacity:.42});
          const lit=await fx.lighten(halo,mist,{opacity:.6});
          return fx.reliefLighting(lit,image,{contrast:.12,angle:28,boundary:'clamp'});
        },{context});

        // Render a second shot only during the 2.8-second transition window.
        let boundary=0;
        for(let n=1;n<=5;n++)if(time>=n*10-1.4&&time<n*10+1.4)boundary=n;
        const chapter=Math.min(5,Math.floor(time/10));
        const first=await sculpture(boundary?boundary-1:chapter,context,arena);
        const second=boundary?await sculpture(boundary,context,arena):undefined;
        const scene=await processRaster(backdrop,async(image,fx)=>{
          const under=await fx.screen(first.rim,image,{opacity:.34});
          const a=await fx.over(first.main,under,{opacity:.94});
          if(!second)return fx.flattenBlack(a);
          const back=await fx.screen(second.rim,image,{opacity:.34});
          const b=await fx.over(second.main,back,{opacity:.94});
          const x=Math.max(0,Math.min(1,(time-(boundary*10-1.4))/2.8));
          const progress=x*x*(3-2*x);
          let change;
          if(boundary===1)change=await transitions.crossDissolve(a,b,{progress},context);
          else if(boundary===2)change=await transitions.irisWipe(a,b,{
            progress,center:[.61,.42],softness:.16},context);
          else if(boundary===3)change=await transitions.lightWipe(a,b,{
            progress,direction:[1,.2],softness:.22,color:[1.8,.91,.32,1],intensity:.34},context);
          else if(boundary===4)change=await transitions.cardFlipWipe(a,b,{
            progress,geometry:'mesh',cells:[3,1],axis:'y',stagger:.28,shading:.32},context);
          else change=await transitions.rippleTransition(a,b,{
            progress,amplitude:12*scale,frequency:2.4,speed:.5,boundary:'clamp'},context);
          // The transition output is caller-owned; flattenBlack is this recipe's
          // explicit final composite. The recipe owns only its own allocations.
          arena.image(change);
          return fx.flattenBlack(change);
        },{context});

        const sparks=arena.image(await particles.render(simulation.sample(context),context,{
          ink:[2.9,1.18,.32],opacity:.68,trailOpacity:.25,trailWidth:.55,fadeWithAge:false,
          overLife:{
            opacity:[{age:0,value:0},{age:.08,value:.9},{age:.64,value:.62},{age:1,value:0}],
            radiusScale:[{age:0,value:.3},{age:.15,value:1.1},{age:1,value:.2}],
            ink:[{age:0,value:[1.1,1.0,.7]},{age:.6,value:[.5,1.0,1.7]},
              {age:1,value:[.2,.7,1.8]}],
          },
        },{background:scene}));
        const luminous=await processPa(sparks,async(image,fx)=>{
          const distorted=await fx.displacement(image,{
            amount:(1.3+2.8*Math.pow(Math.sin(time*.19),2))*scale,
            frequency:2.5,speed:.13,time:context.time,seed:ART.seed,
            boundary:'clamp',sampling:'bilinear',
          });
          const softened=await fx.blur(distorted,{radius:.28*scale,boundary:'clamp'});
          return fx.glow(softened,{radius:ART.glowRadius*scale,
            intensity:ART.glowIntensity,threshold:ART.glowThreshold,boundary:'clamp'});
        },{context});
        const graded=await processImage(luminous,async(image,fx)=>{
          const contrast=await fx.brightnessContrast(image,{
            contrast:1.05,pivot:.12,brightness:.0015,
          });
          const balanced=await fx.colorBalance(contrast,{
            shadows:[-.001,.0015,.003],midtones:[.003,.001,-.001],
            highlights:[.018,.008,-.004],preserveLuma:true,
          });
          const vivid=await fx.vibrance(balanced,{vibrance:.12,saturation:1.025});
          const warmLight=await fx.photoFilter(vivid,{
            color:[1,.79,.5],density:.045,preserveLuma:true,
          });
          const lens=await fx.vignette(warmLight,{
            center:[.51,.43],radius:.91,amount:.27,pinHighlights:.65,
          });
          return fx.filmGrain(lens,{amount:.0015,seed:ART.seed,animated:true,colored:false});
        },{context});
        // Apply the existing exposure keyframes without replacing the library grade.
        const exposed=await processRaster(graded,(image,fx)=>fx.exposure(image,{
          stops:Math.log2(Number(props.exposure??1)),
        }),{context});
        const result=arena.image(await gpu.run(finish,[exposed],{
          parameters:Float32Array.of(time),output,
        }));
        return arena.keep(result);
      });
    },
    async dispose(){
      particles.dispose();simulation.reset();await noise.dispose();
      for(const buffer of [indices,streamTarget,petalTarget,base])await gpu.releaseBuffer(buffer);
    },
  };
});

/**
 * Sample-accurate, stateless stereo score. Each interval is computed directly
 * from absolute sample positions; seeks and block order do not drive oscillators.
 * No MP3, microphone, sound device, streaming source, or external synth is used.
 */
export const soundtrack = defineAudioStage({
  sampleRate:48000, layout:'stereo',
  durationSamples:frameToSample(ART.frames,48000,ART.fps),
}, init => {
  const tau=Math.PI*2;
  const duration=init.durationSamples/init.sampleRate;
  // Match the visual creative clock: its last displayed frame is time 60.
  const scoreScale=(ART.frames-1)*ART.fps.den/(ART.fps.num*60);
  const frequency=(midi:number)=>440*Math.pow(2,(midi-69)/12);
  const smooth=(a:number,b:number,x:number)=>{
    const v=Math.max(0,Math.min(1,(x-a)/(b-a)));return v*v*(3-2*v);
  };
  const pan=(position:number)=>({
    left:Math.cos((position+1)*Math.PI/4),
    right:Math.sin((position+1)*Math.PI/4),
  });

  // Dm(add9) → Bbmaj9 → C(add9) → Fmaj9 → Gsus(add9) → Dm(add9).
  // Chord windows overlap softly. There is no hard phase reset at a chapter cut.
  const harmony=[
    [50,53,57,64], [46,53,57,60], [48,55,62,64],
    [53,57,60,67], [43,50,57,60], [50,53,57,64],
  ];
  const chords=harmony.map((notes,chapter)=>({
    start:chapter*10*scoreScale,
    end:Math.min(duration,(chapter*10+13)*scoreScale),
    bass:frequency(notes[0]-12),
    voices:notes.map((note,i)=>({
      f:frequency(note),phase:chapter*.41+i*.83,
      ...pan((i-1.5)*.43),
    })),
  }));

  const motifs=[
    [74,81,77], [72,77,81], [76,79,86],
    [81,84,79], [79,74,81], [77,76,74],
  ];
  const events:Array<{start:number;end:number;f:number;gain:number;decay:number;left:number;right:number}>=[];
  const bell=(start:number,note:number,gain:number,position:number,decay=1.65)=>{
    // Explicit analytical echoes keep random-access PCM independent of history.
    for(let echo=0;echo<3;echo++){
      const at=start+echo*.43;
      events.push({start:at,end:at+decay*5,f:frequency(note),
        gain:gain*Math.pow(.27,echo),decay,
        ...pan(echo%2===0?position:-position*.8)});
    }
  };
  motifs.forEach((notes,chapter)=>notes.forEach((note,i)=>{
    const at=(chapter*10+[1.4,4.1,7.2][i])*scoreScale;
    bell(at,note,chapter===5?.53:.72,[-.53,.48,-.12][i],chapter===5?2.1:1.65);
  }));
  // The flower opens with a light ascending constellation, then settles.
  [74,77,81,84,88].forEach((note,i)=>bell((30.4+i*.28)*scoreScale,note,.25,-.6+i*.3,1.2));

  // Smooth value noise supplies a quiet sea/air texture, not per-block randomness.
  const hash=(index:number,salt:number)=>{
    let x=(index^salt)|0;x=Math.imul(x^(x>>>16),0x7feb352d);
    x=Math.imul(x^(x>>>15),0x846ca68b);return ((x^(x>>>16))>>>0)/2147483648-1;
  };
  const noise=(time:number,salt:number)=>{
    const x=time*730,n=Math.floor(x),u=x-n,w=u*u*(3-2*u);
    return hash(n,salt)*(1-w)+hash(n+1,salt)*w;
  };

  return {
    evaluateInterval(request) {
      const interval=request.local;
      const samples=new Float32Array((interval.endExclusive-interval.start)*2);
      const begin=interval.start/init.sampleRate,end=interval.endExclusive/init.sampleRate;
      // Work only on voices touching this block. No full-minute PCM allocation.
      const activeChords=chords.filter(chord=>chord.start<end&&chord.end>begin);
      const activeBells=events.filter(event=>event.start<end&&event.end>begin);
      for(let i=0;i<samples.length/2;i++){
        const time=(interval.start+i)/init.sampleRate;
        let left=0,right=0;
        for(const chord of activeChords){
          const age=time-chord.start;
          const envelope=smooth(0,2.6,age)*(1-smooth(chord.end-3.0,chord.end,time));
          const breathe=.86+.14*Math.sin(tau*.071*time);
          for(const voice of chord.voices){
            const phase=tau*voice.f*time+voice.phase;
            const wave=(Math.sin(phase)+.20*Math.sin(phase*2+.21)
              +.16*Math.sin(tau*voice.f*1.0007*time+voice.phase+.4))/1.36;
            const value=wave*SOUND.pad*.25*envelope*breathe;
            left+=value*voice.left;right+=value*voice.right;
          }
          const bass=Math.sin(tau*chord.bass*time)*SOUND.bass*envelope*.7071;
          left+=bass;right+=bass;
        }
        for(const event of activeBells){
          const age=time-event.start;
          if(age<0||time>=event.end)continue;
          const attack=smooth(0,.024,age);
          const tail=1-smooth(event.end-.28,event.end,time);
          const phase=tau*event.f*age;
          const tone=(Math.sin(phase)+.28*Math.sin(phase*2.003)*Math.exp(-age*1.2)
            +.08*Math.sin(phase*4.011)*Math.exp(-age*3))/1.36;
          const value=tone*attack*Math.exp(-age/event.decay)*tail*event.gain*SOUND.bells;
          left+=value*event.left;right+=value*event.right;
        }
        let swell=0;
        for(let chapter=1;chapter<6;chapter++){
          const distance=(time-chapter*10*scoreScale)/1.45;
          if(Math.abs(distance)<4)swell+=Math.exp(-distance*distance)*SOUND.transitions;
        }
        const breath=SOUND.air*(.6+.4*Math.sin(time*.23+.4))+swell;
        left+=noise(time,ART.seed)*breath;
        right+=noise(time+.139,ART.seed+47)*breath;
        const fade=smooth(0,3.2,time)*(1-smooth(duration-4.8,duration-1/init.sampleRate,time));
        // Gentle saturation bounds the output; this is not a measured LUFS target.
        samples[i*2]=Math.tanh(left)*.9*fade;
        samples[i*2+1]=Math.tanh(right)*.9*fade;
      }
      return {audio:audioBlock(samples,{
        sampleRate:init.sampleRate,layout:'stereo',startSample:interval.start,
      })};
    },
  };
});

export default (
  <Composition id="tides-library-a-study-in-light" width={ART.width} height={ART.height}
    fps={ART.fps} durationInFrames={ART.frames} seed={ART.seed} background="#000000">
    <Stage id="tides" factory={tides} props={{exposure:keyframes([
      {frame:0,value:.82}, {frame:240,value:1,easing:'easeInOut'},
      {frame:600,value:.94,easing:'easeInOut'}, {frame:990,value:1.08,easing:'easeInOut'},
      {frame:1410,value:.98,easing:'easeInOut'}, {frame:1797,value:.86,easing:'easeInOut'},
    ])}} />
    <Stage id="score" factory={soundtrack} />
    <Layer id="film" name="Tides / library edition" source={ref('tides')} />
    <Layer id="music" name="Tides / ambient score" source={ref('score','audio')}
      start={0} end={ART.frames} gain={SOUND.volume} pan={0} />
  </Composition>
);
