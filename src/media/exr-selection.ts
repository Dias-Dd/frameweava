import {EngineError} from '../core/errors.ts';

export interface ExrSelection {
  part: number | string;
  channels: {r:string; g:string; b:string; a:string | 0 | 1};
  window: 'data' | 'display';
}

export type ExrWindow = readonly [minX:number,minY:number,maxX:number,maxY:number];
export interface ExrPartInfo {
  index: number;
  name: string | null;
  storage: string;
  dataWindow: ExrWindow;
  displayWindow: ExrWindow;
  channels: {name:string;xSampling:number;ySampling:number}[];
}

export function exrSelection(value:ExrSelection):ExrSelection {
  const channel = (v:unknown):v is string => typeof v==='string' && v.length>0 && !v.includes('\0');
  const part = value?.part, channels = value?.channels;
  if(!value || typeof value!=='object' ||
    !(channel(part) || typeof part==='number' && Number.isSafeInteger(part) && part>=0) ||
    !['data','display'].includes(value.window) || Object.keys(value).some(k=>!['part','channels','window'].includes(k)) ||
    !channels || typeof channels!=='object' || Object.keys(channels).some(k=>!['r','g','b','a'].includes(k)) ||
    ![channels.r,channels.g,channels.b].every(channel) ||
    !(channel(channels.a) || channels.a===0 || channels.a===1)) {
    throw new EngineError('E_MEDIA_EXR_SELECTION','Select a part, an image window, three RGB channels and an Alpha channel or constant 0/1');
  }
  return {part,window:value.window,channels:{r:channels.r,g:channels.g,b:channels.b,a:channels.a}};
}
