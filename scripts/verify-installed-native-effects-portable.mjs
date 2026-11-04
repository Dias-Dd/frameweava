// Targeted continuation after the full verifier records E_FLAT_PACKAGE_SOURCE.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const sdk=await import('@frameweave/engine/node'),exec=promisify(execFile);
const proof=process.env.FRAMEWEAVE_NATIVE_EFFECTS_RESUME,root=dirname(dirname(fileURLToPath(import.meta.resolve('@frameweave/engine/cli'))));
assert.ok(proof);const original=join(proof,'project'),hidden=original+'.unavailable',output=join(proof,'capsule-verified.exr');
const report={source:process.env.FRAMEWEAVE_TEST_COMMIT,capsule:false,flat:{supported:false,diagnostic:'E_FLAT_PACKAGE_SOURCE',evidence:'result.json'},originalUnavailable:false};
const decode=async file=>(await exec(sdk.ffmpegPath(),['-v','error','-i',file,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:1024**2})).stdout;
const expected=await decode(join(proof,'rgba32float.exr')),before=JSON.parse(await readFile(join(proof,'result.json'),'utf8'));
assert.equal(before.rows.find(r=>r.name.startsWith('Capsule and Flat')).code,'E_FLAT_PACKAGE_SOURCE');
await rename(original,hidden);process.env.FRAMEWEAVE_HOME=join(proof,'empty-capsule-home');let renderer;
try{
 report.originalUnavailable=true;const build=await sdk.buildProject(join(proof,'capsule.tsx'));
 renderer=await sdk.Renderer.create(build,{browser:process.env.FRAMEWEAVE_TEST_BROWSER,nativeGpu:{executable:join(root,'native-bin',process.platform+'-'+process.arch,'frameweave-native-gpu.exe'),slots:1,export:{executable:sdk.ffmpegPath(),output,fps:[24,1],codec:'exr',format:'gbrapf32le'}}});
 await renderer.prepareNativeFrame(0);const ticket=await renderer.submitNativeFrame(0);await ticket.completed;
 report.stats=await renderer.nativeStats();await renderer.close();renderer=undefined;
 const actual=await decode(output);assert.deepEqual(actual,expected);report.capsule=true;report.decodedComponents=actual.length/4;report.sha256=createHash('sha256').update(actual).digest('hex');
}finally{await renderer?.close();await rename(hidden,original);await writeFile(join(proof,'portable-completion.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
