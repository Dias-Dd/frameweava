// Authored byte-string helpers for Surface v2, without Buffer/DOM/Node access.
// Algorithms: https://infra.spec.whatwg.org/#forgiving-base64
// Invalid input has InvalidCharacterError.name; no DOMException platform added.
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function invalid():never{throw Object.assign(new Error('Invalid base64 byte string'),{name:'InvalidCharacterError'});}
function text(value:unknown){if(typeof value==='symbol')throw new TypeError('Cannot convert Symbol to string');return String(value);}
export function hostBtoa(value:unknown):string{
 if(arguments.length===0)throw new TypeError('btoa requires an argument');const input=text(value),chunks:string[]=[];let chunk='';
 for(let i=0;i<input.length;i+=3){const a=input.charCodeAt(i),b=i+1<input.length?input.charCodeAt(i+1):0,c=i+2<input.length?input.charCodeAt(i+2):0;if(a>255||b>255||c>255)invalid();
  const word=(a<<16)|(b<<8)|c;chunk+=alphabet[word>>>18]+alphabet[word>>>12&63]+(i+1<input.length?alphabet[word>>>6&63]:'=')+(i+2<input.length?alphabet[word&63]:'=');
  if(chunk.length>=32768){chunks.push(chunk);chunk='';}
 }chunks.push(chunk);return chunks.join('');
}
export function hostAtob(value:unknown):string{
 if(arguments.length===0)throw new TypeError('atob requires an argument');let input=text(value).replace(/[\t\n\f\r ]/g,'');if(input.length%4===0)input=input.replace(/={1,2}$/,'');
 if(input.length%4===1||/[^A-Za-z0-9+/]/.test(input))invalid();const chunks:string[]=[];let chunk='',bits=0,word=0;
 for(let i=0;i<input.length;i++){word=(word<<6)|alphabet.indexOf(input[i]);bits+=6;if(bits>=8){bits-=8;chunk+=String.fromCharCode(word>>>bits&255);word&=(1<<bits)-1;}
  if(chunk.length>=32768){chunks.push(chunk);chunk='';}
 }chunks.push(chunk);return chunks.join('');
}
