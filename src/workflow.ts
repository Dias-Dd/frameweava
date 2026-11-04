import {readFileSync} from 'node:fs';
import {mkdir,stat,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {userLibraryHome} from './plugins/paths.ts';
import {writeLock} from './plugins/registry.ts';
import {fail} from './plugins/schema.ts';

export const agentWorkflow=readFileSync(new URL('../docs/authoring/AGENTS.md',import.meta.url),'utf8');

export function workflowInfo(){return {version:1,userLibrary:userLibraryHome(),commands:{discover:'capabilities search "intent" --project <entry> --json',inspect:'capabilities inspect author.id@1.0.0',create:'effects create <new-directory> --id author.id --description "behavior"',validate:'effects validate <directory> --project <entry>',register:'effects install <directory> --project <entry>',pin:'effects lock --project <entry>',promote:'effects install <directory> --global',export:'export <entry> --single-file --output <chosen-name.tsx>'},policy:agentWorkflow};}

export async function initProject(args:string[]){
  if(args.length!==1)fail('E_ARGUMENT','init <new-project-directory>');const directory=resolve(args[0]);
  try{await stat(directory);fail('E_EXISTS',`Directory exists: ${directory}`);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  await mkdir(directory,{recursive:true});
  const source="/** @jsxImportSource @frameweave/engine */\nimport {Composition,Stage,Layer,ref} from '@frameweave/engine';\nimport {defineNativeStage,linear709} from '@frameweave/engine/native';\nexport const artwork=defineNativeStage(async ({gpu,width,height})=>{\n const kernel=await gpu.compile({abiVersion:1,id:'project/moving-light',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{let uv=(vec2f(p)+.5)/vec2f(outputSize());let x=.5+.25*sin(paramF32(0u));let light=exp(-40.*distance(uv,vec2f(x,.5)));return vec4f(vec3f(.03,.07,.12)+light*vec3f(.2,1.2,.9),1.);}'});\n return {renderAt:c=>gpu.run(kernel,[],{parameters:Float32Array.of(c.time),output:{width,height,format:'rgba16float',alpha:'opaque',color:linear709}})};\n});\nexport default <Composition width={1280} height={720} fps={30} durationInFrames={90}><Stage id=\"artwork\" factory={artwork}/><Layer source={ref('artwork')}/></Composition>;\n";
  await writeFile(join(directory,'project.tsx'),source);await writeFile(join(directory,'AGENTS.md'),agentWorkflow);
  await writeFile(join(directory,'frameweave.plugins.json'),JSON.stringify({schemaVersion:1,roots:[]},null,2)+'\n');
  await writeLock(directory);return {entry:join(directory,'project.tsx'),instructions:join(directory,'AGENTS.md'),userLibrary:userLibraryHome(),next:'Read AGENTS.md -> find authoring tools -> build a shot -> preview and verify -> deliver'};
}
