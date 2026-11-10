import {statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EngineError} from '../core/errors.ts';
import {userLibraryHome} from '../plugins/paths.ts';

// Both src/media and the distributed lib/media are two levels below the SDK root.
const engineEnvironment=fileURLToPath(new URL('../../.frameweave/pme-python/',import.meta.url));

/** Discover only managed Frameweave environments and explicit operator overrides. */
export function mediaPython(code:string):string {
  const override=process.env.FRAMEWEAVE_MEDIA_PYTHON;
  const executable=process.platform==='win32'?['Scripts','python.exe']:['bin','python'];
  const candidates=override?[resolve(override)]:[
    fileURLToPath(new URL(`../../native-bin/${process.platform}-${process.arch}/python/${process.platform==='win32'?'python.exe':'bin/python3'}`,import.meta.url)),
    join(engineEnvironment,...executable),
    join(userLibraryHome(),'pme-python',...executable)
  ];
  for(const file of candidates){
    if(statSync(file,{throwIfNoEntry:false})?.isFile())return file;
  }
  throw new EngineError(code,override?'The configured media Python executable is missing':'Frameweave media adapters are not installed',{
    hint:override?'Check the explicit FRAMEWEAVE_MEDIA_PYTHON override or remove it to use the managed environment.':
      'Run the one-time setup in tools/professional-media/README.md from your Frameweave installation.',
    details:{searched:candidates}
  });
}
