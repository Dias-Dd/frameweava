import {parentPort,workerData} from 'node:worker_threads';
import {ProfessionalVideoEncoder} from './encoding.ts';
import {surfaceFromPixels} from './surface.ts';

const port=parentPort!;
let encoder:ProfessionalVideoEncoder|undefined,tail=Promise.resolve(),stopping=false;
const failure=(id:number,error:unknown)=>{
  const e=error as Error&{code?:string;details?:unknown};
  port.postMessage({version:1,id,ok:false,error:{code:e.code??'E_MEDIA_OUTPUT_WORKER',message:e.message??String(error),details:e.details}});
};
port.on('message',message=>{
  const {id,op}=message;
  if(op==='abort'){
    stopping=true;
    void (async()=>{try{await encoder?.abort();await tail;port.postMessage({version:1,id,ok:true,result:{}});}catch(e){failure(id,e);}finally{port.close();}})();
    return;
  }
  const job=tail.then(async()=>{
    if(stopping)throw Error('Output worker is stopping');
    if(op==='init'){encoder=await ProfessionalVideoEncoder.create(workerData.output,workerData.options);return {};}
    if(!encoder)throw Error('Output encoder is not initialized');
    if(op==='write'){
      const s=message.surface;
      await encoder.write(surfaceFromPixels(s.width,s.height,message.pixels,{format:s.format,color:s.color,alpha:s.alpha,deferBase64:true}));
      return {};
    }
    if(op==='finish'){const result=await encoder.finish();encoder=undefined;return result;}
    throw Error('Unknown output worker operation');
  });
  tail=job.then(result=>{port.postMessage({version:1,id,ok:true,result});if(op==='finish')port.close();},async error=>{failure(id,error);stopping=true;await encoder?.abort();port.close();});
});
