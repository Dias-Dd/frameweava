/**
 * T I D E S — a study in light.
 * 1920 × 1080 · 30000/1001 fps · 1798 frames (59.993266… seconds).
 *
 * A six-movement generative film with an original synthesized ambient score.
 * Edit ART, SOUND, the chapter cards, and the
 * WGSL scene below. No Servo, downloaded images, font files, or network access.
 * Native scene-linear F32 → native-image-effects@0.4.0 Glow → vector typography.
 * This is a source-tree example; its one relative import is explicit.
 * Authored without compiling, testing, previewing, or rendering, as requested.
 */
import {Composition, Stage, Layer, ref, keyframes, linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {defineAudioStage, audioBlock, frameToSample} from '@frameweave/engine/audio';
import {processPa} from 'native-image-effects';
import {withGpuResources} from '../../modules/gpu-effects/resource-arena.ts';

export const ART = {
  width:1920, height:1080, fps:{num:30000, den:1001}, frames:1798, seed:271828,
  // Scene-linear RGB. Small highlights deliberately exceed reference white.
  midnight:[.0025,.006,.014], jade:[.08,.63,.64], gold:[1.65,.80,.25],
  coral:[1.25,.19,.14], ivory:[.88,.83,.69],
  glowRadius:9, glowIntensity:.32, glowThreshold:.78,
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
const INK:vec3f=${rgb(ART.midnight)};
const JADE:vec3f=${rgb(ART.jade)};
const GOLD:vec3f=${rgb(ART.gold)};
const CORAL:vec3f=${rgb(ART.coral)};
const IVORY:vec3f=${rgb(ART.ivory)};
const PI:f32=3.14159265359;
fn hash21(p:vec2f)->f32{return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);}
fn rot(p:vec2f,a:f32)->vec2f{return vec2f(cos(a)*p.x-sin(a)*p.y,sin(a)*p.x+cos(a)*p.y);}
fn filament(d:f32,width:f32)->f32{
  let x=abs(d)/width;return exp(-x*x)*.85+exp(-x*.18)*.025;
}
fn segment(p:vec2f,a:vec2f,b:vec2f)->f32{
  let ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/max(dot(ab,ab),1e-9),0.,1.));
}
fn bell(x:f32)->f32{return exp(-x*x);}
`;

  const scene = await gpu.compile({abiVersion:1, id:'studio/tides/scene', version:'1.0.0',
    inputCount:0, parameterWords:2, code:palette+`
// Analytic positions depend on absolute time. Seeking never replays a simulation.
fn stars(uv:vec2f,t:f32)->vec3f{
  var light=vec3f(0.);
  for(var layer=0u;layer<3u;layer++){
    let k=f32(layer);let scale=19.+k*17.;
    let field=uv*scale+vec2f(t*(.008+k*.003),-t*.006);
    let cell=floor(field);let h=hash21(cell+vec2f(k*91.));
    let point=vec2f(.5)+.23*vec2f(sin(h*51.+t*.09),cos(h*83.+t*.07));
    let d=length(fract(field)-point);
    let gate=smoothstep(.75,.98,h);
    let pulse=.66+.34*sin(t*(.2+h*.3)+h*63.);
    let core=exp(-d*d/(.00007+k*.000025));
    let aura=exp(-d*d/.004)*.035;
    light+=mix(JADE*.5,IVORY,h)*(core+aura)*gate*pulse*(.22+k*.12);
  }
  return light;
}

fn seed(p:vec2f,t:f32)->vec3f{
  let q=p-vec2f(0.,-.055);let r=length(q);let a=atan2(q.y,q.x);
  let breathe=1.+.035*sin(t*.65);
  let edge=.205*breathe*(1.+.008*sin(a*7.+t*.4));
  let rim=filament(r-edge,.0013);
  let crescent=pow(max(0.,cos(a+2.2+t*.06)),7.);
  let atmosphere=exp(-abs(r-edge)*23.)*.07;
  let mist=exp(-r*r*22.)*(.17+.06*sin(a*3.+r*35.-t*.3));
  let core=exp(-length(q-vec2f(-.047,-.058))*35.);
  return (JADE*(rim*.44+atmosphere+mist)+GOLD*(rim*crescent*1.9+core*.16));
}

