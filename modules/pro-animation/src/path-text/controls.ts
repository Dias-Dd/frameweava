// SPDX-License-Identifier: Apache-2.0 AND MIT
// Batch control math only. Reuse existing selector weights, retimed clocks and audited EffectCraft noise.
import type {Signal} from '../../../../src/core/types.ts';
import type {GlyphSelector} from '../text-animation/common.ts';
import {weight,selector} from '../text-animation/common.ts';
import {staggerGlyphSelector} from '../text-animation/selectors.ts';
import {noise1} from '../noise.ts';
import {fail,fields,finite,fraction,scalar,snapshot,adjustment,type PathTextControl,type PathTextAdjustment} from './common.ts';
/** Weighted actual cumulative gap after each preceding whole cluster; not index*own weight. */
export function pathTextTracking(options:{amount:Signal<number>;selector?:GlyphSelector}):PathTextControl{
 fields(options,['amount','selector']);const p=snapshot({amount:options.amount}),selected=selector(options.selector??(()=>1));return(units,c)=>{const amount=scalar(p.amount,c,'tracking'),out:PathTextAdjustment[]=[];let cursor=0;for(const u of units){out.push({distance:cursor});cursor=finite(cursor+amount*weight(selected,u,c),'prefix tracking');}return out;};
}
/** Same whole-whitespace cluster policy as existing spaceParagraphWords; no kashida/CJK expansion. */
export function pathTextWordSpacing(options:{amount:Signal<number>}):PathTextControl{
 fields(options,['amount']);const p=snapshot(options);return(units,c)=>{const amount=scalar(p.amount,c,'wordSpacing');let cursor=0;return units.map(u=>{const result={distance:cursor};if(u.text.length&&u.text.trim().length===0)cursor=finite(cursor+amount,'space prefix');return result;});};
}
export function pathTextNormalWave(options:{amplitude:Signal<number>;wavelength:Signal<number>;phaseDegrees?:Signal<number>}):PathTextControl{
 fields(options,['amplitude','wavelength','phaseDegrees']);const p=snapshot(options);return(units,c)=>{const amplitude=scalar(p.amplitude,c,'amplitude'),wavelength=scalar(p.wavelength,c,'wavelength'),phase=scalar(p.phaseDegrees??0,c,'phaseDegrees')/360;if(wavelength<=0)fail('wavelength must be positive');return units.map(u=>{const cycles=u.centerX/wavelength+phase;if(!Number.isFinite(cycles)||Math.abs(cycles)>Number.MAX_SAFE_INTEGER)fail('Wave phase exceeds Float64 cycle resolution');return {normal:finite(amplitude*Math.sin((cycles%1)*2*Math.PI),'wave displacement')};});};
}
export function pathTextNormalNoise(options:{amplitude:Signal<number>;frequency?:Signal<number>;speed?:Signal<number>;seed?:number}):PathTextControl{
 fields(options,['amplitude','frequency','speed','seed']);const p=snapshot(options);if(p.seed!==undefined&&!Number.isSafeInteger(p.seed))fail('seed must be a safe integer');return(units,c)=>{const a=scalar(p.amplitude,c,'amplitude'),f=scalar(p.frequency??.02,c,'frequency'),speed=scalar(p.speed??1,c,'speed'),seed=p.seed??c.seed;if(f<0||!Number.isSafeInteger(seed))fail('Nonnegative frequency and safe seed required');return units.map(u=>{const phase=finite(u.centerX*f+c.time*speed,'noise phase');if(Math.abs(phase)>Number.MAX_SAFE_INTEGER-1)fail('Noise phase exceeds Float64 cell resolution');return {normal:finite(noise1(BigInt(seed),phase)*a,'normal noise')};});};
}
export function pathTextFan(options:{spreadDegrees:Signal<number>;center?:number;order?:'logical'|'visual'}):PathTextControl{
 fields(options,['spreadDegrees','center','order']);const p=snapshot(options),center=fraction(p.center??.5,'center'),order=p.order??'visual';if(!['logical','visual'].includes(order))fail('logical/visual order required');return(units,c)=>{const spread=scalar(p.spreadDegrees,c,'spreadDegrees');return units.map(u=>({rotationDegrees:finite(((u.pathCount<=1?center:(order==='logical'?u.logicalRank:u.pathRank)/(u.pathCount-1))-center)*spread,'fan rotation')}));};
}
export function pathTextTaper(options:{startScale:Signal<number>;endScale:Signal<number>;order?:'logical'|'visual'}):PathTextControl{
 fields(options,['startScale','endScale','order']);const p=snapshot(options),order=p.order??'visual';if(!['logical','visual'].includes(order))fail('logical/visual order required');return(units,c)=>{const a=scalar(p.startScale,c,'startScale'),b=scalar(p.endScale,c,'endScale');return units.map(u=>{const t=u.pathCount<=1?0:(order==='logical'?u.logicalRank:u.pathRank)/(u.pathCount-1),scale=finite(a*(1-t)+b*t,'taper scale');return {scaleX:scale,scaleY:scale};});};
}
/** Existing local-time stagger of a normal Signal/selector, not a second animation system. */
export function pathTextStagger(options:{progress:Signal<number>;delaySeconds:number;order?:'logical'|'visual';normalFrom?:Signal<number>;rotationFromDegrees?:Signal<number>;scaleFrom?:Signal<number>}):PathTextControl{
 fields(options,['progress','delaySeconds','order','normalFrom','rotationFromDegrees','scaleFrom']);const p=snapshot(options),progress=staggerGlyphSelector((_,c)=>fraction(scalar(p.progress,c,'progress'),'progress'),{delaySeconds:finite(p.delaySeconds,'delaySeconds'),order:p.order??'logical',clock:'local'});return(units,c)=>units.map(u=>{const w=progress({...u,logicalIndex:u.logicalRank,visualIndex:u.pathRank},c),remaining=1-w,s=scalar(p.scaleFrom??1,c,'scaleFrom')*remaining+w;return {normal:scalar(p.normalFrom??0,c,'normalFrom')*remaining,rotationDegrees:scalar(p.rotationFromDegrees??0,c,'rotationFromDegrees')*remaining,scaleX:s,scaleY:s,opacity:w};});
}
/** Offset/normal/angle sum, local scales/opacity product. General ordered world affine
 * composition still belongs to existing composeGlyphTransforms, after placement. */
