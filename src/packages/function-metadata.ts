import {EngineError} from '../core/errors.ts';

export const FUNCTION_METADATA = 'frameweave.functions.json';

export interface PresetMetadata {
  name:string;
  description:string;
  example:string;
  tags?:string[];
}

export interface FunctionMetadata {
  name:string;
  level:'authoring'|'low-level';
  description:string;
  example:string;
  exampleKind?:'project-file';
  contract?:{input:string;output:string};
  tags?:string[];
  /** Additional named exports from the same package used in the example. */
  imports?:string[];
  presets?:PresetMetadata[];
}

/** Adapt the already-shipped spatial authoring guide without altering any package bytes. */
export function spatialFunctionGuide(text:string,reference:string,hasFile:(path:string)=>boolean):FunctionMetadata[]{
  const guide=JSON.parse(text) as {package?:unknown;functions?:unknown};
  if(!guide||guide.package!==reference||!Array.isArray(guide.functions))
    throw new EngineError('E_PACKAGE_FUNCTIONS',`Invalid creation-guide.json in ${reference}`);
  return guide.functions.flatMap(f=>{
    if(!f||typeof f.name!=='string'||typeof f.purpose!=='string'||typeof f.example!=='string'||typeof f.output!=='string')return [];
    const exampleFile=/^examples\/[\w.-]+\.(?:ts|tsx)$/.test(f.example);
    if(exampleFile&&!hasFile(f.example))return [];
    return [{
      name:f.name,description:f.purpose,example:f.example,
      ...typeof f.input==='string'?{contract:{input:f.input,output:f.output}}:{},
      ...(exampleFile?{exampleKind:'project-file' as const}:{}),
      level:/^(?:Promise<)?CreationStage\b/.test(f.output)?'authoring' as const:'low-level' as const,
    }];
  });
}

/** Descriptions and snippets are publisher-supplied text, never executable discovery code. */
export function parseFunctionMetadata(text:string,reference:string):FunctionMetadata[]{
  const invalid=()=>new EngineError('E_PACKAGE_FUNCTIONS',`Invalid ${FUNCTION_METADATA} in ${reference}`);
  let value:unknown;
  try{value=JSON.parse(text);}catch{throw invalid();}
  const data=value as {schemaVersion?:unknown;functions?:unknown};
  if(!data||data.schemaVersion!==1||!Array.isArray(data.functions))throw invalid();
  const names=new Set<string>();
  const nonempty=(v:unknown)=>typeof v==='string'&&v.trim().length>0;
  const identifier=(v:unknown)=>typeof v==='string'&&/^[$A-Za-z_][$\w]*$/.test(v);
  const validTags=(v:unknown)=>v===undefined||Array.isArray(v)&&v.every(nonempty);
  for(const f of data.functions){
    if(!f||!identifier(f.name)||names.has(f.name)||
      !['authoring','low-level'].includes(f.level)||!nonempty(f.description)||!nonempty(f.example)||
      !validTags(f.tags)||
      f.imports!==undefined&&(!Array.isArray(f.imports)||!f.imports.every(identifier))||
      f.contract!==undefined&&(!f.contract||!nonempty(f.contract.input)||!nonempty(f.contract.output)))throw invalid();
    names.add(f.name);
    if(f.presets===undefined)continue;
    if(!Array.isArray(f.presets))throw invalid();
    const presetNames=new Set<string>();
    for(const preset of f.presets){
      if(!preset||typeof preset.name!=='string'||!/^[$a-z0-9][\w.$-]*$/i.test(preset.name)||
        presetNames.has(preset.name.toLowerCase())||!nonempty(preset.description)||!nonempty(preset.example)||!validTags(preset.tags))throw invalid();
      presetNames.add(preset.name.toLowerCase());
    }
  }
  return data.functions.map(({name,level,description,example,tags,imports,contract,presets})=>({
    name,level,description,example,tags,imports,contract:contract?{input:contract.input,output:contract.output}:undefined,
    ...presets?{presets:presets.map(({name,description,example,tags}:PresetMetadata)=>({name,description,example,tags}))}:{},
  }));
}