fn silk(p:vec2f,t:f32)->vec3f{
  let q=rot(p-vec2f(.12,-.05),-.26);
  var color=vec3f(0.);
  for(var i=0u;i<14u;i++){
    let f=f32(i);let phase=f*.115;
    let y=.105*sin(q.x*4.1-t*.22+phase)+.045*sin(q.x*8.+t*.12+phase*2.);
    let spread=(f-6.5)*(.009+.008*bell(q.x*1.8));
    let line=filament(q.y-y-spread,.0008+.00005*f);
    let taper=exp(-pow(abs(q.x)*.92,4.));
    let traveling=.35+.65*pow(max(0.,cos(q.x*2.7-t*.38+phase)),3.);
    color+=mix(JADE*.65,GOLD,f/13.)*line*taper*traveling*.5;
  }
  return color;
}

fn orbit(p:vec2f,t:f32)->vec3f{
  let q=p-vec2f(.21,-.08);var color=vec3f(0.);
  for(var i=0u;i<5u;i++){
    let f=f32(i);let a=-.65+f*.38+t*.012;
    let v=rot(q,a);let axes=vec2f(.205+f*.032,.062+f*.015);
    let ell=length(v/axes);let d=(ell-1.)*axes.y;
    let fade=.4+.6*pow(max(0.,cos(atan2(v.y,v.x)+t*.13+f)),2.);
    color+=mix(JADE,GOLD,f/4.)*filament(d,.00085)*fade*.5;
    let theta=t*(.15+f*.023)+f*1.37;
    let point=rot(vec2f(cos(theta)*axes.x,sin(theta)*axes.y),-a);
    let r=length(q-point);
    color+=mix(IVORY,GOLD,f/4.)*(exp(-r*r*140000.)*1.6+exp(-r*140.)*.12);
  }
  let center=length(q);
  color+=GOLD*exp(-center*85.)*.7;
  return color;
}

fn bloom(p:vec2f,t:f32)->vec3f{
  let q=rot(p-vec2f(0.,-.075),t*.026);let r=length(q);let a=atan2(q.y,q.x);
  var color=vec3f(0.);
  for(var i=0u;i<11u;i++){
    let f=f32(i);let phase=a*7.+f*.27+t*.13;
    let radius=.092+f*.011+(.042+f*.002)*cos(phase);
    let d=r-radius;
    let light=filament(d,.0009)*(.45+.55*pow(max(0.,sin(a+f*.2-t*.09)),2.));
    color+=mix(CORAL,GOLD,f/10.)*light*.48;
  }
  color+=JADE*exp(-r*r*9.)*.045;
  color+=GOLD*exp(-r*50.)*.5;
  return color;
}

fn current(p:vec2f,t:f32)->vec3f{
  let q=rot(p,-.13);var color=vec3f(0.);
  for(var i=0u;i<18u;i++){
    let f=f32(i);let offset=(f-8.5)*.013;
    let flow=.11*sin(q.x*3.2+t*.14+f*.05)+.047*sin(q.x*7.5-t*.21+f*.09);
    let gap=q.y-flow-offset+.055;
    let traveling=.3+.7*bell(sin(q.x*1.9-t*.19+f*.08)*1.8);
    let edge=exp(-pow(abs(q.x)*1.1,6.));
    color+=mix(JADE*.7,IVORY,f/17.)*filament(gap,.00065)*traveling*edge*.45;
  }
  return color;
}

fn coda(p:vec2f,t:f32)->vec3f{
  let q=p-vec2f(0.,-.065);let r=length(q);
  let ring=filament(r-(.10+.004*sin(t*.5)),.0011);
  let a=atan2(q.y,q.x);
  let light=pow(max(0.,cos(a+2.4)),10.);
  return GOLD*(ring*(.2+light)*.8+exp(-r*48.)*.1)+JADE*exp(-r*r*25.)*.075;
}

