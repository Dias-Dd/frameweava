const failures=new WeakMap<object,unknown[]>();

/** Preserve the operation's actual error, even if disposal also fails. */
export async function rethrowAfterCleanup(error:unknown,cleanup:()=>Promise<unknown>):Promise<never>{
 try{await cleanup();}catch(secondary){
  if(error!==null&&(typeof error==='object'||typeof error==='function')&&secondary!==error){
   const previous=failures.get(error)??[];previous.push(secondary);failures.set(error,previous);
  }
 }
 throw error;
}
export function cleanupFailures(error:unknown):readonly unknown[]{
 return error!==null&&(typeof error==='object'||typeof error==='function')?failures.get(error)??[]:[];
}
