import Reconciler from 'react-reconciler';
import {createContext} from 'react';
// Real React19 reconciler. NativePass renders null and commits through hooks;
// browser DOM instances/text are deliberately outside this renderer's contract.
let priority=0;
const reject=()=>{throw Object.assign(new Error('Native React cannot create DOM/text; use an explicit Web Stage'),{code:'E_NATIVE_REACT_DOM'});};
const noop=()=>{};
const context=Object.freeze({native:true});
let revision=0,channel:MessageChannel|undefined;const ticks:(()=>void)[]=[];
export const nativeCommitRevision=()=>revision;
export function yieldNativeTask(){return new Promise<void>(resolve=>{if(!channel){channel=new MessageChannel();channel.port1.onmessage=()=>ticks.shift()?.();}ticks.push(resolve);channel.port2.postMessage(null);});}
export const nativeReconciler=Reconciler({
 rendererPackageName:'frameweave-native',rendererVersion:'0.1.0',isPrimaryRenderer:true,
 supportsMutation:true,supportsPersistence:false,supportsHydration:false,
 getRootHostContext:()=>context,getChildHostContext:()=>context,getPublicInstance:(v:unknown)=>v,
 prepareForCommit:()=>null,resetAfterCommit:()=>{revision++;},
 createInstance:reject,createTextInstance:reject,appendInitialChild:reject,appendChild:reject,appendChildToContainer:reject,insertBefore:reject,insertInContainerBefore:reject,
 removeChild:noop,removeChildFromContainer:noop,clearContainer:noop,detachDeletedInstance:noop,
 finalizeInitialChildren:()=>false,shouldSetTextContent:()=>false,commitTextUpdate:reject,commitUpdate:reject,resetTextContent:reject,
 hideInstance:reject,unhideInstance:reject,hideTextInstance:reject,unhideTextInstance:reject,
 scheduleTimeout:(fn:()=>void,ms:number)=>setTimeout(fn,ms),cancelTimeout:(id:ReturnType<typeof setTimeout>)=>clearTimeout(id),noTimeout:-1,
 supportsMicrotasks:true,scheduleMicrotask:(fn:()=>void)=>queueMicrotask(fn),
 getCurrentUpdatePriority:()=>priority,setCurrentUpdatePriority:(p:number)=>{priority=p;},resolveUpdatePriority:()=>priority||32,
 resolveEventType:()=>null,resolveEventTimeStamp:()=>-1,trackSchedulerEvent:noop,
 shouldAttemptEagerTransition:()=>false,NotPendingTransition:null,HostTransitionContext:createContext(null),
 maySuspendCommit:()=>false,preloadInstance:()=>true,startSuspendingCommit:noop,suspendInstance:noop,waitForCommitToBeReady:()=>null,
 requestPostPaintCallback:(fn:(time:number)=>void)=>fn(0),resetFormInstance:noop,
 bindToConsole:(_method:string,args:unknown[])=>()=>console.error(...args),
} as any);
