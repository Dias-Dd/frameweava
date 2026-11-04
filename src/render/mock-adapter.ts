import sharp from 'sharp';
import type { FrameContext, Json, PortValue, StageAdapter, StageFrameResult, StageSpec } from '../core/types.ts';

/** Contract probe for future native backends. It does not implement Blender, AE or GPU rendering. */
export class MockAdapter implements StageAdapter {
  constructor(public readonly engine='mock',private width=64,private height=64){}
  async init(_stage:StageSpec){}
  async renderAt(stage:StageSpec,context:FrameContext,inputs:Record<string,PortValue>,props:Record<string,unknown>):Promise<StageFrameResult>{
    const outputs:Record<string,PortValue>={};
    const specified=(props.outputs ?? {}) as Record<string,Json>;
    for(const [port,type]of Object.entries(stage.outputs)){
      if(type==='surface'){
        const width=stage.width ?? this.width,height=stage.height ?? this.height;
        const png=await sharp({create:{width,height,channels:4,background:String(props.color ?? '#00000000')}}).png().toBuffer();
        outputs[port]={kind:'surface',format:'png',width,height,dataUrl:`data:image/png;base64,${png.toString('base64')}`};
      }else if(specified[port]!==undefined)outputs[port]=specified[port];
      else if(type==='number')outputs[port]=Number(inputs[port] ?? context.frame);
      else if(type==='string')outputs[port]=String(inputs[port] ?? stage.id);
      else if(type==='boolean')outputs[port]=Boolean(inputs[port] ?? true);
      else outputs[port]={frame:context.frame,inputs:inputs as Record<string,Json>};
    }
    return {outputs,diagnostics:[]};
  }
  async dispose(){}
}