export function composePathTextControls(...controls:readonly PathTextControl[]):PathTextControl{
 if(controls.some(c=>typeof c!=='function'))fail('Pure batch control callbacks required');const all=[...controls];return(units,c)=>{const out=units.map(()=>adjustment());for(const control of all){const result=control(units,c);if(!Array.isArray(result)||result.length!==units.length)fail('One adjustment per existing unit required');for(let i=0;i<out.length;i++){const v=adjustment(result[i]),r=out[i];r.distance=finite(r.distance+v.distance,'distance sum');r.normal=finite(r.normal+v.normal,'normal sum');r.rotationDegrees=finite(r.rotationDegrees+v.rotationDegrees,'angle sum');r.scaleX=finite(r.scaleX*v.scaleX,'scaleX product');r.scaleY=finite(r.scaleY*v.scaleY,'scaleY product');r.opacity*=v.opacity;}}return out;};
}
export function selectPathTextControl(input:GlyphSelector,control:PathTextControl):PathTextControl{
 selector(input);if(typeof control!=='function')fail('Pure batch control required');return(units,c)=>{const values=control(units,c);if(!Array.isArray(values)||values.length!==units.length)fail('One adjustment per existing unit required');return units.map((u,i)=>{const a=adjustment(values[i]),w=weight(input,u,c);return {distance:a.distance*w,normal:a.normal*w,rotationDegrees:a.rotationDegrees*w,scaleX:1+(a.scaleX-1)*w,scaleY:1+(a.scaleY-1)*w,opacity:1+(a.opacity-1)*w};});};
}
