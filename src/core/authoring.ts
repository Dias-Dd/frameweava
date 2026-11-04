import type {CompositeDefinition} from '../../modules/stage-orchestration/composite-types.ts';
export {stageInput} from '../../modules/stage-orchestration/composite-types.ts';
import {contentDuration,isContentReference,samplesToFrames,type ContentReference,type AudioContent} from './content.ts';
export {content,type ContentReference,type AudioContent,type SurfaceContent,type VideoContent,type ImageContent} from './content.ts';
export {planOutput,layersForMedia,type OutputPlan,type OutputFormat} from './output-plan.ts';
import type { EffectDefinition, EffectUse, InputPortTypes, Json, LayerSpec, PortRef, PortType, Rational, ResourceSpec, StageSpec, TimeMapping, Transform, TVG, VisualNode, StageFactory } from './types.js';
import { EngineError } from './errors.js';
import { rational } from './time.js';
import { builtinEffects } from './effects.js';
import {attachEngineSelection,engineRequirements,resolveStageEngine,stageEngineSelection,type EngineRequirement} from './engine-inference.ts';
export {defineManagedComponent,resolveStageEngine,type EngineRequirement} from './engine-inference.ts';
import { attachStageFactory } from './native-source.ts';
import {AUDIO_STAGE,assertAudioMetadata,type AudioStageMetadata,type AuthoredAudioStage} from '../audio/contract.ts';
import {frameToSample} from '../audio/time.ts';
import {NATIVE_LOGIC,type NativeStageFactory} from '../../modules/native-gpu/authoring.ts';

