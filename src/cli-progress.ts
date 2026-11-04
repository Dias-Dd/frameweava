import {cliHumanOutput} from './cli-output.ts';
import type {RenderProgress} from './core/progress.ts';

interface Output {write:(text:string)=>unknown;isTTY?:boolean;columns?:number}
interface ProgressOptions {enabled:boolean;output:Output;now?:()=>number;intervalMs?:number}
const phases:Record<RenderProgress['phase'],string>={compile:'正在编译工程',initialize:'正在初始化渲染器',
 'first-frame':'正在生成首帧',render:'正在渲染',audio:'正在生成音频',mux:'正在合成音画',finalize:'正在收尾编码与封装',ready:'预览已就绪',complete:'已完成',error:'操作失败',cancelled:'操作已取消'};
const duration=(seconds:number,up=false)=>{const n=Math.max(0,up?Math.ceil(seconds):Math.floor(seconds));return n>=3600?`${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`:`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
/** Independent terminal view: no renderer work, global console patch or JSON output. */
export class TerminalProgress {
 private current?:Readonly<RenderProgress>;private timer?:ReturnType<typeof setInterval>;
 private frame=0;private started=0;private workStarted=0;private group='';private lastPlain=-Infinity;private written=false;
 private now:()=>number;
 constructor(private options:ProgressOptions){this.now=options.now??(()=>performance.now());}
 update=(event:Readonly<RenderProgress>)=>{
  if(!this.options.enabled)return;
  if(['ready','complete','error','cancelled'].includes(event.phase)){this.close();return;}
  const now=this.now(),changed=this.current?.phase!==event.phase;
  const group=['first-frame','render'].includes(event.phase)?'frames':event.phase==='audio'?'samples':event.phase;
  if(!this.current){this.started=now;this.lastPlain=-Infinity;}
  if(group!==this.group){this.group=group;this.workStarted=now;}
  this.current=event;
  if(this.options.output.isTTY){
   this.draw();if(!this.timer){this.timer=setInterval(()=>this.draw(),this.options.intervalMs??100);this.timer.unref();}
  }else if(changed||now-this.lastPlain>=2000||event.total!==undefined&&event.completed===event.total){
   this.options.output.write(this.line(false)+'\n');this.lastPlain=now;
  }
 };
 private line(spin:boolean){
  const p=this.current!;let line=p.message??phases[p.phase];
  if(p.total!==undefined&&p.total>0&&Number.isFinite(p.total)&&p.completed!==undefined&&Number.isFinite(p.completed)){
   const done=Math.max(0,Math.min(p.total,p.completed)),elapsed=(this.now()-this.workStarted)/1000;
   line+=` ${done}/${p.total}${p.unit==='samples'?' 采样':' 帧'} · ${(done/p.total*100).toFixed(1)}%`;
   if(done>0&&elapsed>0){const speed=done/elapsed;
    line+=` · ${speed.toFixed(1)} ${p.unit==='samples'?'采样/秒':'帧/秒'} · 预计剩余 ${duration((p.total-done)/speed,true)}`;
   }
  }
  line+=` · 已用 ${duration((this.now()-this.started)/1000)}`;
  return (spin?['/','-','\\','|'][this.frame++%4]+' ':'')+line;
 }
 private draw(){
  if(!this.current)return;let line=this.line(true);
  // Keep one terminal row even for narrow windows and wide CJK characters.
  const columns=this.options.output.columns??120;let used=0,short='';
  for(const char of line){const width=char.codePointAt(0)!>0xff?2:1;if(used+width>Math.max(1,columns-2)){short+='…';break;}short+=char;used+=width;}
  this.options.output.write('\r\x1b[2K'+short);this.written=true;
 }
 close=()=>{if(this.timer){clearInterval(this.timer);this.timer=undefined;}if(this.written)this.options.output.write('\r\x1b[2K');this.written=false;this.current=undefined;this.group='';};
}
export function createCLIProgress(){return new TerminalProgress({enabled:cliHumanOutput(),output:process.stderr});}
