import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,stat,utimes} from 'node:fs/promises';
import {join} from 'node:path';
import {engineRoot} from '../src/compiler/build.ts';
import {optionalHash,fingerprint} from '../modules/render-session/dependencies.ts';
import {hash} from '../modules/render-inspection/common.ts';

/** Frozen pre-optimization reference, blob b25ad17445303e2b1e6c69ea14545aa04d0e6824. */
async function serial(files:string[],signature:string){const values:Record<string,string>={};for(const file of files)values[file]=await optionalHash(file);return hash(JSON.stringify([signature,values]));}
async function fixture(){const parent=join(engineRoot,'.frameweave/fingerprint-tests');await mkdir(parent,{recursive:true});return mkdtemp(join(parent,'case-'));}

test('Session full-content fingerprints preserve exact old bytes, order, duplicate and missing markers',async()=>{
  const root=await fixture(),files:string[]=[];for(let i=0;i<33;i++){const path=join(root,'file-'+i);await writeFile(path,new Uint8Array(1024+i*31).fill(i));files.push(path);}
  const absent=join(root,'missing');
  for(const paths of [[],[absent],files,[files[7],absent,files[0],files[7]],[...files].reverse()])assert.equal(await fingerprint(paths,'catalog'),await serial(paths,'catalog'));
  const expected=await fingerprint(files,'catalog');for(let i=0;i<4;i++)assert.equal(await fingerprint(files,'catalog'),expected);
  assert.notEqual(await fingerprint(files,'changed-catalog'),expected);
});

test('same size and restored mtime cannot conceal source edits or new/missing files',async()=>{
  const root=await fixture(),file=join(root,'source.ts'),missing=join(root,'optional.json');await writeFile(file,'export const x=1;');
  const info=await stat(file),before=await fingerprint([file,missing],'catalog');await writeFile(file,'export const x=2;');await utimes(file,info.atime,info.mtime);
  const after=await fingerprint([file,missing],'catalog');assert.notEqual(after,before);assert.equal(after,await serial([file,missing],'catalog'));
  await writeFile(missing,'{}');assert.notEqual(await fingerprint([file,missing],'catalog'),after);assert.equal((await readFile(file,'utf8')),'export const x=2;');
});

test('parallel read failures retain the original first path/code rather than racing errors',async()=>{
  const root=await fixture(),a=join(root,'directory-a'),b=join(root,'directory-b'),file=join(root,'valid');await mkdir(a);await mkdir(b);await writeFile(file,'valid');
  for(const paths of [[a,b,file],[file,b,a]]){
    const [old]=await Promise.allSettled([serial(paths,'catalog')]),[fresh]=await Promise.allSettled([fingerprint(paths,'catalog')]);
    assert.equal(old.status,'rejected');assert.equal(fresh.status,'rejected');
    if(old.status==='rejected'&&fresh.status==='rejected'){assert.equal(fresh.reason.code,old.reason.code);assert.equal(fresh.reason.path,old.reason.path);}
  }
  assert.equal(await fingerprint([file],'catalog'),await serial([file],'catalog'));
});
