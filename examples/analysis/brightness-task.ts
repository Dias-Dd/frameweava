import {readFile,writeFile,stat} from 'node:fs/promises';
import {setImmediate as yieldThread} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {defineAnalysisTask,hashAnalysisFile} from '../../src/analysis/index.ts';
import {EngineError} from '../../src/core/errors.ts';

export type BrightnessInput={imagePath:string;batchRows?:number};
export type BrightnessOutput={schemaVersion:1;width:number;height:number;pixels:number;meanLuma:number;minimum:number;maximum:number;histogram:number[]};
/** Real P6 RGB image statistics; encoded RGB Rec.709 luma, not scene-linear luminance. */
export const brightnessTask=defineAnalysisTask<BrightnessInput,BrightnessOutput>({
  async describe(input,context) {
    const batchRows=input.batchRows??16;
    if(!Number.isSafeInteger(batchRows)||batchRows<1||batchRows>1024||(await stat(input.imagePath)).size>32*1024*1024)throw new EngineError('E_BRIGHTNESS_INPUT','Use batchRows 1..1024 and a P6 image up to 32 MiB');
    return {inputs:[{id:'image',...await hashAnalysisFile(input.imagePath,context.signal),resource:'image'}],algorithm:{id:'frameweave.image-luma-histogram',version:'1.0.0',integrity:(await hashAnalysisFile(fileURLToPath(import.meta.url),context.signal)).sha256},models:[],parameters:{batchRows,weights:[.2126,.7152,.0722],space:'encoded-rgb'},runtime:{id:'node',version:process.version,integrity:(await hashAnalysisFile(process.execPath,context.signal)).sha256,environment:{platform:process.platform,arch:process.arch}}};
  },
  async execute(input,context) {
    const bytes=await readFile(input.imagePath),header=/^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(bytes.subarray(0,128).toString('latin1'));
    if(!header)throw new EngineError('E_BRIGHTNESS_INPUT','Expected binary P6 RGB, max channel 255, without header comments');
    const width=Number(header[1]),height=Number(header[2]),offset=header[0].length,pixels=width*height;
    if(width<1||height<1||!Number.isSafeInteger(pixels)||bytes.length!==offset+pixels*3)throw new EngineError('E_BRIGHTNESS_INPUT','Invalid P6 dimensions or pixel byte count');
    const histogram=Array<number>(256).fill(0);let sum=0,minimum=255,maximum=0;
    for(let y=0;y<height;y++){
      context.signal.throwIfAborted();
      for(let x=0;x<width;x++){const i=offset+(y*width+x)*3,luma=.2126*bytes[i]+.7152*bytes[i+1]+.0722*bytes[i+2],bin=Math.min(255,Math.max(0,Math.round(luma)));histogram[bin]++;sum+=luma;minimum=Math.min(minimum,luma);maximum=Math.max(maximum,luma);}
      if((y+1)%(input.batchRows??16)===0||y===height-1){context.reportProgress({phase:'pixels',completed:y+1,total:height});await yieldThread();}
    }
    const output:BrightnessOutput={schemaVersion:1,width,height,pixels,meanLuma:sum/pixels,minimum,maximum,histogram};
    await writeFile(join(context.directory,'brightness.json'),JSON.stringify(output,null,2));
    return {output,files:[{path:'brightness.json',format:'application/vnd.frameweave.brightness+json;version=1'}]};
  },
  validateOutput(value){const v=value as BrightnessOutput;if(!v||v.schemaVersion!==1||!Number.isFinite(v.meanLuma)||v.meanLuma<0||v.meanLuma>255||v.pixels!==v.width*v.height||!Array.isArray(v.histogram)||v.histogram.length!==256||v.histogram.some(n=>!Number.isSafeInteger(n)||n<0)||v.histogram.reduce((a,b)=>a+b,0)!==v.pixels)throw new EngineError('E_ANALYSIS_OUTPUT','Invalid brightness result');}
});
