export function puppetError(code:string,message:string):never{throw Object.assign(new Error(message),{code});}
