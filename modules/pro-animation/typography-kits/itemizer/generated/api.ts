// Generated from wasm-bindgen .d.ts. Ownership/imports stay behind the adapter.
import type {Engine} from '../dist/generated/module.js';
import type {ModuleLoader} from '@frameweave/engine/plugins';
import {createClient,type Options,type Client} from '../runtime/client.ts';
type Public = Pick<Engine,"analyze"|"analyze_line"|"metadata"|"read_bidi_runs"|"read_candidates"|"read_levels"|"read_paragraphs"|"read_runs"|"read_visual_indices"|"reset_results">;
export type Api = {[K in keyof Public]:Public[K] extends (...args:infer A)=>infer R ? (...args:A)=>Promise<R>:never}&Pick<Client,'dispose'|'diagnostics'>;
export async function createEngineApi(load:ModuleLoader,options:Options={}):Promise<Api>{const client=await createClient(load,options);return Object.assign(Object.fromEntries(["analyze","analyze_line","metadata","read_bidi_runs","read_candidates","read_levels","read_paragraphs","read_runs","read_visual_indices","reset_results"].map(name=>[name,(...args:unknown[])=>client.invoke(name,args)])),{dispose:()=>client.dispose(),diagnostics:()=>client.diagnostics()}) as Api;}
