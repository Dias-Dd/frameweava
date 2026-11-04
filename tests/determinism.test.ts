import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
import {buildProject,engineRoot} from '../src/compiler/build.ts';

test('A002: independent processes reproduce all RGBA channels after sequential, direct and shuffled seeking', {timeout:240000}, async()=>{
  const build=await buildProject(join(engineRoot,'tests/fixtures/determinism/project.tsx'));
  const out=join(engineRoot,'.frameweave','audit-seeking');
  await mkdir(out,{recursive:true});
  const exec=promisify(execFile);
  for(const order of ['sequential','direct','shuffled'])
    await exec(process.execPath,['--import','tsx',join(engineRoot,'tests/helpers/seek-worker.ts'),join(build.dir,'build.json'),order,join(out,order)],
      {cwd:engineRoot,windowsHide:true,timeout:150000,maxBuffer:1024*1024});
  const comparisons=[];
  for(const [order,frames] of [['direct',[180]],['shuffled',[0,30,120,180]]] as const) {
    for(const frame of frames)for(const stage of ['final','A','B','C']) {
      const file=stage==='final'?`${frame}.png`:`${stage}-${frame}.png`;
      const a=await sharp(join(out,'sequential',file)).ensureAlpha().raw().toBuffer();
      const b=await sharp(join(out,order,file)).ensureAlpha().raw().toBuffer();
      assert.ok(a.equals(b),`${order} frame ${frame}, ${stage}: all RGBA channels must match, including transparent pixels`);
      comparisons.push({order,frame,stage,identical:true,changedChannels:0});
    }
  }
  await writeFile(join(out,'proof.json'),JSON.stringify({cache:false,independentNodeProcesses:true,sequentialFrames:181,shuffledFrames:[240,30,180,0,120],comparisons},null,2));
});
