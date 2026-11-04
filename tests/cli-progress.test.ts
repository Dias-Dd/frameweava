import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {TerminalProgress} from '../src/cli-progress.ts';
import {reportProgress} from '../src/core/progress.ts';
test('TTY spinner rotates and stops cleanly without a remaining interval',async()=>{
 const writes:string[]=[],progress=new TerminalProgress({enabled:true,output:{isTTY:true,columns:140,write:s=>writes.push(s)},intervalMs:10});
 try{progress.update({phase:'compile'});await delay(65);assert.match(writes[0],/\/ 正在编译工程/);assert.ok(writes.some(s=>s.includes('- 正在编译工程')));assert.ok(writes.some(s=>s.includes('\\ 正在编译工程')));}
 finally{progress.close();}
 assert.equal(writes.at(-1),'\r\x1b[2K');const length=writes.length;await delay(25);assert.equal(writes.length,length);
});
test('completed-frame progress reports actual throughput and remaining render estimate',()=>{
 let now=0;const writes:string[]=[],p=new TerminalProgress({enabled:true,output:{write:s=>writes.push(s)},now:()=>now});
 p.update({phase:'first-frame',completed:0,total:100});now=5000;p.update({phase:'render',completed:50,total:100});
 assert.match(writes.at(-1)!,/50\/100 帧 · 50.0% · 10.0 帧\/秒 · 预计剩余 00:05/);
 now=10000;p.update({phase:'render',completed:100,total:100});p.update({phase:'finalize'});
 assert.match(writes.at(-1)!,/正在收尾编码与封装/);assert.doesNotMatch(writes.join(''),/视频已导出|NaN|Infinity/);p.close();
});
test('JSON view is silent; redirected human progress is throttled and escape-free',()=>{
 const quiet:string[]=[],off=new TerminalProgress({enabled:false,output:{isTTY:true,write:s=>quiet.push(s)}});off.update({phase:'compile'});off.close();assert.equal(quiet.length,0);
 let now=0;const writes:string[]=[],p=new TerminalProgress({enabled:true,output:{write:s=>writes.push(s)},now:()=>now});
 p.update({phase:'render',completed:0,total:100});for(let n=1;n<20;n++){now=n*10;p.update({phase:'render',completed:n,total:100});}assert.equal(writes.length,1);
 now=2100;p.update({phase:'render',completed:20,total:100});assert.equal(writes.length,2);p.update({phase:'render',completed:100,total:100});assert.equal(writes.length,3);
 assert.doesNotMatch(writes.join(''),/\x1b|\r/);p.close();
});
test('watch rebuild restarts after ready/error and cancellation',()=>{
 const writes:string[]=[],p=new TerminalProgress({enabled:true,output:{isTTY:true,write:s=>writes.push(s)}});
 p.update({phase:'compile'});p.update({phase:'ready'});assert.equal(writes.at(-1),'\r\x1b[2K');
 p.update({phase:'compile',message:'正在重新编译工程'});assert.match(writes.at(-1)!,/重新编译/);p.update({phase:'error'});assert.equal(writes.at(-1),'\r\x1b[2K');
 p.update({phase:'initialize'});p.update({phase:'cancelled'});assert.equal(writes.at(-1),'\r\x1b[2K');p.close();
});
test('audio progress uses sample counts, and presentation exceptions cannot fail rendering',()=>{
 let now=0;const writes:string[]=[],p=new TerminalProgress({enabled:true,output:{write:s=>writes.push(s)},now:()=>now});
 p.update({phase:'audio',completed:0,total:96000,unit:'samples'});now=2000;p.update({phase:'audio',completed:48000,total:96000,unit:'samples'});
 assert.match(writes.at(-1)!,/48000\/96000 采样/);assert.doesNotMatch(writes.at(-1)!,/帧\/秒/);p.close();
 assert.doesNotThrow(()=>reportProgress(()=>{throw Error('presentation failure');},{phase:'render',completed:1,total:2}));
 reportProgress(event=>assert.ok(Object.isFrozen(event)),{phase:'initialize'});
});
