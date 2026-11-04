// SPDX-License-Identifier: Apache-2.0
import type {Signal,FrameContext} from '../../../../src/core/types.ts';
import {rational} from '../../../../src/core/time.ts';
import type {ShutterSamplingOptions} from '../shutter-sampling.ts';
import type {WarpTiming} from './plans.ts';
import {number,finite,fail,split,aborted,type TemporalOutput} from './common.ts';
export const warpMethods=['whole-frames','frame-mix','pixel-motion'] as const;
export const warpViews=['final','foreground','background','matte','flow','confidence'] as const;
export interface TimewarpControls extends WarpTiming,TemporalOutput {
 method?:typeof warpMethods[number];
 /** Actual independent vectors: 100 -> one per pixel, 50 -> one per 2x2 tile. */
 vectorDetails?:number;blockSize?:number;searchRadius?:number;pyramidLevels?:number;
 median?:boolean;smoothIterations?:number;
 rgbWeights?:readonly [number,number,number];
 correctLuminanceChanges?:boolean;
 /** 0 retains all motion, 1 selects frame mix; intermediate values raise rejection. */
 errorThreshold?:Signal<number>;
 filtering?:'nearest'|'normal'|'extreme';filterPhases?:number;
 /** Adjustable CPU coefficient-table resource budget, default64MiB; not an artistic cap. */
 filterTableByteBudget?:number;
 buildFromOneImage?:boolean;
 /** Physical pixels discarded at source edges; repeat the remaining edge. */
 sourceCrops?:{left?:number;top?:number;right?:number;bottom?:number};
 matteChannel?:'alpha'|'red'|'green'|'blue'|'luminance';
 show?:typeof warpViews[number];
 /** Existing shutter quadrature; speed/source-frame is reevaluated per subframe. */
 shutter?:ShutterSamplingOptions;
}
const allowed=['adjustBy','speed','sourceFrame','sourceFps','originFrame','sourceTime','integration','format','signal','range','method','vectorDetails','blockSize','searchRadius','pyramidLevels','median','smoothIterations','rgbWeights','correctLuminanceChanges','errorThreshold','filtering','filterPhases','filterTableByteBudget','buildFromOneImage','sourceCrops','matteChannel','show','shutter'];
const integer=(v:number,name:string,min:number)=>{if(!Number.isSafeInteger(v)||v<min||v>0x7fffffff)fail(name+' must fit the positive native integer ABI');return v;};
export function snapshotTimewarpControls(input:TimewarpControls):TimewarpControls {
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!allowed.includes(k)))fail('Documented Timewarp options required');
 const {signal,...rest}=input;aborted(signal);return {...structuredClone(rest),signal};
}
export function resolveTimewarpControls(o:TimewarpControls,c:FrameContext,width:number,height:number){
 const method=o.method??'pixel-motion',filtering=o.filtering??'normal',show=o.show??'final',channel=o.matteChannel??'alpha',details=finite(o.vectorDetails??12.5,'vectorDetails'),threshold=number(o.errorThreshold??0,c,'errorThreshold');
 if(!warpMethods.includes(method)||!['nearest','normal','extreme'].includes(filtering)||!warpViews.includes(show)||!['alpha','red','green','blue','luminance'].includes(channel)||details<=0||details>100||threshold<0||threshold>1||o.format!==undefined&&!['rgba16float','rgba32float'].includes(o.format))fail('Known method/filter/view, vectorDetails in (0,100], unit error threshold and float format required');
 for(const field of ['median','buildFromOneImage','correctLuminanceChanges'] as const)if(o[field]!==undefined&&typeof o[field]!=='boolean')fail(field+' must be boolean');
 const spacing=Math.ceil(100/details),window=integer(o.blockSize??Math.max(4,spacing),'blockSize',4),radius=integer(o.searchRadius??4,'searchRadius',0),smooth=integer(o.smoothIterations??0,'smoothIterations',0),phases=integer(o.filterPhases??1024,'filterPhases',1);
 const tableBudget=o.filterTableByteBudget??64*1024**2,tableBytes=((filtering==='extreme'?phases:1)+1)*32;if(!Number.isSafeInteger(tableBudget)||tableBudget<64||tableBytes>tableBudget)fail('Filter table exceeds the adjustable coefficient byte budget',{requiredBytes:tableBytes,byteBudget:tableBudget});
 if(method==='pixel-motion'&&(window>Math.min(width,height)||spacing>Math.min(width,height)))fail('Actual matching window/vector spacing must fit the image');
 const weights=o.rgbWeights??[.2126,.7152,.0722];if(!Array.isArray(weights)||weights.length!==3||weights.some(v=>!Number.isFinite(v)||!Number.isFinite(Math.fround(v)))||weights.every(v=>v===0))fail('Three finite F32 RGB analysis weights, at least one nonzero, required');
 const crop=o.sourceCrops??{};if(Object.keys(crop).some(k=>!['left','top','right','bottom'].includes(k)))fail('Known source crop edges required');const edges=[crop.left??0,crop.top??0,crop.right??0,crop.bottom??0].map((v,i)=>integer(v,'crop edge '+i,0));if(edges[0]+edges[2]>=width||edges[1]+edges[3]>=height)fail('Source crops must retain at least one pixel');
 const params=new Uint32Array(32),f=new Float32Array(params.buffer);params[0]=1;params[2]=['nearest','normal','extreme'].indexOf(filtering);params[3]=Number(o.buildFromOneImage??false);params[9]=warpViews.indexOf(show);params[11]=['alpha','red','green','blue','luminance'].indexOf(channel);params[24]=phases;f[8]=threshold;f.set(weights,16);params.set(edges,20);
 if(o.pyramidLevels!==undefined)integer(o.pyramidLevels,'pyramidLevels',1);
 const fps=rational(o.sourceFps??c.fps),timing:WarpTiming={adjustBy:o.adjustBy,speed:o.speed,sourceFrame:o.sourceFrame,sourceFps:fps,originFrame:o.originFrame,sourceTime:o.sourceTime,integration:o.integration};
 return {method,filtering,show,params,phases,tableBudget,tableBytes,fps,timing,smooth,flow:{spacing,window,radius,median:o.median,levels:o.pyramidLevels},profile:'scene-linear-timewarp/1' as const};
}
export function fractionParameters(parameters:Uint32Array,fraction:number){const p=parameters.slice(),f=new Float32Array(p.buffer);f[1]=fraction;f.set(split(1-fraction),12);f.set(split(fraction),14);return p;}
