// SPDX-License-Identifier: Apache-2.0
import {EngineError} from '../../../../src/core/errors.ts';
import * as graphics from '../../../graphics-contracts/index.ts';
export interface SourceRange {readonly start:number;readonly end:number}
export interface TextBox {readonly left:number;readonly top:number;readonly right:number;readonly bottom:number;readonly width:number;readonly height:number}
export const fail=(parameter:string,message:string):never=>{throw new EngineError('E_PA_TEXT_LAYOUT',`${parameter}: ${message}`,{details:{parameter}});};
export function finite(n:number,name:string){if(typeof n!=='number'||!Number.isFinite(n))fail(name,'finite number');return n;}
export function sourceText(text:string){if(typeof text!=='string')fail('text','Unicode source string');if(text.length>graphics.LIMITS.string)throw new EngineError('E_GRAPHICS_LIMIT','Text exceeds the existing canonical string budget');for(const ch of text){const n=ch.codePointAt(0)!;if(n>=0xd800&&n<=0xdfff)fail('text','well-formed Unicode scalars');}return text;}
export function indexAt(text:string,index:number){if(!Number.isSafeInteger(index)||index<0||index>text.length||index>0&&index<text.length&&text.charCodeAt(index)>=0xdc00&&text.charCodeAt(index)<=0xdfff&&text.charCodeAt(index-1)>=0xd800&&text.charCodeAt(index-1)<=0xdbff)fail('source index','UTF16 scalar boundary inside original text');return index;}
export function rangeAt(text:string,range:SourceRange){if(!range||typeof range!=='object')fail('source range','UTF16 range object');indexAt(text,range.start);indexAt(text,range.end);if(range.start>range.end)fail('source range','ordered UTF16 boundaries');return range;}
export function overlap(a:SourceRange,b:SourceRange){return a.start<a.end&&b.start<b.end&&a.start<b.end&&b.start<a.end;}
export function box(left:number,top:number,right:number,bottom:number):TextBox{[left,top,right,bottom].forEach(n=>finite(n,'box'));return Object.freeze({left,top,right,bottom,width:right-left,height:bottom-top});}
export function union(boxes:readonly (TextBox|null)[]):TextBox|null{let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;for(const b of boxes)if(b){left=Math.min(left,b.left);top=Math.min(top,b.top);right=Math.max(right,b.right);bottom=Math.max(bottom,b.bottom);}return left===Infinity?null:box(left,top,right,bottom);}
export function frozen<T>(value:T):T{const pending:unknown[]=[value],seen=new WeakSet<object>();while(pending.length){const item=pending.pop();if(item&&typeof item==='object'&&!seen.has(item)){seen.add(item);for(const child of Object.values(item))pending.push(child);Object.freeze(item);}}return value;}
