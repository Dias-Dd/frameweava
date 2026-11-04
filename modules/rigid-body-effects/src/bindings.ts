import type {PluginInit} from '../../../src/plugins/sdk.ts';
import {createRigidBodyTools} from './api.ts';
import {rigidError} from './config.ts';
import type {RigidWorldOptions,RigidClientOptions,RigidSimulation,StaticCollisionEnvironment,StaticCollisionClientOptions} from './types.ts';
export function initialize(init:PluginInit){
  const tools=createRigidBodyTools(init.loadModule),owners=new Set<RigidSimulation>(),environments=new Set<StaticCollisionEnvironment>();let disposed=false;
  return {exports:{async createCollisionEnvironment(config:RigidWorldOptions,options?:StaticCollisionClientOptions){
    if(disposed)rigidError('E_RIGID_DISPOSED','Bindings are disposed');const owner=await tools.createCollisionEnvironment(config,options);
    if(disposed){owner.dispose();rigidError('E_RIGID_DISPOSED','Bindings closed during initialization');}
    const release=owner.dispose.bind(owner);owner.dispose=()=>{const result=release();environments.delete(owner);return result;};environments.add(owner);return owner;
  },async createRigidBodies(config:RigidWorldOptions,options?:RigidClientOptions){
    if(disposed)rigidError('E_RIGID_DISPOSED','Bindings are disposed');const owner=await tools.createRigidBodies(config,options);
    if(disposed){await owner.dispose();rigidError('E_RIGID_DISPOSED','Bindings closed during initialization');}
    const release=owner.dispose.bind(owner);let closing:ReturnType<RigidSimulation['dispose']>|undefined;
    owner.dispose=()=>closing??=release().finally(()=>owners.delete(owner));owners.add(owner);return owner;
  }},async dispose(){disposed=true;for(const environment of environments)environment.dispose();environments.clear();await Promise.all([...owners].map(o=>o.dispose()));owners.clear();}};
}
