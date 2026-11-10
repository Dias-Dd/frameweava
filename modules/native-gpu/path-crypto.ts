import {EngineError} from '../../src/core/errors.ts';
import {cryptoManifest,cryptoMetadata} from '../spatial-creation/aov-models.ts';
import type {FlatAovPlanes} from '../spatial-creation/aov-io.ts';
import type {NativeBufferValue} from './data-export.ts';

const fail=(message:string):never=>{throw new EngineError('E_NATIVE_PATH_AOV_LAYOUT',message);};

export function pathCryptoChannels(width:number,height:number,capture:NativeBufferValue,maxBytes:number):FlatAovPlanes {
  const {info,values}=capture;
  const [w,h,samples]=info.dimensions, pixels=width*height;
  const metadata=info.metadata as {profile?:string;objects?:unknown;materials?:unknown}|undefined;
  if(w!==width || h!==height || info.components!==1 || !(values instanceof Uint32Array) ||
      !Number.isSafeInteger(samples) || samples<1 || values.length!==pixels*samples ||
      metadata?.profile!=='path-cryptomatte-v1' || !Array.isArray(metadata.objects) || !Array.isArray(metadata.materials) ||
      metadata.objects.length!==metadata.materials.length || !metadata.objects.every(n=>typeof n==='string') ||
      !metadata.materials.every(n=>typeof n==='string'))
    return fail('Require a matching path-cryptomatte v1 coverage publication');
  const channels:FlatAovPlanes['channels']=Object.create(null);
  const attributes:Record<string,string>={};
  let bytes=0;
  for(const [name,names] of [['CryptoObject',metadata.objects],['CryptoMaterial',metadata.materials]] as const) {
    const manifest=cryptoManifest(name,names);
    Object.assign(attributes,cryptoMetadata(manifest));
    const codes=Uint32Array.from(names,n=>Number.parseInt(manifest.entries[n],16));
    const counts=new Map<number,number>();
    const layers:{ids:[Uint32Array,Uint32Array];weights:[Float32Array,Float32Array]}[]=[];
    for(let pixel=0;pixel<pixels;pixel++) {
      counts.clear();
      for(let i=pixel;i<values.length;i+=pixels) {
        const hit=values[i];
        if(hit>codes.length)fail('Cryptomatte sample references an unknown instance');
        if(hit) {
          const key=codes[hit-1];
          counts.set(key,(counts.get(key)??0)+1);
        }
      }
      const ranked=[...counts].sort((a,b)=>b[1]-a[1]||a[0]-b[0]);
      const count=Math.max(1,Math.ceil(ranked.length/2));
      while(layers.length<count) {
        bytes+=pixels*16;
        if(!Number.isSafeInteger(bytes)||bytes>maxBytes)
          throw new EngineError('E_AOV_BUDGET','Complete Cryptomatte coverage planes exceed maxBytes');
        const prefix=name+String(layers.length).padStart(2,'0')+'.';
        const first=new Float32Array(pixels),second=new Float32Array(pixels);
        const ids:[Uint32Array,Uint32Array]=[new Uint32Array(first.buffer),new Uint32Array(second.buffer)];
        const weights:[Float32Array,Float32Array]=[new Float32Array(pixels),new Float32Array(pixels)];
        channels[prefix+'R']=first;channels[prefix+'G']=weights[0];
        channels[prefix+'B']=second;channels[prefix+'A']=weights[1];
        layers.push({ids,weights});
      }
      for(const [rank,[code,weight]] of ranked.entries()) {
        const layer=layers[rank>>1],index=rank&1;
        layer.ids[index][pixel]=code;
        layer.weights[index][pixel]=weight/samples;
      }
    }
  }
  return {channels,metadata:attributes};
}