export interface StageNode { $node:'stage'; spec: Omit<StageSpec,'time'> & {time:Partial<TimeMapping>} }
export interface LayerNode { $node:'layer'; props: LayerProps }
export interface ResourceNode { $node:'resource'; spec:ResourceSpec }
export interface FragmentNode { $node:'fragment'; children:AuthorChild[] }
export type AuthorElement = VisualNode | StageNode | LayerNode | ResourceNode | FragmentNode | TVG;
export type AuthorChild = AuthorElement | AuthorChild[] | string | number | false | null | undefined;
interface Children { children?:AuthorChild }
const transformProperties=['x','y','scale','scaleX','scaleY','rotation','opacity','originX','originY'];
const visualProperties=[...transformProperties,'id','start','end','children','content','fontFamily','fontSize','fontWeight','letterSpacing','lineHeight','align','width','height','radius','fill','stroke','strokeWidth','key'];
function knownProperties(props:unknown,allowed:readonly string[],component:string,stageId?:string):void {
  if(!props || typeof props!=='object' || Array.isArray(props))throw new EngineError('E_JSX_PROPS',`${component} properties must be an object.`,{stageId});
  for(const property of Object.keys(props))if(!allowed.includes(property))
    throw new EngineError('E_UNKNOWN_PROPERTY',`${component} has no property '${property}'.`,{stageId,details:{component,property}});
}
export interface CompositionProps extends Children {
  id?:string; width:number; height:number; fps:number|Rational; durationInFrames?:number; duration?:number;
  background?:string; seed?:number; effects?:EffectDefinition[];
}
export interface StageProps extends Children {
  id:string; engine?:string; requires?:readonly EngineRequirement[]; entry?:string; exportName?:string; factory?:StageFactory<any,any,any>|AuthoredAudioStage<any,any,any>|NativeStageFactory<any,any,any>; audio?:AudioStageMetadata; inputs?:Record<string,PortRef|Json>; inputTypes?:InputPortTypes; outputs?:Record<string,PortType>;
  props?:Record<string,unknown>; time?:Partial<TimeMapping>; start?:number; duration?:number; offset?:number;
  rate?:number|Rational; seek?:'stateless'|'fixed-step'; width?:number; height?:number;
}
interface CommonLayerProps extends Children {id?:string;name?:string;enabled?:boolean;parent?:string;start?:number;end?:number}
interface AudioLayerAttributes {gain?:LayerSpec['gain'];pan?:LayerSpec['pan'];audio?:LayerSpec['audio']}
interface VisualLayerAttributes extends Transform {blend?:LayerSpec['blend'];effects?:EffectUse[];isolation?:LayerSpec['isolation'];mask?:PortRef}
type NoVisualAttributes={[K in keyof VisualLayerAttributes]?:never};
type NoAudioAttributes={[K in keyof AudioLayerAttributes]?:never};
export type LayerProps=CommonLayerProps & (
 | (VisualLayerAttributes & NoAudioAttributes & {source:Exclude<ContentReference,AudioContent>})
 | (AudioLayerAttributes & NoVisualAttributes & {source:AudioContent})
 // Legacy untyped PortRef and groups retain source compatibility; actual port validation is mandatory.
 | (VisualLayerAttributes & AudioLayerAttributes & {source?:PortRef})
);
export interface VisualProps extends Omit<VisualNode,'kind'|'children'>,Children {}
export function flatten(children:AuthorChild): AuthorElement[] {
  const result:AuthorElement[]=[];
  const visit=(node:AuthorChild):void=> {
    if (node===null || node===undefined || node===false) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node==='string' || typeof node==='number') throw new EngineError('E_JSX_CHILD','Text content belongs inside a Text component.');
    if ('$node' in node && node.$node==='fragment') { node.children.forEach(visit); return; }
    result.push(node);
  };
  visit(children); return result;
}
export function Fragment(props:Children): FragmentNode { knownProperties(props,['children','key'],'Fragment');return { $node:'fragment',children:[props.children] }; }
function visualChildren(children:AuthorChild):VisualNode[] {
  return flatten(children).map(child=> {
    if (!('kind' in child)) throw new EngineError('E_JSX_CHILD','Only Text, Shape, Circle and Group nodes can be placed in a declarative Stage.');
    return child;
  });
}
function visual(kind:VisualNode['kind'],props:VisualProps):VisualNode {
  knownProperties(props,visualProperties,kind);
  const {children,...rest}=props;
  return {kind,...rest,...(children===undefined?{}:{children:visualChildren(children)})};
}
export function Group(props:VisualProps):VisualNode { return visual('group',props); }
/** Scene is a declarative visual group; execution boundaries are always explicit Stage nodes. */
export const Scene=Group;
export function Text(props:VisualProps):VisualNode {
  knownProperties(props,visualProperties,'Text');
  const {children,...rest}=props;
  const stringify=(v:AuthorChild):string=>Array.isArray(v)?v.map(stringify).join(''):v===null||v===undefined||v===false?'':String(v);
  return {kind:'text',...rest,content:props.content??stringify(children)};
}
export function Rect(props:VisualProps):VisualNode { return visual('rect',props); }
export const Shape=Rect;
export function Circle(props:VisualProps):VisualNode { return visual('circle',props); }
export function Stage(props:StageProps):StageNode {
  knownProperties(props,['id','engine','requires','entry','exportName','factory','audio','children','inputs','inputTypes','outputs','props','time','start','duration','offset','rate','seek','width','height','key'],'Stage',props?.id);
  if (Number(props.entry!==undefined)+Number(props.factory!==undefined)+Number(props.children!==undefined)>1)
    throw new EngineError('E_STAGE_ENTRY',`Stage '${props.id}' must use one source: entry, factory, or declarative nodes.`,{stageId:props.id});
  if (props.factory!==undefined && typeof props.factory!=='function') throw new EngineError('E_STAGE_FACTORY',`Stage '${props.id}' factory must be a function.`,{stageId:props.id});
  const marked=props.factory&&(props.factory as AuthoredAudioStage<any,any,any>)[AUDIO_STAGE];
  const native=props.factory&&(props.factory as NativeStageFactory)[NATIVE_LOGIC];
  const audio=marked??props.audio;
  if(audio!==undefined)assertAudioMetadata(audio);
  if(marked&&props.audio&&JSON.stringify(marked)!==JSON.stringify(props.audio))throw new EngineError('E_AUDIO_METADATA','Factory and Stage audio metadata differ.',{stageId:props.id});
  if(props.audio&&!marked&&!props.entry)throw new EngineError('E_AUDIO_FACTORY','Audio metadata requires a marked factory or explicit entry.',{stageId:props.id});
  if(props.engine==='web')throw new EngineError('E_WEB_REMOVED','Web Stages were removed; use Servo within a Native Stage.',{stageId:props.id});
  if(props.factory&&!marked&&!native)throw new EngineError('E_STAGE_FACTORY',`Stage '${props.id}' must use defineNativeStage or defineAudioStage; browser factories were removed.`,{stageId:props.id});
  if (props.exportName!==undefined && (!props.entry || typeof props.exportName!=='string' || !props.exportName))
    throw new EngineError('E_STAGE_EXPORT',`Stage '${props.id}' exportName requires an entry module and a nonempty export name.`,{stageId:props.id});
  if(props.time!==undefined)knownProperties(props.time,['start','duration','offset','rate'],'Stage time',props.id);
  if(props.time?.rate && typeof props.time.rate==='object')knownProperties(props.time.rate,['num','den'],'Stage rate',props.id);
  if(props.rate && typeof props.rate==='object')knownProperties(props.rate,['num','den'],'Stage rate',props.id);
  const time:Partial<TimeMapping>={...props.time};
  if (props.start!==undefined) time.start=props.start;
  if (props.duration!==undefined) time.duration=props.duration;
  if (props.offset!==undefined) time.offset=props.offset;
  if (props.rate!==undefined) {
    // Negative and zero rates intentionally support reverse/frozen playback.
    const rate=typeof props.rate==='number'?{num:props.rate,den:1}:props.rate;
    time.rate=rate;
  }
  const requirements=[...(props.requires??[]),...engineRequirements(props.children)];
  if(native)requirements.push({id:'frameweave.native-gpu-logic',engines:['native-gpu']});
  if(audio)requirements.push({id:'frameweave.audio-factory',engines:['audio']});
  if(props.children!==undefined)throw new EngineError('E_WEB_REMOVED','Declarative browser Stages were removed; render HTML/CSS through the Servo module.',{stageId:props.id});
  const spec:StageNode['spec']={id:props.id,engine:resolveStageEngine(props.id,props.engine,requirements),...(props.entry?{entry:props.entry}:{}),...(props.exportName===undefined?{}:{exportName:props.exportName}),
    ...(props.children===undefined?{}:{nodes:visualChildren(props.children)}),...(audio?{audio:{...audio}}:{}),inputs:props.inputs??{},...(props.inputTypes===undefined?{}:{inputTypes:props.inputTypes}),outputs:props.outputs??(audio?{audio:'audio'}:{surface:'surface'}),
    props:props.props??{},time,seek:props.seek??'stateless',...(props.width===undefined?{}:{width:props.width}),...(props.height===undefined?{}:{height:props.height})};
  attachEngineSelection(spec,{explicit:props.engine,requirements});
  if (props.factory) attachStageFactory(spec,props.factory);
  return {$node:'stage',spec};
}
/** A reusable local DAG or explicit child-call scope, represented as one outer Stage. */
export interface CompositeStageProps extends Omit<StageProps,'children'|'engine'|'audio'> {
 mode?:'auto'|'explicit';publish?:Record<string,PortRef>;children?:AuthorChild;
}
export function CompositeStage(props:CompositeStageProps):StageNode {
 knownProperties(props,['id','requires','entry','exportName','factory','inputs','inputTypes','outputs','props','time','start','duration','offset','rate','seek','width','height','mode','publish','children','key'],'CompositeStage',props.id);
 const {children,mode='auto',publish,...base}=props;
 const nodes=flatten(children);if(nodes.some(n=>!('$node'in n)||n.$node!=='stage'))throw new EngineError('E_STAGE_COMPOSITION','Composite children must be Stage or CompositeStage definitions',{stageId:props.id});
 if(mode!=='auto'&&mode!=='explicit'||mode==='auto'&&(base.factory||base.entry)||mode==='explicit'&&!base.factory&&!base.entry)throw new EngineError('E_STAGE_COMPOSITION','Use mode="auto" without a factory, or mode="explicit" with a factory',{stageId:props.id});
 const stage=Stage({...base,engine:'native-gpu'});
 // Child time is local to its containing Stage; complete mappings are assigned
 // when the enclosing Composition supplies its finite duration.
 stage.spec.composition={version:1,mode,stages:nodes.map(n=>(n as StageNode).spec) as StageSpec[],...(publish?{publish}:{})};
 return stage;
}
function completeCompositeTimes(stage:StageSpec):void {
 const pending=[stage];while(pending.length){const parent=pending.pop()!;for(const child of parent.composition?.stages??[]){const time=child.time;child.time={start:time.start??0,duration:time.duration??parent.time.duration-(time.start??0),offset:time.offset??0,rate:time.rate??{num:1,den:1}};pending.push(child);}}
}
export function Layer(props:LayerProps):LayerNode { if(props?.enabled!==undefined&&typeof props.enabled!=='boolean')throw new EngineError('E_LAYER_ENABLED','Layer enabled must be a static boolean.');knownProperties(props,[...transformProperties,'id','name','enabled','gain','pan','audio','source','parent','start','end','blend','effects','isolation','mask','children','key'],'Layer');return {$node:'layer',props}; }
export function Resource(props:ResourceSpec):ResourceNode { knownProperties(props,['id','src','kind','key'],'Resource');return {$node:'resource',spec:{...props}}; }
export function ref(stage:string,port='surface'):PortRef { return {$ref:stage,port}; }
export function Composition(props:CompositionProps):TVG {
  knownProperties(props,['id','width','height','fps','durationInFrames','duration','background','seed','effects','children','key'],'Composition');
  if(props.fps && typeof props.fps==='object')knownProperties(props.fps,['num','den'],'Composition FPS');
  const fps=rational(props.fps);
  const nodes=flatten(props.children),stageNodes=nodes.filter((n):n is StageNode=>'$node' in n&&n.$node==='stage');
  const stageById=new Map(stageNodes.map(n=>[n.spec.id,n.spec]));
  const sourceEnd=(source:LayerProps['source'],start:number):number|undefined=>{
    if(!source)return undefined;
    if(isContentReference(source))return start+(contentDuration(source,fps)??NaN);
    const stage=stageById.get(source.$ref);if(!stage)return undefined;
    if(stage.time.duration!==undefined)return (stage.time.start??0)+stage.time.duration;
    if(stage.audio)return (stage.time.start??0)+samplesToFrames(stage.audio.durationSamples,stage.audio.sampleRate,fps)-(stage.time.offset??0);
    // Declarative literals are one still frame; Signals/factories require a finite declared range.
    const temporal=(v:unknown):boolean=>!!v&&typeof v==='object'&&(Object.keys(v).some(k=>['$keyframes','$expr','$spring'].includes(k))||Object.values(v).some(temporal));
    if(stage.nodes&&!temporal(stage.nodes)&&!stage.nodes.some(function timed(n):boolean{return n.start!==undefined||n.end!==undefined||Boolean(n.children?.some(timed));}))return start+1;
    return undefined;
  };
  const layerStart=(p:LayerProps):number=>{const source=isContentReference(p.source)?p.source.source:p.source;return p.start??(source?stageById.get(source.$ref)?.time.start:undefined)??0;};
  const layerSourceEnd=(p:LayerProps):number|undefined=>{
    const descriptor=isContentReference(p.source)?p.source:undefined,source=descriptor?.source??p.source as PortRef|undefined;
    const producer=source&&stageById.get(source.$ref);
    const metadata=descriptor?.kind==='audio'?descriptor:producer?.outputs[source!.port]==='audio'?producer.audio:undefined;
    if(metadata){
      const offset=p.audio?.sourceOffsetSamples??0,end=p.audio?.sourceEndSample??metadata.durationSamples;
      if(end>metadata.durationSamples||offset<0||end<=offset)throw new EngineError('E_AUDIO_INTERVAL','Audio trim must fit the declared source duration.');
      const startSample=p.audio?.startSample??frameToSample(layerStart(p),metadata.sampleRate,fps);
      return samplesToFrames(startSample+end-offset,metadata.sampleRate,fps);
    }
    return sourceEnd(p.source,layerStart(p));
  };
  const inferEnd=(node:LayerNode,inherited?:number):number=>{
    const p=node.props;if(p.enabled===false)return 0;
    const children=flatten(p.children).filter((n):n is LayerNode=>'$node' in n&&n.$node==='layer');
    const own=p.end??inherited??layerSourceEnd(p);
    const ends=children.map(c=>inferEnd(c,own));
    if(p.source&&(!Number.isSafeInteger(own)||own!<=0))throw new EngineError('E_OUTPUT_RANGE',`Layer '${p.id??'unnamed'}' has unknown/unbounded duration. Declare end or Composition duration.`);
    return Math.max(own??0,...ends);
  };
  const explicit=props.durationInFrames??(props.duration===undefined?undefined:Math.round(props.duration*fps.num/fps.den));
  const layerNodes=nodes.filter((n):n is LayerNode=>'$node' in n&&n.$node==='layer');
  const durationInFrames=explicit??Math.max(0,...(layerNodes.length?layerNodes.map(n=>inferEnd(n)):stageNodes.filter(n=>Object.values(n.spec.outputs).some(t=>(t as string)==='surface'||(t as string)==='audio')).map(n=>{
    const end=sourceEnd(ref(n.spec.id),n.spec.time.start??0);if(end===undefined)throw new EngineError('E_OUTPUT_RANGE',`Stage '${n.spec.id}' needs a finite Composition/Stage duration or Layer range.`,{stageId:n.spec.id});return end;
  })));
  if(!Number.isSafeInteger(durationInFrames)||durationInFrames<=0)throw new EngineError('E_OUTPUT_EMPTY','Composition has no finite output content.');
  const result:TVG={schemaVersion:'0.1',composition:{id:props.id??'composition',width:props.width,height:props.height,fps,
    durationInFrames,background:props.background??'#000000',seed:props.seed??1},stages:[],layers:[],resources:[],effects:[...builtinEffects,...(props.effects??[])]};
  const layers:LayerNode[]=[];
  for (const node of nodes) {
    if (!('$node' in node)) throw new EngineError('E_JSX_CHILD','Composition children must be Stage, Layer or Resource nodes.');
    if (node.$node==='stage') {
      const {time,...spec}=node.spec;
      const selection=stageEngineSelection(node.spec);
      if(selection){const requirements=[...selection.requirements,...engineRequirements(node)];spec.engine=resolveStageEngine(spec.id,selection.explicit,requirements);attachEngineSelection(spec,{...selection,requirements});}
      result.stages.push({...spec,time:{start:time.start??0,duration:time.duration??durationInFrames-(time.start??0),offset:time.offset??0,rate:time.rate??{num:1,den:1}}});
      completeCompositeTimes(result.stages[result.stages.length-1]);
    } else if (node.$node==='resource') result.resources.push(node.spec);
    else if (node.$node==='layer') layers.push(node);
  }
  let layerIndex=0;
  const addLayer=(node:LayerNode,parent?:string):void=> {
    if(node.props.enabled===false)return;
    const {children,enabled,source,...spec}=node.props;
    const descriptor=isContentReference(source)?source:undefined;
    const sourceRef=descriptor?.source??source as PortRef|undefined;
    const producer=sourceRef?stageById.get(sourceRef.$ref):undefined;
    const actual=sourceRef?producer?.outputs[sourceRef.port] as string|undefined:undefined;
    if(descriptor)contentDuration(descriptor,fps);
    if(descriptor&&actual!==(descriptor.kind==='audio'?'audio':'surface'))throw new EngineError('E_LAYER_CONTENT',`Layer content '${descriptor.kind}' does not match source port '${actual??'missing'}'.`,{details:{source:sourceRef,kind:descriptor.kind,actual}});
    const start=spec.start??producer?.time.start??0;
    let end=spec.end??durationInFrames;
    if(spec.end===undefined&&descriptor&&descriptor.kind!=='image'){
      const sourceEnd=layerSourceEnd(node.props);if(sourceEnd!==undefined)end=Math.min(end,sourceEnd);
    }else if(spec.end===undefined&&producer?.time.duration!==undefined)end=Math.min(end,(producer.time.start??0)+producer.time.duration);
    if(actual==='surface'&&(spec.gain!==undefined||spec.pan!==undefined||spec.audio!==undefined))throw new EngineError('E_LAYER_MEDIA','Audio attributes require an audio source.');
    if(actual==='audio'&&[...transformProperties,'blend','effects','isolation','mask'].some(k=>Object.hasOwn(spec,k)))throw new EngineError('E_LAYER_MEDIA','Visual attributes require a surface source.');
    const id=spec.id??`layer-${layerIndex++}`;
    const audio=descriptor?.kind==='audio'?{...spec.audio,sourceEndSample:spec.audio?.sourceEndSample??descriptor.durationSamples}:spec.audio;
    result.layers.push({...spec,...sourceRef?{source:sourceRef}:{},...audio?{audio}:{},id,start,end,...(spec.parent??parent?{parent:spec.parent??parent}:{})});
    if(descriptor?.kind==='video'&&descriptor.audio){
      const audioParent=spec.parent??parent;
      addLayer({$node:'layer',props:{id:`${id}-audio`,source:descriptor.audio,start,end,...audioParent?{parent:audioParent}:{}}},parent);
    }
    for (const child of flatten(children)) {
      if (!('$node' in child) || child.$node!=='layer') throw new EngineError('E_JSX_CHILD','Layer children must be Layer nodes.');
      addLayer(child,id);
    }
  };
  layers.forEach(layer=>addLayer(layer));
  if (!layerNodes.length) for (const stage of result.stages) {
    const surface=Object.entries(stage.outputs).find(([,type])=>type==='surface');
    if (surface) result.layers.push({id:`${stage.id}-layer`,source:ref(stage.id,surface[0]),start:stage.time.start,end:stage.time.start+stage.time.duration});
    const audio=Object.entries(stage.outputs).find(([,type])=>type==='audio');
    if(audio)result.layers.push({id:`${stage.id}-audio-layer`,source:ref(stage.id,audio[0]),start:stage.time.start,end:stage.time.start+stage.time.duration});
  }
  return result;
}
export const Video=Composition;
