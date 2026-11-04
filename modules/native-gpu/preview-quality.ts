import {EngineError} from '../../src/core/errors.ts';

export interface PreviewQuality {
 resolutionScale:number;
 sampleCount:number;
 effectQuality:'full'|'balanced'|'draft';
 frameBudgetMs:number;
 allowApproximation:boolean;
}
export interface NativeStagePreview extends Readonly<PreviewQuality> {
 logicalWidth:number;
 logicalHeight:number;
 renderWidth:number;
 renderHeight:number;
 scaleX:number;
 scaleY:number;
}
export type PreviewQualityOptions=Partial<PreviewQuality>&{mode?:'fixed'|'adaptive'};

export function previewQualityOptions(input:PreviewQualityOptions,fallbackBudget:number){
 const {mode='fixed',...custom}=input;
 const full:PreviewQuality={resolutionScale:1,sampleCount:custom.sampleCount??1,effectQuality:'full',
  frameBudgetMs:custom.frameBudgetMs??fallbackBudget,allowApproximation:custom.allowApproximation??false};
 const initial:PreviewQuality={...full,resolutionScale:custom.resolutionScale??1,effectQuality:custom.effectQuality??'full'};
 if(!['fixed','adaptive'].includes(mode)||!Number.isFinite(initial.resolutionScale)||initial.resolutionScale<=0||initial.resolutionScale>1||
  !Number.isSafeInteger(full.sampleCount)||full.sampleCount<1||!Number.isFinite(full.frameBudgetMs)||full.frameBudgetMs<=0||
  typeof full.allowApproximation!=='boolean'||!['full','balanced','draft'].includes(initial.effectQuality)||
  !full.allowApproximation&&(mode==='adaptive'||initial.resolutionScale!==1||initial.effectQuality!=='full'))
  throw new EngineError('E_PREVIEW_QUALITY','Invalid quality profile or missing approximation permission');
 return {mode,full:{...full,allowApproximation:false},initial};
}

export class PreviewQualityPolicy {
 private tier=0;
 private slow=0;
 private fast=0;
 private readonly tiers:PreviewQuality[];
 readonly exact:PreviewQuality;
 constructor(options:PreviewQualityOptions,budget:number,stateful:boolean){
  const {mode,full,initial}=previewQualityOptions(options,budget);
  this.exact=Object.freeze(full);
  const reduced=initial.allowApproximation&&!stateful;
  this.tiers=reduced?[Object.freeze(initial)]:[this.exact];
  if(reduced&&mode==='adaptive'){
   for(const [scale,effectQuality] of [[.5,'balanced'],[.25,'draft']] as const){
    if(scale<initial.resolutionScale)this.tiers.push(Object.freeze({...initial,resolutionScale:scale,effectQuality,
     sampleCount:Math.max(1,Math.round(initial.sampleCount*scale/initial.resolutionScale))}));
   }
  }
 }
 get playing(){return this.tiers[this.tier];}
 get scrubbing(){return this.tiers.at(-1)!;}
 observe(profile:PreviewQuality,latencyMs:number,backlogged:boolean,gpuMs?:number){
  if(profile!==this.playing)return;
  const budget=profile.frameBudgetMs;
  const overloaded=gpuMs===undefined?latencyMs>budget*1.15||backlogged&&latencyMs>budget*.9:
   gpuMs>budget*.9||backlogged&&gpuMs>budget*.65;
  this.slow=overloaded?this.slow+1:0;
  this.fast=latencyMs<budget*.65&&!backlogged?this.fast+1:0;
  if(this.slow>=4&&this.tier<this.tiers.length-1){this.tier++;this.slow=0;this.fast=0;}
  else if(this.fast>=16&&this.tier>0){this.tier--;this.slow=0;this.fast=0;}
 }
}
