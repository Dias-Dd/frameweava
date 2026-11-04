/** This checkpoint's explicit 0.5.1 builder audit, not an auto-refreshable public lock. */
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {buildProAnimation} from '../scripts/build-package.ts';
import {readPackage} from '../../../src/packages/manifest.ts';
const base=resolve('.frameweave/pa0');await mkdir(base,{recursive:true});
const dir=await mkdtemp(join(base,'frozen-pa2-audit-')),record=await readPackage(await buildProAnimation(join(dir,'package')));
assert.equal(record.manifest.version,'0.5.1','This historical audit requires its frozen baseline; Main must review a new release identity explicitly');
const expected='c4efe9b785462f710980abbcd37b556c8281f22e5e65d7722046992a7579ef38';assert.equal(record.integrity,expected,'Independent component files leaked into the frozen public package');
const result={directory:record.directory,version:record.manifest.version,integrity:record.integrity,expected,valid:true};await writeFile(resolve('.frameweave/pa3-pathops/frozen-package-proof-final.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
