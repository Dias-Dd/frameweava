// Generated from wasm-bindgen .d.ts. Ownership/imports stay behind the adapter.
import type {Engine} from '../dist/generated/module.js';
import type {ModuleLoader} from '@frameweave/engine/plugins';
import {createClient,type Options,type Client} from '../runtime/client.ts';
type Public = Pick<Engine,"calls"|"host_calls"|"normalize"|"scale">;
export type Api = {[K in keyof Public]:Public[K] extends (...args:infer A)=>infer R ? (...args:A)=>Promise<R>:never}&Pick<Client,'dispose'|'diagnostics'>;
export async function createEngineApi(load:ModuleLoader,options:Options={}):Promise<Api>{const client=await createClient(load,options);return Object.assign(Object.fromEntries(["calls","host_calls","normalize","scale"].map(name=>[name,(...args:unknown[])=>client.invoke(name,args)])),{dispose:()=>client.dispose(),diagnostics:()=>client.diagnostics()}) as Api;}
