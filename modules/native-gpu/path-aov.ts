import {pathCryptoChannels} from './path-crypto.ts';
import type {NativeBufferValue} from './data-export.ts';
import {EngineError} from '../../src/core/errors.ts';
import {linear709} from '../../src/media/surface.ts';
import {writeFlatAovExr,type FlatAovPlanes} from '../spatial-creation/aov-io.ts';

export interface NativePathAovFrame {
  width: number;
  height: number;
  /** Values from the Native Stage's path-transport data publication. */
  transport: Float32Array;
  /** Values from the Native Stage's path-guide data publication. */
  guide: Float32Array;
  /** Optional path-cryptomatte coverage publication from the same ticket. */
  cryptomatte?: NativeBufferValue;
  /** Optional matching path-motion v1 publication. */
  motion?: NativeBufferValue;
}

const lobes = ['Beauty','Diffuse','Specular','Transmission','Emission','Volume'] as const;

export function pathAovChannels(frame: NativePathAovFrame, maxBytes = 512*1024**2): FlatAovPlanes {
  const {width,height,transport,guide} = frame, pixels = width*height;
  if (![width,height].every(n=>Number.isSafeInteger(n)&&n>0) || !Number.isSafeInteger(pixels) ||
      !(transport instanceof Float32Array) || !(guide instanceof Float32Array) ||
      transport.length !== pixels*18 || guide.length !== pixels*8)
    throw new EngineError('E_NATIVE_PATH_AOV_LAYOUT','Require matching path-transport and path-guide v1 readbacks');
  const bytes = pixels*(27+(frame.motion?4:0))*4;
  if (!Number.isSafeInteger(bytes))
    throw new EngineError('E_AOV_BUDGET','Path-traced EXR planes exceed safe byte addressing');
  const channels: FlatAovPlanes['channels'] = Object.create(null);
  for (const [index,name] of lobes.entries()) {
    for (let c=0;c<3;c++) {
      const channel = new Float32Array(pixels);
      for (let i=0;i<pixels;i++) channel[i]=transport[i*18+index*3+c];
      channels[name+'.'+'RGB'[c]]=channel;
    }
  }
  channels['Beauty.A']=new Float32Array(pixels).fill(1);
  for (let c=0;c<3;c++) {
    const n = new Float32Array(pixels), a = new Float32Array(pixels);
    for (let i=0;i<pixels;i++) { n[i]=guide[i*8+c];a[i]=guide[i*8+4+c]; }
    channels['Normal.'+'XYZ'[c]]=n;
    channels['Albedo.'+'RGB'[c]]=a;
  }
  const ids = new Uint32Array(pixels), depth = new Float32Array(pixels);
  for (let i=0;i<pixels;i++) {
    const label = Math.abs(guide[i*8+7]);
    ids[i] = label ? label-1 : 0xffffffff;
    depth[i] = label ? guide[i*8+3] : 0;
  }
  if(frame.motion) {
    const {info,values}=frame.motion;
    if(!(values instanceof Float32Array) || values.length!==pixels*4 ||
        info.dimensions[0]!==width || info.dimensions[1]!==height || info.dimensions[2]!==1 ||
        info.components!==4 || (info.metadata as {profile?:string})?.profile!=='path-motion-v1')
      throw new EngineError('E_NATIVE_PATH_AOV_LAYOUT','Require a matching path-motion v1 publication');
    for(const [c,name] of ['X','Y','Depth','Valid'].entries()) {
      const channel=new Float32Array(pixels);
      for(let i=0;i<pixels;i++)channel[i]=values[i*4+c];
      channels['Motion.'+name]=channel;
    }
  }
  channels.Depth=depth;
  channels.ObjectID=ids;
  const cryptomatte=frame.cryptomatte ? pathCryptoChannels(width,height,frame.cryptomatte,maxBytes-bytes) : undefined;
  return {channels:Object.assign(channels,cryptomatte?.channels),metadata:{...cryptomatte?.metadata,frameweavePathAov:JSON.stringify({
    version:1,color:linear709,alpha:'opaque',beauty:'raw-sum',partition:'first-scattering-event',
    emission:'includes directly visible sky',guide:'center primary ray',depth:'axial meters from near plane',
    normal:'world facing camera',objectMiss:0xffffffff,
  })}};
}

export function writePathAovExr(file:string, frame:NativePathAovFrame, options:{maxBytes?:number;signal?:AbortSignal}={}) {
  return writeFlatAovExr(file,frame.width,frame.height,()=>pathAovChannels(frame,options.maxBytes),options);
}
