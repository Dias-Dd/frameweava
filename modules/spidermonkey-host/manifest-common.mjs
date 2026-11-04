// Apache-2.0. Pure part of src/compiler/evaluate.mjs, extracted for the same
// Symbol/factory/inline-effect/authoring contract. No second TVG/Graph evaluator.
export async function normalizeManifest(mod,entryBasename){
 let project=typeof mod.default==='function'?await mod.default():mod.default;
 const selections={},selectionKey=Symbol.for('@frameweave/engine.stage-engine-selection'),factoryKey=Symbol.for('@frameweave/engine.native-stage-factory'),effectKey=Symbol.for('@frameweave/engine.effect-module');
 const inlineEffects=Object.fromEntries(Object.entries(mod).filter(([,value])=>value?.[effectKey]).map(([name,value])=>[`${value.manifest.id}@${value.manifest.version}`,{manifest:value.manifest,entry:`./${entryBasename}`,exportName:name}]));
 if(project&&Array.isArray(project.stages))project={...project,stages:project.stages.map(stage=>{
  if(stage[selectionKey])selections[stage.id]=stage[selectionKey];
  if(stage.entry==='@frameweave/plugin-stage'&&Object.keys(inlineEffects).length)stage={...stage,props:{...stage.props,$inlineEffects:inlineEffects}};
  const factory=stage?.[factoryKey];if(!factory)return stage;
  const binding=Object.entries(mod).find(([name,value])=>name!=='default'&&value===factory);
  if(!binding)throw Object.assign(new Error(`Stage '${stage.id}' factory must be a named export of the project entry. Export the function/const (or re-export it), or use entry + exportName for another module.`),{code:'E_STAGE_FACTORY_EXPORT',stageId:stage.id});
  const resolved={...stage,entry:`./${entryBasename}`,exportName:binding[0]};delete resolved[factoryKey];return resolved;
 })};
 const ancestors=new Set();let nodes=0;
 function check(value,path='$',depth=0){
  if(depth>96||++nodes>2_000_000)throw new Error(`TVG nesting/object budget exceeded at ${path}`);
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'&&Number.isFinite(value))return;
  if(!value||typeof value!=='object')throw new Error(`Non-serializable TVG field ${path}: ${typeof value}. Use an expression AST or a native Stage module.`);
  if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`Non-JSON TVG object at ${path}`);
  if(ancestors.has(value))throw new Error(`Cyclic TVG object at ${path}`);
  if(Object.getOwnPropertyDescriptor(value,'toJSON'))throw new Error(`TVG toJSON cannot disguise data at ${path}`);
  ancestors.add(value);for(const key of Object.keys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(!('value'in d))throw new Error(`TVG accessor is not plain data at ${path}.${key}`);check(d.value,`${path}.${key}`,depth+1);}ancestors.delete(value);
 }
 check(project);const text=JSON.stringify(project,null,2);if(!text)throw new Error('Project must have a default Composition export.');
 return {text,authoring:JSON.stringify(selections)};
}
