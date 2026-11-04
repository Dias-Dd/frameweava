import {EngineError} from '../../src/core/errors.ts';
import type {FrameContext,InputPortTypes,PortType,StageSpec} from '../../src/core/types.ts';
import {inputValueMatches,normalizeInputPort} from '../../src/core/ports.ts';
import {frameToSeconds,hashString} from '../../src/core/time.ts';
import type {NativeProgram} from '../native-gpu/client.ts';
import type {NativePortPacket} from './native-port-types.ts';

export function assertNativePorts(stageId:string,schemas:InputPortTypes|Record<string,PortType>,ports:{values:Record<string,unknown>;images:Record<string,{image:number;info:unknown}>},images:NativeProgram['images'],direction:'input'|'output'='input'){
 const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 if(!plain(ports)||Object.keys(ports).some(k=>k!=='images'&&k!=='values')||!plain(ports.images)||!plain(ports.values))throw new EngineError('E_STAGE_CALL_PORTS','Invalid scoped port packet',{stageId});
 for(const name of [...Object.keys(ports.values),...Object.keys(ports.images)])if(!Object.hasOwn(schemas,name)||Object.hasOwn(ports.values,name)&&Object.hasOwn(ports.images,name))throw new EngineError(direction==='output'?'E_OUTPUT_UNDECLARED':'E_INPUT_SCHEMA','Undeclared or duplicated port',{stageId,details:{port:name}});
 for(const [name,schema]of Object.entries(schemas)){const type=normalizeInputPort(schema),image=ports.images[name];
  if(!Object.hasOwn(ports.values,name)&&!Object.hasOwn(ports.images,name)){if(type.optional)continue;throw new EngineError(direction==='output'?'E_OUTPUT_TYPE':'E_INPUT_MISSING','Required port is unavailable',{stageId,details:{port:name}});}
  if(type.type==='surface'){
   if(!image||Object.keys(image).some(k=>!['image','info'].includes(k))||!Number.isSafeInteger(image.image)||image.image<0||!images[image.image]||JSON.stringify(image.info)!==JSON.stringify({version:1,...images[image.image]}))throw new EngineError(direction==='output'?'E_OUTPUT_TYPE':'E_INPUT_TYPE','Expected an admitted resident image',{stageId,details:{port:name}});
  }else if(image||!inputValueMatches(type.type,ports.values[name]))throw new EngineError(direction==='output'?'E_OUTPUT_TYPE':'E_INPUT_TYPE','Port value does not match its declared type',{stageId,details:{port:name,expected:type.type}});
 }
}
/** Child clocks compose with the parent's local clock, preserving authored global time. */
export function childFrameContext(parent:FrameContext,child:StageSpec,key:string,seed:number):FrameContext {
 const {start,duration,offset,rate}=child.time;if(parent.frame<start||parent.frame>=start+duration)throw new EngineError('E_STAGE_INACTIVE','Child is inactive at its enclosing local time',{stageId:key,frame:parent.globalFrame});
 const frame=offset+(parent.frame-start)*rate.num/rate.den;
 return {...parent,frame,time:frameToSeconds(frame,parent.fps),dt:parent.dt*rate.num/rate.den,durationInFrames:duration,progress:duration<=1?0:(parent.frame-start)/(duration-1),seed:(seed^hashString(key))>>>0};
}
