import {cloneEditData as structuredClone} from './data.ts';
import type {PreparedParagraphMeshes} from '../pro-animation/src/text-layout/native.ts';
import type {EditAsset} from './types.ts';
import {EngineError} from '../../src/core/errors.ts';
export interface TextAsset {
 readonly kind:'text';readonly id:string;readonly width:number;readonly height:number;
 readonly text:string;readonly paragraph:PreparedParagraphMeshes;
 readonly ink:readonly [number,number,number,number];
 readonly offsetY:number;
 readonly plate?:{readonly box:readonly[number,number,number,number];readonly color:readonly[number,number,number,number]};
}
export function textError(message:string):never{throw new EngineError('E_EDIT_TEXT',message);}
export function validateTextAsset(asset:TextAsset){
 if(!asset||asset.kind!=='text'||typeof asset.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(asset.id)||!Number.isSafeInteger(asset.width)||!Number.isSafeInteger(asset.height)||asset.width<1||asset.height<1)textError('Text asset needs an id and positive viewport dimensions');
 for(const k of Object.keys(asset))if(!['kind','id','width','height','text','paragraph','ink','offsetY','plate'].includes(k))textError('Unknown text asset property '+k);
 const p=asset.paragraph;if(!p||p.layout?.text!==asset.text||p.layout.coordinates.width!==asset.width||p.layout.coordinates.height!==asset.height||p.layout.coordinates.unit!=='px'||!Array.isArray(p.positions)||!Array.isArray(p.vertexUnits)||p.positions.length!==p.vertexUnits.length*3)textError('Text must match its original prepared paragraph and viewport');
 const color=(v:readonly number[])=>Array.isArray(v)&&v.length===4&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Number.isFinite(Math.fround(n)))&&v[3]>=0&&v[3]<=1;
 if(!color(asset.ink)||!Number.isFinite(asset.offsetY))textError('Expected scene-linear RGBA and finite text placement');
 if(asset.plate){const b=asset.plate.box;if(!color(asset.plate.color)||!Array.isArray(b)||b.length!==4||b.some(n=>!Number.isFinite(n))||b[2]<=0||b[3]<=0)textError('Expected a positive caption plate and scene-linear RGBA');}
 return asset;
}
/** Accept real, existing paragraph preparation. No invented glyph boxes or raster substitute. */
export function preparedText(id:string,paragraph:PreparedParagraphMeshes,options:{ink?:TextAsset['ink'];offsetY?:number;plate?:TextAsset['plate']}={}):TextAsset {
 const asset:TextAsset={kind:'text',id,width:paragraph.layout.coordinates.width!,height:paragraph.layout.coordinates.height!,text:paragraph.layout.text,paragraph,ink:options.ink??[1,1,1,1],offsetY:options.offsetY??0,...options.plate?{plate:options.plate}:{}};
 validateTextAsset(asset);return structuredClone(asset);
}
