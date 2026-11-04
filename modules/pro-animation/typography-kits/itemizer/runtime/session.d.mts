export class BindgenError extends Error {code:string;constructor(code:string,message:string)}
export interface Profile {id:'wasm-bindgen-data-v1';revision:1;generator:'0.2.129';entryClass:string;methods:string[];imports:{module:string;name:string;kind:string}[];resources:string[]}
export interface Diagnostics {disposed:boolean;liveSessions:number;memoryBytes:number}
export interface Session {invoke(method:string,args:unknown[]):unknown;diagnostics():Diagnostics;dispose():{remainingSessions:number}}
export function createSession(bytes:BufferSource,profile:Profile,createBinding:()=>Record<string,any>):Promise<Session>;
