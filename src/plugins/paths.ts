import {join,resolve} from 'node:path';
import {homedir} from 'node:os';

/** FRAMEWEAVE_HOME is also the isolation boundary for tests and render farms. */
export function userLibraryHome():string {
  return resolve(process.env.FRAMEWEAVE_HOME ?? join(process.env.LOCALAPPDATA ?? join(homedir(),'.local','share'),'FrameWeave'));
}
export function userPluginRoot():string { return join(userLibraryHome(),'plugins'); }
