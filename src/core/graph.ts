import {validateComposites} from '../../modules/stage-orchestration/composite-validation.ts';
import {isProfessionalSurface,assertProfessionalSurface} from '../media/surface.ts';
import {isAudioDescriptor,assertAudioBlock} from '../audio/block.ts';
import {assertAudioMetadata} from '../audio/contract.ts';
import type { Diagnostic, Expression, Json, PortRef, PortType, StageSpec, TVG } from './types.js';
import { EngineError, diagnostic } from './errors.js';
import { EXPRESSION_OPERATIONS, spring, validateKeyframes } from './animation.js';
import { EffectRegistry } from './effects.js';
import { stageFactory } from './native-source.ts';
import { inputTypeAccepts, normalizeInputPort, validateInputSchema } from './ports.js';

export function isPortRef(value:unknown):value is PortRef {
  return !!value && typeof value==='object' && '$ref' in value && typeof value.$ref==='string' && 'port' in value && typeof value.port==='string';
}
export function stageDependencies(stage:StageSpec):string[] {
  return [...new Set(Object.values(stage.inputs).filter(isPortRef).map(input=>input.$ref))];
}
/** Stable Kahn levels execute independent branches concurrently, with no hidden dependencies. */
export function topologicalLevels(stages:StageSpec[]):StageSpec[][] {
  const ids=new Map<string,StageSpec>();
  for (const stage of stages) {
    if (ids.has(stage.id)) throw new EngineError('E_STAGE_DUPLICATE',`Duplicate Stage '${stage.id}'.`);
    ids.set(stage.id,stage);
  }
  const pending=new Map(stages.map(stage=>[stage.id,new Set(stageDependencies(stage))]));
  for (const [id,deps] of pending) for (const dep of deps) if (!ids.has(dep)) throw new EngineError('E_STAGE_REF',`Stage '${id}' references missing Stage '${dep}'.`,{stageId:id});
  const result:StageSpec[][]=[];
  while (pending.size) {
    const ready=stages.filter(stage=>pending.has(stage.id)&&pending.get(stage.id)!.size===0);
    if (!ready.length) {
      // Follow only unresolved edges to provide an actual cycle, not an unrelated blocked node.
      const visited=new Set<string>(),stack:string[]=[],onStack=new Set<string>(); let cycle:string[]=[];
      const visit=(id:string):boolean=> {
        if (onStack.has(id)) { cycle=[...stack.slice(stack.indexOf(id)),id]; return true; }
        if (visited.has(id)) return false;
        visited.add(id); stack.push(id); onStack.add(id);
        for (const dependency of pending.get(id)??[]) if (visit(dependency)) return true;
        stack.pop(); onStack.delete(id); return false;
      };
      for (const id of pending.keys()) if (visit(id)) break;
      throw new EngineError('E_DAG_CYCLE',`Stage dependency cycle: ${cycle.join(' -> ')}.`,{details:{cycle}});
    }
    result.push(ready);
    for (const stage of ready) pending.delete(stage.id);
    for (const dependencies of pending.values()) for (const stage of ready) dependencies.delete(stage.id);
  }
  return result;
}
export function validatePortValue(type:PortType,value:unknown):boolean {
  if(type==='audio'){try{assertAudioBlock(value);return true;}catch{return false;}}
  if(type==='json'&&isAudioDescriptor(value))return false;
  if(type==='surface'&&isProfessionalSurface(value)){try{assertProfessionalSurface(value);return true;}catch{return false;}}
  if (type==='surface') return !!value && typeof value==='object' && (value as any).kind==='surface' && (value as any).format==='png' &&
    Number.isInteger((value as any).width) && (value as any).width>0 && Number.isInteger((value as any).height) && (value as any).height>0 &&
    typeof (value as any).dataUrl==='string' && (value as any).dataUrl.startsWith('data:image/png;base64,');
  if (type==='number') return typeof value==='number' && Number.isFinite(value);
  if (type==='string'||type==='boolean') return typeof value===type;
  try { assertJson(value); return true; } catch { return false; }
}
export function assertJson(value:unknown,path='$',ancestors=new Set<object>(),depth=0):asserts value is Json {
  type Work={value:unknown;path:string;exit?:boolean};const work:Work[]=[{value,path}];
  while(work.length){const item=work.pop()!,v=item.value,p=item.path;if(item.exit){ancestors.delete(v as object);continue;}
   if(v===null||typeof v==='string'||typeof v==='boolean')continue;
   if(typeof v==='number'){if(Number.isFinite(v))continue;throw new EngineError('E_SERIALIZE',`Non-finite number at ${p}.`);}
   if(!v||typeof v!=='object')throw new EngineError('E_SERIALIZE',`Unsupported ${typeof v} at ${p}; use expression ASTs or a native Stage module.`);
   if(ancestors.has(v))throw new EngineError('E_SERIALIZE',`Cyclic object at ${p}.`);
   if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw new EngineError('E_SERIALIZE',`Non-plain object at ${p}; native runtime objects cannot cross Stage boundaries.`);
   ancestors.add(v);work.push({value:v,path:p,exit:true});for(const [key,value]of Object.entries(v))work.push({value,path:`${p}.${key}`});
  }
}
function validateExpression(node:Expression):void {
  if (!EXPRESSION_OPERATIONS.has(node.$expr)||!Array.isArray(node.args)) throw new EngineError('E_EXPRESSION',`Unknown or invalid expression ${node.$expr}.`);
  const zero=['time','frame','globalTime','globalFrame','progress'],unary=['sin','cos','abs','floor','ceil','random'],binary=['sub','div','pow','mod'];
  if ((zero.includes(node.$expr)&&node.args.length!==0)||(unary.includes(node.$expr)&&node.args.length!==1)||(binary.includes(node.$expr)&&node.args.length!==2)||
      (node.$expr==='clamp'&&node.args.length!==3)||(['min','max'].includes(node.$expr)&&node.args.length===0))
    throw new EngineError('E_EXPRESSION',`Expression ${node.$expr} has the wrong argument count.`);
  for (const arg of node.args) {
    if (typeof arg==='number') { if (!Number.isFinite(arg)) throw new EngineError('E_EXPRESSION','Expression constants must be finite.'); }
    else if (arg && typeof arg==='object' && '$expr' in arg) validateExpression(arg);
    else throw new EngineError('E_EXPRESSION','Expression arguments must be numbers or expression nodes.');
  }
}
export function checkSignals(value:unknown):void {
  if (!value||typeof value!=='object') return;
  if ('$keyframes' in value) { validateKeyframes(value.$keyframes); return; }
  if ('$expr' in value) { validateExpression(value as Expression); return; }
  if ('$spring' in value) { const p=(value as any).$spring; if (!p||typeof p!=='object') throw new EngineError('E_SPRING','Invalid spring.'); spring(p); return; }
  for (const item of Object.values(value)) checkSignals(item);
}
function checkVisualProperties(value:Record<string,unknown>):void {
  const numeric=['x','y','scale','scaleX','scaleY','rotation','opacity','originX','originY','fontSize','letterSpacing','lineHeight','width','height','radius','strokeWidth'];
  for (const property of numeric) {
    const signal=value[property];if(signal===undefined)continue;
    if (typeof signal==='number'&&Number.isFinite(signal)) {
      if (['width','height','radius','fontSize','strokeWidth'].includes(property)&&signal<0) throw new EngineError('E_VISUAL_VALUE',`${property} cannot be negative.`);
      continue;
    }
    if (signal&&typeof signal==='object'&&('$expr' in signal||'$spring' in signal)) continue;
    if (signal&&typeof signal==='object'&&'$keyframes' in signal&&Array.isArray(signal.$keyframes)&&signal.$keyframes.every(key=>typeof key.value==='number')) continue;
    throw new EngineError('E_VISUAL_VALUE',`${property} must be a finite number or numeric animation signal.`);
  }
  for (const property of ['fill','stroke']) {
    const signal=value[property];if(signal===undefined)continue;
    if (typeof signal==='string') continue;
    if (signal&&typeof signal==='object'&&'$keyframes' in signal&&Array.isArray(signal.$keyframes)&&signal.$keyframes.every(key=>typeof key.value==='string'))continue;
    throw new EngineError('E_VISUAL_VALUE',`${property} must be a color string or color keyframe signal.`);
  }
}
const PORT_TYPES:PortType[]=['surface','audio','number','string','boolean','json'];
const idPattern=/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const transformProperties=['x','y','scale','scaleX','scaleY','rotation','opacity','originX','originY'];
const visualProperties=[...transformProperties,'kind','id','start','end','children','content','fontFamily','fontSize','fontWeight','letterSpacing','lineHeight','align','width','height','radius','fill','stroke','strokeWidth','key'];
function knownProperties(value:object,allowed:readonly string[],name:string):void {
  for(const property of Object.keys(value))if(!allowed.includes(property))
    throw new EngineError('E_UNKNOWN_PROPERTY',`${name} has no property '${property}'.`,{details:{component:name,property}});
}
export interface TVGValidationOptions { allowUnresolvedInputContracts?:boolean }
export function validateTVG(tvg:TVG,options:TVGValidationOptions={}):Diagnostic[] {
  const issues:Diagnostic[]=[];
  const error=(code:string,message:string,context:Partial<Diagnostic>={})=>issues.push({code,severity:'error',message,...context});
  const attempt=(operation:()=>void,context:Partial<Diagnostic>={})=>{try{operation();}catch(err){issues.push({...diagnostic(err),...context});}};
  // Serialization failure can include a cycle. Do not continue recursively traversing that input.
  try { assertJson(tvg); } catch(err) {
    // Preserve precise input-contract errors even if a malformed schema/literal
    // is also non-serializable. The bounded port validator safely handles cycles.
    const inputIssues=Array.isArray(tvg?.stages)?tvg.stages.filter(stage=>stage && typeof stage==='object').flatMap(stage=>validateInputSchema(stage,options)):[];
    return [...inputIssues,diagnostic(err)];
  }
  if (!tvg || typeof tvg!=='object' || tvg.schemaVersion!=='0.1') {error('E_SCHEMA','Unsupported TVG schema; expected 0.1.');return issues;}
  attempt(()=>knownProperties(tvg,['schemaVersion','composition','stages','layers','resources','effects'],'TVG'));
  const c=tvg.composition;
  if (!c||!Array.isArray(tvg.stages)||!Array.isArray(tvg.layers)||!Array.isArray(tvg.resources)||!Array.isArray(tvg.effects)) {
    error('E_SCHEMA','TVG requires composition, stages, layers, resources and effects.');return issues;
  }
  attempt(()=>knownProperties(c,['id','width','height','fps','durationInFrames','background','seed'],'Composition'));
  if(c.fps && typeof c.fps==='object')attempt(()=>knownProperties(c.fps,['num','den'],'Composition FPS'));
  for (const field of ['width','height','durationInFrames'] as const) if (!Number.isSafeInteger(c[field])||c[field]<=0) error('E_COMPOSITION',`${field} must be a positive safe integer.`);
  const nativeComposition=tvg.stages.some(s=>s?.engine==='native-gpu')&&tvg.stages.every(s=>s?.engine==='native-gpu'||s?.engine==='audio');
  // Native allocation, texture/dispatch limits and whole-frame budgets are
  // admitted by the actual owner. Mixed/Web projects retain their old policy.
  if (!nativeComposition&&(c.width>16384||c.height>16384)) error('E_DIMENSIONS','Composition dimensions exceed the development renderer limit of 16384.');
  if (!c.fps||!Number.isSafeInteger(c.fps.num)||!Number.isSafeInteger(c.fps.den)||c.fps.num<=0||c.fps.den<=0) error('E_TIME','FPS must be a positive rational.');
  if (!Number.isSafeInteger(c.seed)) error('E_SEED','Composition seed must be a safe integer.');
  if (typeof c.background!=='string'||!c.background) error('E_BACKGROUND','Composition background must be a CSS color string.');
  const stages=new Map<string,StageSpec>();
  for (const s of tvg.stages) {
    if (!s||typeof s!=='object') {error('E_STAGE','A Stage must be an object.');continue;}
    const context={stageId:s.id};
    attempt(()=>knownProperties(s,['id','engine','entry','exportName','nodes','inputs','inputTypes','outputs','props','time','seek','width','height','audio','composition','key'],'Stage'),context);
    if(s.audio!==undefined)attempt(()=>assertAudioMetadata(s.audio),context);
    if(s.engine==='audio'&&(!s.audio||s.seek!=='stateless'||!s.entry&&!stageFactory(s)))error('E_AUDIO_STAGE','Audio Stage requires versioned metadata, a module entry/factory and stateless seek',context);
    if(s.audio&&s.time?.rate&&s.time.rate.num!==s.time.rate.den)error('E_AUDIO_TIME_MAPPING','Audio v1 requires explicit unit rate',context);
    if(s.time && typeof s.time==='object')attempt(()=>knownProperties(s.time,['start','duration','offset','rate'],'Stage time'),context);
    if(s.time?.rate && typeof s.time.rate==='object')attempt(()=>knownProperties(s.time.rate,['num','den'],'Stage rate'),context);
    if (typeof s.id!=='string'||!idPattern.test(s.id)) error('E_STAGE_ID',`Invalid Stage id '${s.id}'. Use letters, digits, underscores and hyphens.`,context);
    if (stages.has(s.id)) error('E_STAGE_DUPLICATE',`Duplicate Stage '${s.id}'.`,context); else stages.set(s.id,s);
    if (typeof s.engine!=='string'||!s.engine) error('E_STAGE_ENGINE','Stage requires an execution engine.',context);
    if(s.engine==='web')error('E_WEB_REMOVED','Web Stages were removed; use Servo within a Native Stage.',context);
    if (s.entry&&s.nodes) error('E_STAGE_ENTRY','Stage cannot have both entry and declarative nodes.',context);
    if (s.exportName!==undefined && (typeof s.exportName!=='string'||!s.exportName||!s.entry)) error('E_STAGE_EXPORT','A named Stage export requires an entry module and a nonempty export name.',context);
    if (!s.inputs||typeof s.inputs!=='object'||Array.isArray(s.inputs)||!s.outputs||typeof s.outputs!=='object'||Array.isArray(s.outputs)||!s.props||typeof s.props!=='object'||Array.isArray(s.props)) {
      error('E_STAGE_SCHEMA','Stage inputs, outputs and props must be objects.',context);continue;
    }
    issues.push(...validateInputSchema(s,options));
    for (const [port,type] of Object.entries(s.outputs)) if (!port||!PORT_TYPES.includes(type)) error('E_PORT_TYPE',`Invalid output port '${port}' type '${type}'.`,context);
    if (Object.values(s.outputs).filter(type=>type==='surface').length>1) error('E_PORT_TYPE','A visual Stage exports one RGBA surface at most; JSON outputs may be numerous.',context);
    if (!s.time || !Number.isSafeInteger(s.time.start)||s.time.start<0||!Number.isSafeInteger(s.time.duration)||s.time.duration<=0||s.time.start+s.time.duration>c.durationInFrames)
      error('E_TIME_RANGE','Stage time range must fit inside the composition using nonnegative integer frames.',context);
    if (!s.time||!Number.isFinite(s.time.offset)||!s.time.rate||!Number.isSafeInteger(s.time.rate.num)||!Number.isSafeInteger(s.time.rate.den)||s.time.rate.den<=0)
      error('E_TIME','Stage mapping needs finite offset, integer rate numerator and positive integer denominator.',context);
    if (!['stateless','fixed-step'].includes(s.seek)) error('E_SEEK_MODE',`Unknown Stage seek mode '${s.seek}'.`,context);
    for (const field of ['width','height'] as const) if (s[field]!==undefined&&(!Number.isSafeInteger(s[field])||s[field]!<=0||s.engine!=='native-gpu'&&s[field]!>16384)) error('E_DIMENSIONS',s.engine==='native-gpu'?`Stage ${field} must be a positive safe integer.`:`Stage ${field} must be a positive integer no larger than 16384.`,context);
    attempt(()=>checkSignals(s.props),context); attempt(()=>checkSignals(s.nodes),context);
    const walkNodes=(nodes:unknown):void=> {
      if (!Array.isArray(nodes)) {error('E_VISUAL_NODE','Declarative nodes must be an array.',context);return;}
      for (const node of nodes) {
        if (!node||!['group','text','rect','circle'].includes(node.kind)) {error('E_VISUAL_NODE','Unknown declarative node kind.',context);continue;}
        attempt(()=>knownProperties(node,visualProperties,`${node.kind} visual`),context);
        if (node.kind==='text'&&typeof node.content!=='string') error('E_TEXT','Text content must be a string; build strings in TS or use native Stage code.',context);
        attempt(()=>checkVisualProperties(node),context);
        if ((node.start!==undefined&&(!Number.isFinite(node.start)||node.start<0))||(node.end!==undefined&&(!Number.isFinite(node.end)||node.end<=(node.start??0)))) error('E_TIME_RANGE','Visual node interval must have nonnegative start and end > start.',context);
        if (node.children) walkNodes(node.children);
      }
    };
    if (s.nodes) walkNodes(s.nodes);
  }
  if (tvg.stages.every(s=>s?.inputs&&typeof s.inputs==='object')) attempt(()=>{topologicalLevels(tvg.stages);});
  for (const stage of tvg.stages) for (const [name,input] of Object.entries(stage?.inputs??{})) {
    if (input&&typeof input==='object'&&'$ref' in input&&!isPortRef(input)) {error('E_PORT_REF',`Invalid input reference '${name}'.`,{stageId:stage.id});continue;}
    if (!isPortRef(input)) continue;
    attempt(()=>knownProperties(input,['$ref','port'],'Input reference'),{stageId:stage.id});
    const source=stages.get(input.$ref);
    if (!source) {error('E_STAGE_REF',`Input '${name}' references missing Stage '${input.$ref}'.`,{stageId:stage.id});continue;}
    if (!source.outputs||!(input.port in source.outputs)) error('E_PORT_REF',`Input '${name}' references missing output '${input.$ref}.${input.port}'.`,{stageId:stage.id});
    else if(stage.inputTypes && Object.prototype.hasOwnProperty.call(stage.inputTypes,name)) {
      try{
        const expected=normalizeInputPort(stage.inputTypes[name]).type,actual=source.outputs[input.port];
        if(PORT_TYPES.includes(actual) && !inputTypeAccepts(expected,actual))
          error('E_INPUT_TYPE',`Stage '${stage.id}' input '${name}' expects ${expected}, but '${input.$ref}.${input.port}' produces ${actual}.`,{stageId:stage.id,details:{input:name,expected,producer:input.$ref,port:input.port,actual}});
      }catch{/* Invalid descriptors were reported by validateInputSchema above. */}
    }
    if (source.time&&stage.time&&(stage.time.start<source.time.start||stage.time.start+stage.time.duration>source.time.start+source.time.duration)) error('E_INACTIVE_INPUT',`Stage '${stage.id}' is active outside input producer '${source.id}'.`,{stageId:stage.id});
  }
  const layers=new Map<string,TVG['layers'][number]>();
  for (const layer of tvg.layers) {
    if (!layer||typeof layer!=='object') {error('E_LAYER','Layer must be an object.');continue;}
    attempt(()=>knownProperties(layer,[...transformProperties,'id','name','gain','pan','audio','source','parent','start','end','blend','effects','isolation','mask','key'],'Layer'));
    if (!layer.id||layers.has(layer.id)) error('E_LAYER_DUPLICATE',`Missing or duplicate Layer id '${layer.id}'.`);else layers.set(layer.id,layer);
    if (!Number.isSafeInteger(layer.start)||!Number.isSafeInteger(layer.end)||layer.start<0||layer.end<=layer.start||layer.end>c.durationInFrames) error('E_TIME_RANGE',`Layer '${layer.id}' has an invalid display interval.`);
    if(typeof layer.gain==='number'&&(!Number.isFinite(layer.gain)||layer.gain<0))error('E_AUDIO_GAIN','Layer gain must be finite and nonnegative.');
    if(typeof layer.pan==='number'&&(!Number.isFinite(layer.pan)||layer.pan< -1||layer.pan>1))error('E_AUDIO_PAN','Layer pan must be in [-1,1].');
    if(layer.name!==undefined&&typeof layer.name!=='string')error('E_LAYER','Layer name must be a string.');
    if(layer.audio){attempt(()=>knownProperties(layer.audio!,['startSample','sourceOffsetSamples','sourceEndSample'],'Layer audio'));for(const [k,v]of Object.entries(layer.audio))if(!Number.isSafeInteger(v)||v<0)error('E_AUDIO_INTERVAL',`Layer audio ${k} must be a nonnegative safe integer.`);if(layer.audio.sourceEndSample!==undefined&&layer.audio.sourceEndSample<=(layer.audio.sourceOffsetSamples??0))error('E_AUDIO_INTERVAL','Audio sourceEndSample must exceed sourceOffsetSamples.');}
    if (layer.blend&&!['source-over','screen','multiply','lighter'].includes(layer.blend)) error('E_BLEND',`Unknown Layer blend '${layer.blend}'.`);
    if(layer.isolation!==undefined&&!['isolated','pass-through'].includes(layer.isolation))error('E_MEDIA_GROUP','Invalid isolation mode');
    if(layer.mask){if(!isPortRef(layer.mask)||stages.get(layer.mask.$ref)?.outputs[layer.mask.port]!=='surface')error('E_MEDIA_MASK','Mask must reference an existing surface');}
    if (layer.source) {
      if (!isPortRef(layer.source)) {error('E_PORT_REF',`Invalid source on Layer '${layer.id}'.`);continue;}
      attempt(()=>knownProperties(layer.source!,['$ref','port'],'Layer source'));
      const source=stages.get(layer.source.$ref);
      if (!source) error('E_STAGE_REF',`Layer '${layer.id}' references missing Stage '${layer.source.$ref}'.`);
      else {
        const type=source.outputs?.[layer.source.port] as string|undefined;
        if (!['surface','audio'].includes(type??'')) error('E_PORT_TYPE',`Layer '${layer.id}' must reference a surface or formally supported audio output.`);
        if(type==='surface'&&(layer.gain!==undefined||layer.pan!==undefined||layer.audio!==undefined))error('E_LAYER_MEDIA',`Visual Layer '${layer.id}' cannot use audio attributes.`);
        if(type==='audio'&&[...transformProperties,'blend','effects','isolation','mask'].some(k=>Object.hasOwn(layer,k)))error('E_LAYER_MEDIA',`Audio Layer '${layer.id}' cannot use visual attributes.`);
        if (source.time&&(layer.start<source.time.start||layer.end>source.time.start+source.time.duration)) error('E_INACTIVE_INPUT',`Layer '${layer.id}' is visible outside Stage '${source.id}'.`);
      }
    }
    attempt(()=>checkSignals(layer));
    attempt(()=>checkVisualProperties(layer as unknown as Record<string,unknown>));
  }
  for (const layer of tvg.layers) {
    if (!layer||typeof layer!=='object') continue;
    const path=new Set<string>([layer.id]); let current=layer;
    while (current.parent) {
      if (!layers.has(current.parent)) {error('E_LAYER_REF',`Layer '${current.id}' has missing parent '${current.parent}'.`);break;}
      if (path.has(current.parent)) {error('E_LAYER_CYCLE',`Layer parent cycle includes '${current.parent}'.`);break;}
      path.add(current.parent); current=layers.get(current.parent)!;
    }
  }
  const resources=new Set<string>();
  for (const resource of tvg.resources) {
    if(resource && typeof resource==='object')attempt(()=>knownProperties(resource,['id','src','kind','key'],'Resource'));
    if (!resource||!resource.id||resources.has(resource.id)) error('E_RESOURCE_DUPLICATE',`Missing or duplicate resource id '${resource?.id}'.`);else resources.add(resource.id);
    if (!resource||typeof resource.src!=='string'||!resource.src) error('E_RESOURCE','Resource must have a nonempty local source path.');
    if (!resource||!['image','font','model','media','file'].includes(resource.kind)) error('E_RESOURCE','Unknown resource kind.');
  }
  let effects:EffectRegistry|undefined;
  attempt(()=>{effects=new EffectRegistry(tvg.effects);});
  if (effects) for (const layer of tvg.layers) for (const use of layer?.effects??[]) attempt(()=> {
    const {definition}=effects!.resolve(use);
    if (definition.kind!=='canvas-filter'||!definition.implementation) throw new EngineError('E_EFFECT_BACKEND',`Effect '${definition.id}' uses reserved kind '${definition.kind}', which is not executable in this edition.`);
    if (!['blur','brightness','contrast','saturate','hue-rotate'].includes(definition.implementation.filter)) throw new EngineError('E_EFFECT_BACKEND',`Unsupported filter '${definition.implementation.filter}'.`);
  });
  for (const effect of tvg.effects) for (const resource of effect.resources??[]) if (!resources.has(resource)) error('E_RESOURCE_REF',`Effect '${effect.id}' references missing resource '${resource}'.`);
  issues.push(...validateComposites(tvg,options));
  return issues;
}
export function assertValidTVG(tvg:TVG,options:TVGValidationOptions={}):TVG {
  const errors=validateTVG(tvg,options).filter(issue=>issue.severity==='error');
  if (errors.length) throw new EngineError('E_TVG',errors.map(error=>`${error.code}: ${error.message}`).join('\n'),{details:{diagnostics:errors}});
  return tvg;
}
