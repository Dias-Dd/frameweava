// SPDX-License-Identifier: Apache-2.0
// Black-box consumer: only process CLI JSON. No Frameweave imports/source/config reads.
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const [project,catalog,query,output]=process.argv.slice(2);
const launcher=JSON.parse(process.env.FRAMEWEAVE_CLI_JSON??'[]');
if(!project||!catalog||!query||!output||!Array.isArray(launcher)||!launcher.length||!launcher.every(v=>typeof v==='string'))throw Error('Set FRAMEWEAVE_CLI_JSON=[executable,...args]; pass <project> <local-catalog> <query> <output.tsx>');
function call(args){
  const stdout=execFileSync(launcher[0],[...launcher.slice(1),'capabilities',...args,'--project',project,'--catalog',catalog,'--json'],{encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:1024*1024});
  const value=JSON.parse(stdout);if(value.schemaVersion!==1||value.ok!==true||!Array.isArray(value.diagnostics))throw Error('Invalid or unsuccessful tool response');return value.data;
}
const found=call(['search',query,'--mode','keyword','--limit','5']);
if(!found.items.length)throw Error('No declared local capability found');const identity=found.items[0].identity;
const info=call(['inspect',identity.reference,'--integrity',identity.integrity]);
const examples=call(['examples',identity.reference,'--integrity',identity.integrity]);
if(info.identity.reference!==identity.reference||info.identity.integrity!==identity.integrity||examples.identity.integrity!==identity.integrity)throw Error('Content identity changed');
const example=examples.items.find(e=>e.completeProject&&e.validation.typescript==='passed'&&e.validation.reference==='exact');
if(!example)throw Error('No authored complete TSX project is available');
await writeFile(output,example.code);
console.log(JSON.stringify({schemaVersion:1,ok:true,identity,parameterSchemaVersion:info.parameters.schemaVersion,example:{path:output,integrity:example.source.integrity,validation:example.validation},availability:info.availability,commands:info.commands}));
