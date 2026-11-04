import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const exec=promisify(execFile),root=resolve('.');
test('public session command reuses one browser across repeated batches and preserves random frames',{timeout:120000},async()=>{
  const parent=join(root,'.frameweave/dx-integration');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'session-'));
  const {stdout}=await exec(process.execPath,['--import','tsx',join(root,'src/cli.ts'),'session',join(root,'examples/render-session/project.tsx'),'--frames','12,0,6,0','--repeat','2','--output',join(dir,'reports'),'--json'],{cwd:root,windowsHide:true,timeout:110000,maxBuffer:4*1024*1024});
  const result=JSON.parse(stdout);assert.equal(result.ok,true);const reports=result.data.reports;assert.equal(reports.length,2);assert.ok(reports.every((r:any)=>r.ok&&r.session.browserStarts===1));assert.equal(reports[1].session.browserReused,true);
  assert.equal(reports[0].frames[1].image.rgbaSha256,reports[0].frames[3].image.rgbaSha256);assert.equal(reports[0].frames[1].image.rgbaSha256,reports[1].frames[1].image.rgbaSha256);
});
