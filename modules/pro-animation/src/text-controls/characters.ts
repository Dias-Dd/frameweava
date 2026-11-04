// SPDX-License-Identifier: Apache-2.0 AND Unicode-3.0
// Pinned UCD16 general-category/block lookup; no OS locale/font discovery or new shaping system.
import type {Signal} from '../../../../src/core/types.ts';
import {characterOffset,characterValue,type CharacterControl} from '../live-text/controls.ts';
import {sourceText} from '../text-layout/common.ts';
import {fields,number,snapshot,finite,fail,type GlyphSelector} from '../text-animation/common.ts';
import {characterGroups,characterIntervals,characterGroupUnicode} from './character-data.ts';
for(const g of characterGroups){for(const r of g.ranges)Object.freeze(r);Object.freeze(g.ranges);Object.freeze(g);}for(const r of characterIntervals)Object.freeze(r);Object.freeze(characterGroups);Object.freeze(characterIntervals);
const scalar=(v:number)=>{if(!Number.isInteger(v)||v<0||v>0x10ffff||v>=0xd800&&v<=0xdfff)fail('character','Unicode scalar');return v;};
export function characterGroupInfo(value:number|string){
 const cp=typeof value==='string'?(()=>{sourceText(value);if([...value].length!==1)fail('character','one Unicode scalar');return value.codePointAt(0)!;})():scalar(value);let lo=0,hi=characterIntervals.length;while(lo<hi){const mid=(lo+hi)>>>1;if(characterIntervals[mid][1]<cp)lo=mid+1;else hi=mid;}const entry=characterIntervals[lo];if(!entry||cp<entry[0])return null;const group=characterGroups[entry[2]];return Object.freeze({id:entry[2],unicode:characterGroupUnicode,block:group.block,kind:group.kind,count:group.count,rank:entry[3]+cp-entry[0]});
}
export function characterFromGroup(id:number,rank:number):string{
 if(!Number.isSafeInteger(id)||id<0||id>=characterGroups.length||!Number.isSafeInteger(rank))fail('group/rank','existing group ID and signed safe rank');const group=characterGroups[id],at=((rank%group.count)+group.count)%group.count;let lo=0,hi=group.ranges.length;while(lo<hi){const mid=(lo+hi)>>>1,r=group.ranges[mid];if(r[2]+r[1]-r[0]<at)lo=mid+1;else hi=mid;}const r=group.ranges[lo];return String.fromCodePoint(r[0]+at-r[2]);
}
/** Groups preserve case, numeric sets and script blocks, including Katakana. Marks/separators/format controls stay attached.
 * Decimal digit groups are individual ten-digit sets. Each symbol group is scoped to its original Unicode block.
 * This pinned grouping policy is explicit; it is not a claim about Adobe's unpublished internal group table. */
export function characterOffsetPreserving(amount:Signal<number>):CharacterControl{const p=snapshot(amount);return(u,c)=>{const offset=number(p,c,'character offset');if(!Number.isSafeInteger(offset))fail('offset','signed safe integer');sourceText(u.text);return [...u.text].map(ch=>{const g=characterGroupInfo(ch);return g?characterFromGroup(g.id,g.rank+offset%g.count):ch;}).join('');};}
/** Unicode Value maps the candidate's group rank into the source group; null-group characters remain untouched. */
export function characterValuePreserving(value:Signal<number>):CharacterControl{const p=snapshot(value);return(u,c)=>{const code=scalar(number(p,c,'character value')),candidate=characterGroupInfo(code);sourceText(u.text);return [...u.text].map(ch=>{const group=characterGroupInfo(ch);return group?characterFromGroup(group.id,candidate?.rank??code):ch;}).join('');};}
export function characterRangeOffset(amount:Signal<number>,options:{range?:'preserve-groups'|'full-unicode'}={}):CharacterControl{fields(options,['range']);const range=options.range??'preserve-groups';if(!['preserve-groups','full-unicode'].includes(range))fail('range','preserve-groups or full-unicode');return range==='full-unicode'?characterOffset(amount):characterOffsetPreserving(amount);}
export function characterRangeValue(value:Signal<number>,options:{range?:'preserve-groups'|'full-unicode'}={}):CharacterControl{fields(options,['range']);const range=options.range??'preserve-groups';if(!['preserve-groups','full-unicode'].includes(range))fail('range','preserve-groups or full-unicode');return range==='full-unicode'?characterValue(value):characterValuePreserving(value);}
export function characterClassSelector(kinds:readonly ('upper'|'lower'|'title'|'letter'|'digit'|'number'|'symbol'|'unchanged')[],options:{match?:'any'|'all'}={}):GlyphSelector{fields(options,['match']);if(!Array.isArray(kinds)||kinds.some(k=>!['upper','lower','title','letter','digit','number','symbol','unchanged'].includes(k)))fail('kinds','known Unicode group kinds');const all=new Set<string>(kinds),match=options.match??'any';if(!['any','all'].includes(match))fail('match','any or all');return u=>{sourceText(u.text);const values=[...u.text].filter(ch=>!/^\p{M}$/u.test(ch)).map(ch=>all.has(characterGroupInfo(ch)?.kind??'unchanged'));return Number(values.length>0&&(match==='any'?values.some(Boolean):values.every(Boolean)));};}
