import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import ts from 'typescript';
import * as advanced from '../modules/pro-animation/src/advanced.ts';

test('managed declarations expose every advanced function as a TypeScript value',async()=>{
 const root=resolve('.'),base=join(root,'.frameweave/public-value-contract');
 await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'run-'));
 const names=Object.keys(advanced).filter(name=>typeof advanced[name as keyof typeof advanced]==='function');
 assert.ok(names.includes('createAim2D'));assert.ok(names.includes('createFontShaper'));
 const entry=join(dir,'consumer.ts');
 await writeFile(entry,`import {${names.join(',')}} from 'pro-animation';\nconst callableValues=[${names.join(',')}];void callableValues;\n`);
 const config=ts.readConfigFile(join(root,'tsconfig.json'),ts.sys.readFile);
 const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
 const program=ts.createProgram([entry],{...parsed.options,noEmit:true});
 const errors=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,ts.formatDiagnostics(errors,{getCurrentDirectory:()=>root,getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));
});
