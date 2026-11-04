/** VESPER — an editorial motion study. 1080p / 30000:1001 / 300 frames.
 * One ordinary Servo module instance → existing image effects → composition.
 * The Canvas and HTML are explicitly SDR; processing uses scene-linear F32.
 * Fonts are local system fonts; all artwork and music are generated in this file.
 */
import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {defineAudioStage,audioBlock,frameToSample} from '@frameweave/engine/audio';
import {processPa,processImage} from 'native-image-effects';
import {createServo} from '../../modules/servo/index.ts';

export const ART={width:1920,height:1080,fps:{num:30000,den:1001},frames:300,seed:1927};
export const SOUND={volume:.92,pad:.14,bass:.048,bells:.17,air:.006,crest:.032};

export const picture=defineNativeStage(async init=>{
  const {gpu,width,height}=init;
  const paintOptions={
    profile:'sdr-srgb8',execution:'trusted-local',input:false,width,height,seed:ART.seed,
    html:`<!doctype html><html><head><style>
      html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
      canvas{display:block;width:100%;height:100%}
    </style></head><body><canvas id="painting" width="${width}" height="${height}"></canvas></body></html>`,
    javascript:`
      function soft(a,b,t){var x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*x*(x*(x*6-15)+10);}
      function random(i){var n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);}
      window.frameweaveRender=function(context,params){
        var canvas=document.getElementById('painting'),g=canvas.getContext('2d');
        if(!g)throw Error('Canvas2D is required by Vesper');
        var t=params.time;
        g.setTransform(canvas.width/1920,0,0,canvas.height/1080,0,0);
        g.globalAlpha=1;g.globalCompositeOperation='source-over';
        var background=g.createLinearGradient(0,0,1920,1080);
        background.addColorStop(0,'#061217');background.addColorStop(.54,'#0a2025');
        background.addColorStop(1,'#07181c');g.fillStyle=background;g.fillRect(0,0,1920,1080);
        var haze=g.createRadialGradient(1300,470,20,1300,470,700);
        haze.addColorStop(0,'rgba(55,91,86,0.28)');haze.addColorStop(.5,'rgba(24,55,56,0.11)');
        haze.addColorStop(1,'rgba(4,15,20,0)');g.fillStyle=haze;g.fillRect(0,0,1920,1080);
        // Stationary seeded dust with slow drift, always evaluated at absolute time.
        for(var star=0;star<74;star++){
          var sx=(random(star+1)*2080+t*(1.3+random(star+90)*2))%2080-80;
          var sy=random(star+212)*1080+Math.sin(t*.12+star)*6;
          var opacity=(.06+.22*random(star+671))*(.6+.4*Math.sin(star+t*.3));
          g.fillStyle='rgba(228,211,176,'+opacity+')';g.beginPath();
          g.arc(sx,sy,.65+random(star+343)*1.2,0,Math.PI*2);g.fill();
        }
        var open=soft(.7,6.4,t)*(1-.23*soft(15.2,19.7,t));
        var close=soft(17.0,20,t);
        var macro=soft(10.1,12.8,t)*(1-soft(14.2,16.4,t));
        var cx=1320-140*macro,cy=516+12*Math.sin(t*.23),zoom=(.8+.2*open+.23*macro)*(1-.15*close);
        g.save();g.translate(cx,cy);g.scale(zoom,zoom*.90);g.rotate(-.17+t*.018);
        // Engraved orbits put the organic form in a quiet, measured composition.
        g.strokeStyle='rgba(194,168,115,0.16)';g.lineWidth=.8;
        for(var orbit=0;orbit<3;orbit++){
          g.beginPath();g.ellipse(0,0,348+orbit*24,277+orbit*19,.13+orbit*.09,0,Math.PI*2);g.stroke();
        }
        // Back petals first: translucent jade reflections between the gold folds.
        for(var layer=0;layer<2;layer++){
          var count=layer===0?24:17;
          for(var i=0;i<count;i++){
            var angle=i/count*Math.PI*2+(layer===0?.04:-.08)*t+layer*.17;
            var radius=(layer===0?286:206)+(layer===0?33:20)*Math.sin(i*2.37+t*.22);
            var breadth=(layer===0?52:41)*(.1+.9*open)*(1+.15*Math.sin(i+t*.35));
            var inner=layer===0?32:15;
            g.save();g.rotate(angle);g.translate(0,8*Math.sin(i*.7+t*.14));
            var metallic=g.createLinearGradient(radius*.12,-breadth,radius*.82,breadth*.65);
            metallic.addColorStop(0,layer===0?'#163b40':'#304b49');
            metallic.addColorStop(.22,layer===0?'#4d695e':'#a57d4b');
            metallic.addColorStop(.43,'#d2ae71');metallic.addColorStop(.51,'#f4ddb0');
            metallic.addColorStop(.57,'#d4b57a');metallic.addColorStop(.72,'#8c6c42');
            metallic.addColorStop(1,layer===0?'#112e34':'#243b3c');
            g.beginPath();g.moveTo(inner,0);
            g.bezierCurveTo(radius*.30,-breadth,radius*.85,-breadth*.54,radius,0);
            g.bezierCurveTo(radius*.77,breadth*.45,radius*.28,breadth*.85,inner,0);
            g.closePath();g.globalAlpha=(layer===0?.91:.97)*(.24+.76*open);
            g.fillStyle=metallic;g.fill();g.lineWidth=.65;
            g.strokeStyle='rgba(252,233,192,0.22)';g.stroke();
            // A hairline follows each fold rather than outlining the whole flower.
            g.beginPath();g.moveTo(inner+3,0);g.bezierCurveTo(radius*.34,-breadth*.24,
              radius*.72,-breadth*.12,radius*.95,0);
            g.strokeStyle='rgba(255,236,194,0.26)';g.lineWidth=.6;g.stroke();
            g.restore();
          }
        }
        g.globalAlpha=1;
        var core=g.createRadialGradient(-9,-9,1,0,0,37);
        core.addColorStop(0,'#e9d39d');core.addColorStop(.14,'#c4a46e');
        core.addColorStop(.3,'#756b47');core.addColorStop(1,'#0c2428');
        g.fillStyle=core;g.beginPath();g.arc(0,0,35,0,Math.PI*2);g.fill();
        g.strokeStyle='rgba(235,212,166,.65)';g.lineWidth=.75;
        g.beginPath();g.arc(0,0,37,0,Math.PI*2);g.stroke();
        g.restore();
        // Deliberate negative space on the left; no technical labels in the image.
      };`,
  };

  const typeOptions={
    profile:'sdr-srgb8',execution:'trusted-local',input:false,width,height,seed:ART.seed,
    html:`<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
      #page{position:absolute;left:0;top:0;width:1920px;height:1080px;
        transform:scale(${width/1920},${height/1080});transform-origin:0 0;color:#eee4cf}
      .brand{position:absolute;left:120px;top:85px;font:18px Arial,sans-serif;letter-spacing:6px}
      .edition{position:absolute;right:120px;top:89px;font:12px Arial,sans-serif;letter-spacing:3px;color:#b0b9ac}
      .headline{position:absolute;left:112px;top:315px;font-family:Georgia,'Times New Roman',serif;
        font-size:142px;font-weight:400;line-height:1.01;letter-spacing:-5px;margin:0;opacity:0}
      .headline em{font-weight:400;color:#d2b77e}
      .caption{position:absolute;left:122px;top:704px;width:500px;font:19px/1.65 Arial,sans-serif;
        letter-spacing:.4px;color:#a7b8ae;opacity:0}
      .bottom{position:absolute;left:120px;right:120px;bottom:87px;opacity:0}
      .rule{height:1px;background:rgba(207,187,145,.25);margin-bottom:25px}
      .foot{display:flex;justify-content:space-between;font:12px Arial,sans-serif;
        letter-spacing:2px;color:#b8bba8}
      #signature{font:italic 20px Georgia,'Times New Roman',serif;letter-spacing:0;color:#cfbd96}
    </style></head><body><div id="page">
      <div class="brand" id="brand">VESPER</div><div class="edition" id="edition">STUDIES IN LIGHT / 01</div>
      <h1 class="headline" id="first">The quiet<br><em>between.</em></h1>
      <h1 class="headline" id="last">Stay with<br><em>the light.</em></h1>
      <div class="caption" id="caption">A nocturne in moving light.<br>The space between moments.</div>
      <div class="bottom" id="bottom"><div class="rule"></div><div class="foot">
        <span id="signature">Light is a movement.</span><span>AN ORIGINAL MOTION POEM</span>
      </div></div>
    </div></body></html>`,
    javascript:`
      function soft(a,b,t){var x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*(3-2*x);}
      window.frameweaveRender=function(c,p){
        var t=p.time,enter=soft(1.3,3.5,t),out=1-soft(10.0,12.1,t);
        var end=soft(14.2,16.1,t)*(1-soft(18.5,20,t));
        var first=document.getElementById('first'),last=document.getElementById('last');
        first.style.opacity=String(enter*out);first.style.transform='translateY('+((1-enter)*28)+'px)';
        last.style.opacity=String(end);last.style.transform='translateY('+((1-soft(14.2,16.1,t))*22)+'px)';
        document.getElementById('caption').style.opacity=String(soft(3.4,5,t)*(1-soft(9.6,11.3,t)));
        var surround=soft(.5,2.4,t)*(1-soft(18.1,20,t));
        document.getElementById('brand').style.opacity=String(surround);
        document.getElementById('edition').style.opacity=String(surround*.8);
        document.getElementById('bottom').style.opacity=String(surround*.9);
      };`,
  };
  const scene=await createServo(gpu,{
    profile:'sdr-srgb8',execution:'trusted-local',input:false,width,height,seed:ART.seed,
    html:typeOptions.html.replace('<body>','<body><canvas id="painting" width="'+width+'" height="'+height+'" style="position:absolute;inset:0;width:100%;height:100%;display:block"></canvas>'),
    javascript:paintOptions.javascript.replace(/\bsoft\b/g,'paintSoft')+'\nvar paintFrame=window.frameweaveRender;\n'+
      typeOptions.javascript+'\nvar typeFrame=window.frameweaveRender;window.frameweaveRender=function(c,p){paintFrame(c,p);typeFrame(c,p);};',
  });

  return {
    async renderAt(context){
      const time=context.frame/(ART.frames-1)*20;
      const painted=await scene.render(undefined,{context,parameters:{time}});
      const atmosphere=await processPa(painted,async(image,fx)=>{
        const refracted=await fx.displacement(image,{amount:.38*height/1080,
          frequency:2.2,speed:.14,time:context.time,seed:ART.seed,boundary:'clamp',sampling:'bilinear'});
        return fx.glow(refracted,{radius:6*height/1080,intensity:.22,threshold:.72,boundary:'clamp'});
      },{context});
      const finished=await processImage(atmosphere,async(image,fx)=>{
        const contrast=await fx.brightnessContrast(image,{contrast:1.025,pivot:.10});
        const lens=await fx.vignette(contrast,{center:[.59,.47],radius:.93,amount:.17,pinHighlights:.7});
        return fx.filmGrain(lens,{amount:.0018,seed:ART.seed,animated:true,colored:false});
      },{context});
      return finished;
    },
    async dispose(){await scene.dispose();},
  };
});

// The original score and the Composition are appended below; all source stays editable.

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
        const e=soft(chord.start,chord.start+2.8*clock,t)*(1-soft(chord.end-3.2*clock,chord.end,t))*chord.gain;
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


export default <Composition id="vesper-servo-motion-study" width={ART.width} height={ART.height}
  fps={ART.fps} durationInFrames={ART.frames} seed={ART.seed} background="#000000">
  <Stage id="picture" factory={picture}/><Stage id="score" factory={score}/>
  <Layer id="film" source={ref('picture')}/>
  <Layer id="music" source={ref('score','audio')} start={0} end={ART.frames} gain={SOUND.volume}/>
</Composition>;
