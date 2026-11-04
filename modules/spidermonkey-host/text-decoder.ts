/** UTF-8 TextDecoder adapter for the existing private native UTF-8 bridge.
 * No DOM, Node, new host capability or author-supplied implementation. */
export function hostTextDecoder(decode:(bytes:Uint8Array,fatal:boolean)=>string){
 const labels=new Set(['unicode-1-1-utf-8','unicode11utf8','unicode20utf8','utf-8','utf8','x-unicode20utf8']);
 function dictionary(value:unknown):Record<string,unknown>{
  if(value===undefined||value===null)return {};
  if(typeof value!=='object'&&typeof value!=='function')throw new TypeError('Decoder options must be a dictionary');
  return value as Record<string,unknown>;
 }
 function bytes(value:unknown):Uint8Array{
  if(value===undefined)return new Uint8Array(0);
  if(value instanceof ArrayBuffer||typeof SharedArrayBuffer!=='undefined'&&value instanceof SharedArrayBuffer)return new Uint8Array(value);
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  throw new TypeError('TextDecoder input must be an ArrayBuffer or an ArrayBuffer view');
 }
 // Hold only an incomplete, otherwise valid UTF-8 suffix (at most three bytes).
 // Invalid continuations must be processed immediately, even during streaming.
 function tail(value:Uint8Array):number{
  for(let start=value.length-1;start>=Math.max(0,value.length-3);start--){
   const first=value[start],need=first>=0xc2&&first<=0xdf?2:first>=0xe0&&first<=0xef?3:first>=0xf0&&first<=0xf4?4:0;
   if(!need){if(first<0x80||first>=0xc0)return 0;continue;}
   const count=value.length-start;if(count>=need)return 0;
   for(let at=start+1;at<value.length;at++){
    const b=value[at],lower=at===start+1?(first===0xe0?0xa0:first===0xf0?0x90:0x80):0x80;
    const upper=at===start+1?(first===0xed?0x9f:first===0xf4?0x8f:0xbf):0xbf;
    if(b<lower||b>upper)return 0;
   }
   return count;
  }
  return 0;
 }
 return class TextDecoder{
  #fatal:boolean;#ignoreBOM:boolean;#streaming=false;#bomSeen=false;#pending=new Uint8Array(0);
  constructor(label:unknown='utf-8',options?:unknown){
   if(typeof label==='symbol')throw new TypeError('Encoding label cannot be a Symbol');
   const normalized=String(label).replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g,'').toLowerCase();
   if(!labels.has(normalized))throw new RangeError('This host supports only UTF-8 TextDecoder encoding');
   const o=dictionary(options);this.#fatal=Boolean(o.fatal);this.#ignoreBOM=Boolean(o.ignoreBOM);
  }
  get encoding(){return 'utf-8';}get fatal(){return this.#fatal;}get ignoreBOM(){return this.#ignoreBOM;}
  decode(value?:unknown,options?:unknown):string{
   let input=bytes(value);const stream=Boolean(dictionary(options).stream);
   if(!this.#streaming){this.#pending=new Uint8Array(0);this.#bomSeen=false;}
   this.#streaming=stream;
   if(this.#pending.length){const combined=new Uint8Array(this.#pending.length+input.length);combined.set(this.#pending);combined.set(input,this.#pending.length);input=combined;}
   const end=input.length-(stream?tail(input):0);this.#pending=input.slice(end);
   let result:string;
   try{result=decode(input.subarray(0,end),this.#fatal);}catch(error){this.#pending=new Uint8Array(0);throw error;}
   if(!this.#bomSeen&&result.length){this.#bomSeen=true;if(!this.#ignoreBOM&&result.charCodeAt(0)===0xfeff)result=result.slice(1);}
   return result;
  }
 };
}
