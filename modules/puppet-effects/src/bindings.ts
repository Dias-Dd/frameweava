import type {PluginInit} from '../../../src/plugins/sdk.ts';
import {createPuppetProcessorTools} from './processor.ts';
import {createPuppetTools,puppetError} from './solver.ts';
import type {MeshData,Puppet,PuppetOptions,PuppetProcessor} from './types.ts';
import {createPuppetRenderer,type PuppetRendererOptions} from './renderer.ts';
export async function initialize(init:PluginInit){
  const graphics=await init.loadModule({module:'main',format:'javascript',dependency:'frameweave.graphics-contracts'}) as {validateMeshData(v:unknown):MeshData},tools=createPuppetTools(graphics,init.loadModule),processors=createPuppetProcessorTools(graphics,init.loadModule),owners=new Set<Puppet|PuppetProcessor>();let disposed=false;
  const renderers=new Set<ReturnType<typeof createPuppetRenderer>>();
  async function createPuppetProcessor(options?:PuppetOptions){if(disposed)puppetError('E_PUPPET_DISPOSED','Puppet bindings closed');const owner=await processors.createPuppetProcessor(options);if(disposed){await owner.dispose();puppetError('E_PUPPET_DISPOSED','Puppet bindings closed during initialization');}const release=owner.dispose.bind(owner);let closing:ReturnType<PuppetProcessor['dispose']>|undefined;owner.dispose=()=>closing??=release().finally(()=>owners.delete(owner));owners.add(owner);return owner;}
  return {exports:{createPuppetProcessor,async createPuppet(mesh:MeshData,options?:PuppetOptions){if(disposed)puppetError('E_PUPPET_DISPOSED','Puppet bindings are disposed');const owner=await tools.createPuppet(mesh,options);if(disposed){await owner.dispose();puppetError('E_PUPPET_DISPOSED','Puppet bindings closed during initialization');}const release=owner.dispose.bind(owner);let closing:ReturnType<Puppet['dispose']>|undefined;owner.dispose=()=>closing??=release().finally(()=>owners.delete(owner));owners.add(owner);return owner;},
    createPuppetRenderer(mesh:MeshData,options:PuppetRendererOptions){if(disposed)puppetError('E_PUPPET_DISPOSED','Puppet bindings are disposed');const owner=createPuppetRenderer(graphics.validateMeshData(mesh),options),release=owner.dispose.bind(owner);let closing:Promise<void>|undefined;owner.dispose=()=>closing??=release().finally(()=>renderers.delete(owner));renderers.add(owner);return owner;}
  },async dispose(){disposed=true;await Promise.all([...owners].map(o=>o.dispose()));await Promise.all([...renderers].map(o=>o.dispose()));}};
}
