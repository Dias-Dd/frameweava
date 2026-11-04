// Explicit verification of the integrated shared Gaussian used by the numerical
// fixture. No download, generated loader, registry, trust override or Git sync.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const path='modules/native-effects/pa/kernels.ts';
const expected='b6a59d6c73787c9090b292c7058f4774e930da1179b62492533480b359831ba2';
const sha256=createHash('sha256').update(await readFile(path)).digest('hex');
if(sha256!==expected)throw Error('Reviewed shared Gaussian changed; inspect before updating this fixture identity');
console.log(JSON.stringify({ok:true,path,sha256,source:'22370b15287262ead71c92601aeed77c0e62f3fc, integrated by Main c91c1f56a5ae1a7ead939318815861fab9815b00'}));
