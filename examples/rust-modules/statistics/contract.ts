import type {ModuleClient} from './runtime/client.ts';
export interface Statistics {sum:number;mean:number;min:number;max:number}
export async function statistics(client:ModuleClient,samples:readonly number[],gain:number):Promise<Statistics>{
  const bytes=new Uint8Array(4+samples.length*4),input=new DataView(bytes.buffer);input.setFloat32(0,gain,true);
  samples.forEach((value,i)=>input.setFloat32(4+i*4,value,true));
  const result=await client.call(1,bytes,16),view=new DataView(result.buffer,result.byteOffset,result.byteLength);
  if(result.length!==16)throw Error('Invalid statistics result length');
  return {sum:view.getFloat32(0,true),mean:view.getFloat32(4,true),min:view.getFloat32(8,true),max:view.getFloat32(12,true)};
}
