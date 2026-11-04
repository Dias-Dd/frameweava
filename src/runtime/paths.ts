import {join} from 'node:path';
import {userLibraryHome} from '../plugins/paths.ts';

/** Writable engine scratch data, separate from installed SDK files and project assets. */
export function runtimeCachePath(...parts:string[]):string {
  return join(userLibraryHome(),'cache','runtime',...parts);
}
