// Deliberately a separate process. This limits crashes/time/heap, not filesystem privilege.
// This development edition accepts TRUSTED project code only.
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
const [entry, output, originalEntry] = process.argv.slice(2);
try {
  const mod = await import(pathToFileURL(entry).href);
  let project = typeof mod.default === 'function' ? await mod.default() : mod.default;
  const selections={};
  const selectionKey=Symbol.for('@frameweave/engine.stage-engine-selection');
  const factoryKey = Symbol.for('@frameweave/engine.native-stage-factory');
  const effectKey=Symbol.for('@frameweave/engine.effect-module');
  const inlineEffects=Object.fromEntries(Object.entries(mod).filter(([,value])=>value?.[effectKey]).map(([name,value])=>[
    `${value.manifest.id}@${value.manifest.version}`,{manifest:value.manifest,entry:`./${basename(originalEntry)}`,exportName:name}
  ]));
  if (project && Array.isArray(project.stages)) {
    project = {...project,stages:project.stages.map(function resolveStage(stage){
      if(stage.composition)stage={...stage,composition:{...stage.composition,stages:stage.composition.stages.map(resolveStage)}};
      if(stage[selectionKey])selections[stage.id]=stage[selectionKey];
      if(stage.entry==='@frameweave/plugin-stage'&&Object.keys(inlineEffects).length)stage={...stage,props:{...stage.props,$inlineEffects:inlineEffects}};
      const factory=stage?.[factoryKey];
      if (!factory) return stage;
      const binding=Object.entries(mod).find(([name,value])=>name!=='default' && value===factory);
      if (!binding) throw Object.assign(new Error(`Stage '${stage.id}' factory must be a named export of the project entry. Export the function/const (or re-export it), or use entry + exportName for another module.`),{code:'E_STAGE_FACTORY_EXPORT',stageId:stage.id});
      const resolved={...stage,entry:`./${basename(originalEntry)}`,exportName:binding[0]};
      delete resolved[factoryKey];
      return resolved;
    })};
  }
  const ancestors = new Set();
  function check(value) {
    const pending=[{value,path:'$'}];while(pending.length){const {value,path,exit}=pending.pop();if(exit){ancestors.delete(value);continue;}
      if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))continue;
      if(!value||typeof value!=='object')throw new Error(`Non-serializable TVG field ${path}: ${typeof value}`);
      if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`Non-JSON TVG object at ${path}`);
      if(ancestors.has(value))throw new Error(`Cyclic TVG object at ${path}`);ancestors.add(value);pending.push({value,path,exit:true});
      for(const [key,item]of Object.entries(value))pending.push({value:item,path:`${path}.${key}`});
    }
  }
  // Check before JSON invokes toJSON: live Date/engine objects cannot disguise themselves.
  check(project);
  const text = JSON.stringify(project, null, 2);
  if (!text) throw new Error('Project must have a default Composition export.');
  await writeFile(output, text);
  await writeFile(`${output}.authoring.json`,JSON.stringify(selections));
} catch (error) {
  const issue={code:error?.code??'E_PROJECT',message:error?.message??String(error),stageId:error?.stageId,details:error?.details??error?.stack};
  // Project logging must not corrupt the structured build-error transport.
  await writeFile(`${output}.error.json`,JSON.stringify(issue));
  console.error(JSON.stringify(issue));
  process.exitCode = 1;
}
