import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,access,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {EngineError,diagnostic} from '../src/core/errors.ts';
import {rethrowAfterCleanup,cleanupFailures} from '../src/core/failure-cleanup.ts';
import {removeExitedRuntimeFile} from '../modules/spidermonkey-host/exited-file.ts';

test('initialization keeps exact primary error and diagnostic when cleanup also rejects',async()=>{
 const primary=new EngineError('E_STAGE_TIMEOUT','init deadline',{stageId:'picture',frame:7,details:{budgetMs:100}});
 const secondary=Object.assign(new Error('image mapping is still busy'),{code:'EPERM'});
 await assert.rejects(rethrowAfterCleanup(primary,async()=>{throw secondary;}),error=>error===primary);
 assert.deepEqual(cleanupFailures(primary),[secondary]);
 assert.deepEqual(diagnostic(primary),{code:'E_STAGE_TIMEOUT',severity:'error',message:'init deadline',stageId:'picture',frame:7,
  details:{primary:{budgetMs:100},cleanupErrors:[{code:'E_INTERNAL',message:'image mapping is still busy'}]}});
});
test('successful cleanup preserves old error details and does not manufacture a secondary issue',async()=>{
 const e=new EngineError('E_NATIVE_LOGIC','asset failure',{details:{path:'mesh'}});let disposed=0;
 await assert.rejects(rethrowAfterCleanup(e,async()=>{disposed++;}),error=>error===e);
 assert.equal(disposed,1);assert.deepEqual(diagnostic(e),{code:'E_NATIVE_LOGIC',severity:'error',message:'asset failure',details:{path:'mesh'}});
 await assert.rejects(rethrowAfterCleanup(null,async()=>{throw new Error('secondary');}),error=>error===null);
});
for(const value of [null,undefined])test('cleanup preserves explicitly overridden diagnostic details: '+String(value),async()=>{
 const e=new EngineError('E_STAGE_TIMEOUT','timeout',{details:{original:true}});
 await assert.rejects(rethrowAfterCleanup(e,async()=>{throw new Error('secondary');}),error=>error===e);
 const result=diagnostic(e,{details:value});
 assert.equal(result.code,'E_STAGE_TIMEOUT');
 assert.ok(Object.hasOwn(result.details as object,'primary'));
 assert.equal((result.details as {primary:unknown}).primary,value);
});
test('exited runtime cleanup removes only its file and remains idempotent',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'fw-exit-')),file=join(directory,'sm.exe'),sibling=join(directory,'keep');
 try{await writeFile(file,'runtime');await writeFile(sibling,'keep');await removeExitedRuntimeFile(file);await removeExitedRuntimeFile(file);await access(sibling);
  const invalid=join(directory,'directory');await mkdir(invalid);await assert.rejects(removeExitedRuntimeFile(invalid));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('Windows retries an actual transient image-file lock, after its owner releases it',{skip:process.platform!=='win32'},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'fw-image-lock-')),file=join(directory,'sm.exe');await writeFile(file,'runtime');
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$f=[System.IO.File]::Open($env:FW_TEST_IMAGE,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read);[Console]::WriteLine('locked');Start-Sleep -Milliseconds 350;$f.Dispose()"],{env:{...process.env,FW_TEST_IMAGE:file},windowsHide:true,stdio:['ignore','pipe','pipe']});
 try{await new Promise<void>((resolve,reject)=>{child.once('error',reject);child.stdout.once('data',()=>resolve());child.once('exit',code=>{if(code)reject(new Error('Lock helper failed '+code));});});
  const started=performance.now();await removeExitedRuntimeFile(file);assert.ok(performance.now()-started>=150,'Expected a real sharing violation and retry');await assert.rejects(access(file));
 }finally{child.kill();await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:50});}
});
