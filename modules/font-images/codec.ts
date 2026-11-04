import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {EngineError} from '../../src/core/errors.ts';
export const fontImageCodecVersion='font-glyph-v1/skrifa-0.49.0/read-fonts-0.46.0';
interface Engine {
 begin_font():void;append_font(bytes:Uint8Array):void;finish_font(face:number):number;
 font_embedded_metadata(glyph:number,format:number,strike:number):Float64Array;
 font_embedded_bytes(glyph:number,format:number,strike:number):Uint8Array;free():void;
}
let loaded:Promise<{Engine:new()=>Engine}>|undefined;
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function codec():Promise<{Engine:new()=>Engine}>{return loaded??=(async()=>{
 const root=new URL('./runtime/',import.meta.url),receipt=JSON.parse(await readFile(new URL('identity.json',root),'utf8'));
 if(receipt.version!==1||receipt.codec!==fontImageCodecVersion||receipt.sourceCommit!=='6dd8c4bb63d3c3dbe371476b731be2254a435ee3')throw new EngineError('E_NATIVE_FONT_IMAGE_RUNTIME','Unreviewed font-image codec identity');
 const names=['Cargo.toml','Cargo.lock','src/lib.rs','src/original-font-metadata.rs','src/original-shaper.rs'];
 if(Object.keys(receipt.inputs??{}).sort().join('\n')!==[...names].sort().join('\n'))throw new EngineError('E_NATIVE_FONT_IMAGE_INTEGRITY','Font codec source inventory changed');
 for(const name of names)if(sha(await readFile(new URL('./source/'+name,import.meta.url)))!==receipt.inputs[name])throw new EngineError('E_NATIVE_FONT_IMAGE_INTEGRITY','Font codec source changed: '+name);
 const [js,wasm]=await Promise.all([readFile(new URL('binding.mjs',root)),readFile(new URL('module_bg.wasm',root))]);
 if(sha(js)!==receipt.files['binding.mjs']||sha(wasm)!==receipt.files['module_bg.wasm'])throw new EngineError('E_NATIVE_FONT_IMAGE_INTEGRITY','Font-image codec differs from its reviewed SDK identity');
 // Execute the exact checked JS bytes, not a pathname reopened after hashing.
 const module=await import('data:text/javascript;base64,'+js.toString('base64'));
 const binding=module.createBinding();binding.initSync({module:wasm});
 if(typeof binding.Engine!=='function')throw new EngineError('E_NATIVE_FONT_IMAGE_RUNTIME','Fixed font codec Engine unavailable');
 return binding as {Engine:new()=>Engine};
})().catch(e=>{loaded=undefined;if(e instanceof EngineError)throw e;throw new EngineError('E_NATIVE_FONT_IMAGE_RUNTIME',String(e));});}
export async function openFontImages(bytes:Uint8Array,face:number){
 const {Engine}=await codec(),engine=new Engine();let closed=false;
 try{engine.begin_font();for(let start=0;start<bytes.length;start+=262144)engine.append_font(bytes.subarray(start,start+262144));const unitsPerEm=engine.finish_font(face);
  return {unitsPerEm,extract(glyph:number,format:'sbix'|'cbdt'|'ebdt'|'svg',strike:number){
   if(closed)throw new EngineError('E_NATIVE_FONT_IMAGE_CLOSED','Font decoder is closed');
   try{const f=['sbix','cbdt','ebdt','svg'].indexOf(format),metadata=Array.from(engine.font_embedded_metadata(glyph,f,strike)),data=Uint8Array.from(engine.font_embedded_bytes(glyph,f,strike));
    if(metadata[0]!==1||metadata[1]!==f||metadata.some(n=>!Number.isFinite(n)))throw Error('Invalid fixed-codec metadata');return {metadata,data};
   }catch(e){throw new EngineError('E_NATIVE_FONT_IMAGE_GLYPH',String(e),{details:{face,glyph,format,strike}});}
  },close(){if(!closed){closed=true;engine.free();}}};
 }catch(e){engine.free();throw new EngineError('E_NATIVE_FONT_IMAGE_FONT',String(e));}
}
