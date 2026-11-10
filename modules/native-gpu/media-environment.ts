import {statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {userLibraryHome} from '../../src/plugins/paths.ts';

/** Locate managed installation artifacts only. The Native loader still verifies
 * the exact runtime receipt and DLL, and holds the admitted file open. */
export function nativeMediaEnvironment(env:NodeJS.ProcessEnv=process.env):NodeJS.ProcessEnv {
  if(env.FRAMEWEAVE_MEDIA_RUNTIME!==undefined || process.platform!=='win32')return env;
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const candidates=[
    join(root,'native-bin',process.platform+'-'+process.arch,'media'),
    join(root,'.frameweave','native-media','runtime'),
    join(userLibraryHome(),'native-media','runtime'),
  ];
  const path=candidates.find(directory=>statSync(join(directory,'media-runtime.json'),{throwIfNoEntry:false})?.isFile());
  return path?{...env,FRAMEWEAVE_MEDIA_RUNTIME:path}:env;
}
