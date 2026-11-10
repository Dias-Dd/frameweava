/** A scheduling heuristic, not a capacity limit or an authored time policy.
 * Collection uses the existing host RPC only at completed Native boundaries. */
export class HostCollectionPressure {
 private bytes=0;
 constructor(private memoryBytes:number,private sourceBytes:number){}
 due(method:string,result:unknown,replyBytes:number){
  if(!['native.init','native.render','native.temporal.sample','native.temporal.resume'].includes(method))return false;
  // Suspended replies still allocate. Carry their pressure forward, while
  // deferring the actual diagnostic/GC until an ordered complete boundary.
  this.bytes+=Math.max(this.sourceBytes,replyBytes);
  const kind=result&&typeof result==='object'?(result as {kind?:unknown}).kind:undefined;
  if(['native-temporal-request','native-state-segment','native-stage-call'].includes(String(kind)))return false;
  // Template hits can have tiny wire replies while the author still builds a
  // large temporary graph. Source size is a conservative pressure proxy too.
  return this.bytes>=Math.max(1,Math.floor(this.memoryBytes/64));
 }
 collected(){this.bytes=0;}
}