fn pixel(pixel:vec2u)->vec4f{
  let size=vec2f(outputSize());let uv=(vec2f(pixel)+.5)/size;
  let t=paramF32(0u);let exposure=paramF32(1u);
  // Slow camera drift, not an accumulating per-frame mutation.
  let p=(uv-.5)*vec2f(size.x/size.y,1.)/(1.+.025*sin(t*.10));
  let w1=smoothstep(8.5,11.5,t);let w2=smoothstep(18.5,21.5,t);
  let w3=smoothstep(28.5,31.5,t);let w4=smoothstep(38.5,41.5,t);
  let w5=smoothstep(48.5,51.5,t);
  var art=vec3f(0.);
  if(w1<.9999){art+=seed(p,t)*(1.-w1);}
  if(w1>.0001&&w2<.9999){art+=silk(p,t)*(w1-w2);}
  if(w2>.0001&&w3<.9999){art+=orbit(p,t)*(w2-w3);}
  if(w3>.0001&&w4<.9999){art+=bloom(p,t)*(w3-w4);}
  if(w4>.0001&&w5<.9999){art+=current(p,t)*(w4-w5);}
  if(w5>.0001){art+=coda(p,t)*w5;}
  let pool=exp(-length(p-vec2f(.12,-.12))*2.3);
  let base=INK+JADE*pool*.008+GOLD*exp(-length(p+vec2f(.5,.25))*4.)*.004;
  let vignette=1.-.36*smoothstep(.35,1.05,length(p));
  return vec4f((base+art+stars(uv,t))*(exposure*vignette),1.);
}`});

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
  let grain=(hash21(vec2f(pixel)+vec2f(floor(t*29.97003)*1.73))-0.5)*.0010;
  color=max(color+vec3f(grain),vec3f(0.));
  let fade=smoothstep(0.,1.65,t)*(1.-smoothstep(58.2,60.,t));
  return vec4f(color*fade,1.);
}`});

  return {
    async renderAt(context,_inputs,props) {
      // The creative clock ends exactly on 60; the media duration is 1798 frames.
      const time=Math.max(0,Math.min(60,context.frame/(ART.frames-1)*60));
      return withGpuResources(gpu,async arena=>{
        const source=arena.image(await gpu.run(scene,[],{
          parameters:Float32Array.of(time,Number(props.exposure??1)),output,
        }));
        // Reuse the installed, version-locked professional Glow implementation.
        // Its owned result is borrowed here; its Stage-local runtime manages it.
        const luminous=await processPa(source,(image,fx)=>fx.glow(image,{
          radius:ART.glowRadius,intensity:ART.glowIntensity,threshold:ART.glowThreshold,
        }),{context});
        const result=arena.image(await gpu.run(finish,[luminous],{
          parameters:Float32Array.of(time),output,
        }));
        return arena.keep(result);
      });
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
  <Composition id="tides-a-study-in-light" width={ART.width} height={ART.height}
    fps={ART.fps} durationInFrames={ART.frames} seed={ART.seed} background="#000000">
    <Stage id="tides" factory={tides} props={{exposure:keyframes([
      {frame:0,value:.82}, {frame:240,value:1,easing:'easeInOut'},
      {frame:600,value:.94,easing:'easeInOut'}, {frame:990,value:1.08,easing:'easeInOut'},
      {frame:1410,value:.98,easing:'easeInOut'}, {frame:1797,value:.86,easing:'easeInOut'},
    ])}} />
    <Stage id="score" factory={soundtrack} />
    <Layer id="film" name="Tides / final picture" source={ref('tides')} />
    <Layer id="music" name="Tides / ambient score" source={ref('score','audio')}
      start={0} end={ART.frames} gain={SOUND.volume} pan={0} />
  </Composition>
);
