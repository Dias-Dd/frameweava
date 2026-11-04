import type { EffectDefinition, EffectUse, Json } from './types.js';
import { EngineError } from './errors.js';

export const builtinEffects: EffectDefinition[] = [
  { id:'blur',name:'Gaussian blur',version:'1.0.0',engine:'web',kind:'canvas-filter',
    parameters:{radius:{type:'number',default:0,min:0,max:200}},inputs:{surface:'surface'},outputs:{surface:'surface'},
    implementation:{filter:'blur',parameter:'radius',unit:'px'} },
  { id:'brightness',name:'Brightness',version:'1.0.0',engine:'web',kind:'canvas-filter',
    parameters:{amount:{type:'number',default:1,min:0,max:10}},inputs:{surface:'surface'},outputs:{surface:'surface'},
    implementation:{filter:'brightness',parameter:'amount',unit:''} }
];
export function resolveEffectParameters(definition: EffectDefinition, values: Record<string,Json> = {}): Record<string,Json> {
  const result: Record<string,Json>={};
  for (const name of Object.keys(values)) if (!(name in definition.parameters))
    throw new EngineError('E_EFFECT_PARAM', `Effect ${definition.id} has no parameter '${name}'.`);
  for (const [name,schema] of Object.entries(definition.parameters)) {
    const value=name in values ? values[name] : schema.default;
    if (value===undefined || value===null || typeof value!==schema.type || (typeof value==='number' && !Number.isFinite(value)))
      throw new EngineError('E_EFFECT_PARAM', `Effect ${definition.id}.${name} requires a ${schema.type}.`);
    if (typeof value==='number' && ((schema.min!==undefined && value<schema.min)||(schema.max!==undefined && value>schema.max)))
      throw new EngineError('E_EFFECT_PARAM', `Effect ${definition.id}.${name} is outside its declared range.`);
    if (schema.enum && !schema.enum.includes(value)) throw new EngineError('E_EFFECT_PARAM', `Invalid value for effect ${definition.id}.${name}.`);
    result[name]=value;
  }
  return result;
}
/** Imported local modules can export effect manifests; executable non-canvas forms are reserved. */
export class EffectRegistry {
  private definitions = new Map<string,EffectDefinition>();
  constructor(definitions: EffectDefinition[] = builtinEffects) { for (const definition of definitions) this.register(definition); }
  register(definition: EffectDefinition): this {
    if (!definition.id || !definition.version || !definition.name) throw new EngineError('E_EFFECT_SCHEMA','An effect needs id, name and version.');
    if (this.definitions.has(definition.id)) throw new EngineError('E_EFFECT_DUPLICATE',`Duplicate effect id '${definition.id}'.`);
    if (!definition.parameters || !definition.inputs || !definition.outputs) throw new EngineError('E_EFFECT_SCHEMA',`Effect ${definition.id} needs parameter/input/output schemas.`);
    this.definitions.set(definition.id,definition); return this;
  }
  get(id: string): EffectDefinition {
    const effect=this.definitions.get(id); if (!effect) throw new EngineError('E_EFFECT_REF',`Unknown effect '${id}'.`); return effect;
  }
  resolve(use: EffectUse): { definition: EffectDefinition; params: Record<string,Json> } {
    const definition=this.get(use.id); return {definition,params:resolveEffectParameters(definition,use.params)};
  }
  list(): EffectDefinition[] { return [...this.definitions.values()]; }
}
export function registerEffect(definition: EffectDefinition): EffectDefinition {
  // Manifest factory, not mutable global state: composition explicitly includes returned plugins.
  new EffectRegistry([]).register(definition); return definition;
}
