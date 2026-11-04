// Local, explicit R1 setup. No global install, lock bypass or downloaded assets.
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {buildNativeImagePackage} from '../../modules/native-effects/scripts/build-package.ts';
import {installedPackages} from '../../src/node.ts';
const project=dirname(fileURLToPath(import.meta.url)),root=resolve(project,'../..');
let existing,restore=false;try{existing=await installedPackages(project);}catch(e){if(e.code!=='E_PACKAGE_MISSING')throw e;restore=true;}
if(existing?.lock?.roots['native-image-effects']) {
  if(existing.lock.roots['native-image-effects']!=='native-image-effects@0.5.0')throw Error('An existing different version requires explicit review');
  console.log('Existing package lock retained; the normal compiler will verify it.');
} else {
  const base=join(root,'.frameweave/effects-library-tour');await mkdir(base,{recursive:true});
  const temporary=await mkdtemp(join(base,'catalog-'));
  const pack=await buildNativeImagePackage(join(temporary,'native-image-effects'));
  const operation=restore?['restore',pack,'--project',project]:['install',pack,'--add','native-image-effects@0.5.0','--project',project,'--trust','local:frameweave.gpu-images'];
  execFileSync(process.execPath,['--import','tsx',join(root,'src/cli.ts'),'packages',...operation],
    {cwd:root,stdio:'inherit',windowsHide:true});
}
console.log('Ready: npm run frameweave -- frame examples/effects-library-tour/project-4k60.tsx --frame 36 --output artifacts/effects-tour/frame-36.png');
