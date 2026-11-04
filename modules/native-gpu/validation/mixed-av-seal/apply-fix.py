"""Apply only function-local edits to a selected SDK copy; retain its ctor
options and (notably cf214's) Renderer.close/native lease ordering byte-for-byte.
No Git operation or dependency synchronization is performed here.
"""
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def file_edit(name,fn):
 p=root/name;b=p.read_bytes();nl='\r\n' if b'\r\n' in b else '\n';text=b.decode().replace('\r\n','\n');out=fn(text);p.write_bytes(out.replace('\n',nl).encode())
def change(s,old,new):
 assert s.count(old)==1,old[:100]
 return s.replace(old,new)
def renderer(s):
 s=change(s,"import {AudioAdapter} from '../audio/adapter.ts';","import {AudioAdapter} from '../audio/adapter.ts';\nimport {audioExecutionStages} from '../audio/execution-stages.ts';")
 s=change(s,'  private initializationErrors=new Map<string,EngineError>();','  private initializationErrors=new Map<string,EngineError>();\n  private initializedStages=new Set<string>();')
 s=change(s,'private height:number){}','private height:number,private audioOnly=false){}')
 s=change(s,'  static async create(build:BuiltProject,options:RendererOptions={}):Promise<Renderer>{','''  static async create(build:BuiltProject,options:RendererOptions={}):Promise<Renderer>{return this.createForExecution(build,options,false);}
  /** Same Renderer, full compiler seal; initialize only the audio dependency closure. */
  static async createAudio(build:BuiltProject,options:RendererOptions={}):Promise<Renderer>{
    if(options.nativeGpu)throw new EngineError('E_AUDIO_OPTIONS','Audio-only initialization does not accept Native image options');
    return this.createForExecution(build,options,true);
  }
  private static async createForExecution(build:BuiltProject,options:RendererOptions,audioOnly:boolean):Promise<Renderer>{''')
 s=change(s,'    const c=build.manifest.composition;','    const stages=audioOnly?audioExecutionStages(build.manifest):build.manifest.stages;\n    const c=build.manifest.composition;')
 s=change(s,"    if(build.manifest.stages.some(s=>s.engine==='native-gpu'))throw", "    if(stages.some(s=>s.engine==='native-gpu'))throw")
 s=change(s,'    const renderer=new Renderer(build,options,width,height);','    const renderer=new Renderer(build,options,width,height,audioOnly);')
 start=s.index('      const environment={build,options};');end=s.index('      return renderer;',start);block=s[start:end]
 block=block.replace('new Set(build.manifest.stages.map(stage=>stage.engine))','new Set(stages.map(stage=>stage.engine))').replace('        const custom=customAdapters.get(engine);','        if(renderer.adapters.has(engine))continue;\n        const custom=customAdapters.get(engine);').replace('await Promise.all(build.manifest.stages.map(async stage=>{','await Promise.all(stages.filter(stage=>!renderer.initializedStages.has(stage.id)).map(async stage=>{\n        renderer.initializedStages.add(stage.id);')
 block=block.replace('        renderer.adapters.set(engine,adapter);','        renderer.adapters.set(engine,adapter);\n        if(adapter instanceof AudioAdapter){const stop=()=>{void adapter.dispose().catch(()=>{});};if(renderer.nativeAbort.signal.aborted)stop();else renderer.nativeAbort.signal.addEventListener("abort",stop,{once:true});}')
 s=s[:start]+'      await renderer.initializeStages(stages);\n'+s[end:]
 marker='  /** Existing DAG/time evaluator;'
 helper='''  private async initializeStages(stages:StageSpec[]){
    if(this.closed)throw new EngineError('E_RENDERER_CLOSED','Renderer has closed.');
    const {build,options}=this,c=build.manifest.composition,renderer=this;
    if(!this.fingerprint)this.fingerprint=hashValue([build.hash,'native-host',platform(),arch(),this.width,this.height,options.allowWasm===true,options.media??null]);
'''+block+'''  }
'''
 s=change(s,marker,helper+marker)
 s=change(s,'if(this.nativeClient&&!native)throw','if(this.nativeClient&&!native&&!interval)throw')
 old='''    const tvg=this.build.manifest,c=tvg.composition;
    assertSharedExecution(tvg.stages,execution);'''
 new='''    const tvg=this.build.manifest,c=tvg.composition;
    if(this.audioOnly&&!interval)throw new EngineError('E_AUDIO_INTERVAL_ONLY','This Renderer was initialized for sample intervals');
    const stages=interval?audioExecutionStages(tvg,stageId):tvg.stages;
    if(interval)await this.initializeStages(stages);
    assertSharedExecution(stages,execution);'''
 s=change(s,old,new)
 s=change(s,'    for(const level of topologicalLevels(tvg.stages)){','    for(const level of topologicalLevels(stages)){')
 return s
def session(s):
 s=change(s,'  private renderer?:Renderer;private starting?:Promise<Renderer>;','  private renderer?:Renderer;private starting?:Promise<Renderer>;private rendererAudioOnly=false;')
 s=change(s,'this.renderer=undefined;if(r)await r.close();','this.renderer=undefined;this.rendererAudioOnly=false;if(r)await r.close();')
 s=change(s,'private async acquire(build:BuiltProject,options?:RendererOptions){','private async acquire(build:BuiltProject,options?:RendererOptions,audioOnly=false){')
 old='''    this.active();
    if(!options){''';new='''    this.active();
    if(this.renderer&&this.rendererAudioOnly&&!audioOnly)await this.retire();
    if(!options&&audioOnly){const {nativeGpu:_native,...policy}=this.policy;options={...policy};}
    if(!options){'''
 s=change(s,old,new)
 s=change(s,'this.starting=Renderer.create(build,options);','this.starting=audioOnly?Renderer.createAudio(build,options):Renderer.create(build,options);\n      this.rendererAudioOnly=audioOnly;')
 # Only the two public interval methods; do not change frame/call ownership.
 start=s.index('  evaluateInterval(interval:');end=s.index('  nativeStats()',start);section=s[start:end];assert section.count('renderer=await this.acquire(build)')==2
 s=s[:start]+section.replace('renderer=await this.acquire(build)','renderer=await this.acquire(build,undefined,true)')+s[end:]
 return s
def service(s):
 s=change(s," const manifest={...build.manifest,stages,layers:layersForMedia(build.manifest,'audio')},renderer=await Renderer.create({...build,manifest}),handle=await open(path,'wx');", " const renderer=await Renderer.createAudio(build),handle=await open(path,'wx').catch(async error=>{await renderer.close();throw error;});")
 s=change(s,'rate,manifest.composition.fps','rate,build.manifest.composition.fps') if s.count('rate,manifest.composition.fps')==1 else s.replace('rate,manifest.composition.fps','rate,build.manifest.composition.fps')
 return s
file_edit('src/render/renderer.ts',renderer)
file_edit('modules/render-session/index.ts',session)
file_edit('modules/native-gpu/service.ts',service)
