import {EngineError} from '../core/errors.ts';
export const assetMime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.json':'application/json','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.bin':'application/octet-stream'};
export function decodeDataResource(src:string):{bytes:Buffer;extension:string}{
  const match=/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(src);
  if(!match||match[2].length>358*1024*1024)throw new EngineError('E_RESOURCE','Embedded resources require a bounded base64 data URL');
  const bytes=Buffer.from(match[2],'base64');if(bytes.toString('base64')!==match[2])throw new EngineError('E_RESOURCE','Invalid embedded base64');
  return {bytes,extension:Object.entries(assetMime).find(([,mime])=>mime===match[1])?.[0]??'.bin'};
}
