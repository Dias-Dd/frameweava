import {EngineError} from '../core/errors.ts';

export interface StageFailure {code:string;message:string;stack?:string;cause?:StageFailure}
const own=(value:unknown,key:string):unknown=>value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
/** Browser-safe bounded serializer for use at the existing evaluate/RPC boundary. */
export function serializeStageFailure(error:unknown):StageFailure{
  let bytes=8192;const seen=new Set<object>(),encoder=new TextEncoder();
  function text(v:unknown,max:number):string{if(typeof v!=='string')return '';let result='',used=0;for(const c of v){const n=encoder.encode(c).length;if(used+n>max||n>bytes)break;result+=c;used+=n;bytes-=n;}return result;}
  function visit(e:unknown,depth:number):StageFailure{
    const raw=own(e,'code'),code=typeof raw==='string'&&/^E_[A-Z0-9_]{1,90}$/.test(raw)?raw:'E_STAGE_RENDER';
    const result:StageFailure={code:text(code,96),message:text(own(e,'message')??(typeof e==='string'?e:'Stage execution failed'),2048)};
    const stack=text(own(e,'stack'),4096);if(stack)result.stack=stack;
    if(e&&typeof e==='object'){seen.add(e);const cause=own(e,'cause');if(cause&&typeof cause==='object'&&!seen.has(cause)&&depth<3&&bytes>256)result.cause=visit(cause,depth+1);}
    return result;
  }
  return visit(error,0);
}
/** Host assigns location. Undefined lets the existing ordinary-error mapping run unchanged. */
export function sharedStageError(value:unknown,context:{stageId:string;frame?:number}):EngineError|undefined{
  const failure=serializeStageFailure(value);
  if(!/^E_SHARED_[A-Z0-9_]+$/.test(failure.code))return;
  return new EngineError(failure.code,failure.message,{...context,details:{diagnostics:[{code:failure.code,severity:'error',message:failure.message,...context}],cause:failure}});
}
