import type {ModuleClient} from './runtime/client.ts';
export async function transform(client:ModuleClient,pixels:Uint8Array,gain:number,channels:readonly number[]):Promise<Uint8Array>{
  if(!pixels.length||pixels.length%4||channels.length!==3)throw Error('Expected RGBA8 pixels and three channel flags');
  const packet=new Uint8Array(8+pixels.length),header=new DataView(packet.buffer);
  header.setFloat32(0,gain,true);header.setUint32(4,channels.reduce((mask,value,i)=>mask|(value?1<<i:0),0),true);packet.set(pixels,8);
  const result=await client.call(1,packet,pixels.length);if(result.length!==pixels.length)throw Error('Invalid RGBA output length');return result;
}
