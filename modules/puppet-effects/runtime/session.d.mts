export class ModuleError extends Error {code:string;constructor(code:string,message:string)}
export interface Session {
  call(operation:number,input:Uint8Array,capacity:number):Uint8Array;
  diagnostics():{disposed:boolean;buffers:number};
  dispose():{remainingBuffers:number};
}
export const MAX_BYTES:number;
export function bindInstance(instance:WebAssembly.Instance):Session;
export function instantiateModule(bytes:BufferSource):Promise<Session>;
