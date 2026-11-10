import {unlink} from 'node:fs/promises';
import {setTimeout as pause} from 'node:timers/promises';

/** Call only after the owned process has exited. Windows can briefly retain
 * its image mapping; retry that file, never delete a live or unrelated tree. */
export async function removeExitedRuntimeFile(file:string){
 for(let attempt=0;;attempt++){
  try{await unlink(file);return;}catch(error){
   const code=(error as NodeJS.ErrnoException).code;
   if(code==='ENOENT')return;
   if(!['EPERM','EBUSY'].includes(code??'')||attempt>=20)throw error;
   await pause(50);
  }
 }
}
