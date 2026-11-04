// SPDX-License-Identifier: Apache-2.0
import type {ParameterV2,PluginManifestV2} from '../../src/plugins/sdk.ts';
import {v2Parameters,validateV2Definitions} from '../../src/plugins/parameters-v2.ts';
import type {Node2D} from './types.ts';
/** Reuse Schema-v2 at bounded property records; do not send a giant recursive tree
 * through its current fixed whole-parameter-array gate or invent another protocol. */
export const common2DSchema:Record<string,ParameterV2>={id:{type:'string',minLength:1,required:true},kind:{type:'string',enum:['group','shape','image','text'],required:true},x:{type:'number',required:false},y:{type:'number',required:false},rotation:{type:'number',required:false},scaleX:{type:'number',required:false},scaleY:{type:'number',required:false},opacity:{type:'number',minimum:0,maximum:1,required:false},visible:{type:'boolean',required:false}};
validateV2Definitions(common2DSchema);
const descriptor={id:'native-2d.node',parameterSchemaVersion:2,parameters:common2DSchema} as PluginManifestV2;
export function validateNodeProperties(value:Node2D){const specific=value.kind==='group'?['children']:value.kind==='shape'?['shape','fill','stroke']:value.kind==='image'?['source','width','height','fit','sampling']:['text','font','fallback','fontSize','width','lineHeight','letterSpacing','direction','script','language','fill','stroke'];for(const key of Object.keys(value))if(!Object.hasOwn(common2DSchema,key)&&!['anchor','matrix','clip','layout',...specific].includes(key))throw Object.assign(new Error('Unknown '+value.kind+' property: '+key),{code:'E_NATIVE_2D_PARAMETER'});const record=Object.fromEntries(Object.entries(value).filter(([k,v])=>Object.hasOwn(common2DSchema,k)&&v!==undefined));v2Parameters(descriptor,record,'static');}
