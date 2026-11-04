/** Isolated deterministic audio source. No graphics imports or ambient clock. */
import {defineAudioStage,audioBlock,frameToSample} from '@frameweave/engine/audio';
const ART={fps:{num:30000,den:1001},frames:240,seed:1927};
const SOUND={volume:.92,pad:.14,bass:.048,bells:.17,air:.006,crest:.032};
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




export default score;
