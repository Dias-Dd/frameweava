// SPDX-License-Identifier: Apache-2.0 AND Unicode-3.0
import {EngineError} from '../../../../../src/core/errors.ts';
import {verticalOrientationRanges as ranges} from './orientation-data.ts';
export type UnicodeVerticalOrientation='R'|'U'|'Tu'|'Tr';
/** Pinned UAX50 property, not guessed from script/ASCII or platform Intl. */
export function unicodeVerticalOrientation(codepoint:number):UnicodeVerticalOrientation {
 if(!Number.isInteger(codepoint)||codepoint<0||codepoint>0x10ffff||codepoint>=0xd800&&codepoint<=0xdfff)throw new EngineError('E_PA_TEXT_VERTICAL','Unicode scalar required');
 let lo=0,hi=ranges.length/3;
 while(lo<hi){const mid=(lo+hi)>>>1;if(ranges[mid*3+1]<codepoint)lo=mid+1;else hi=mid;}
 return lo<ranges.length/3&&ranges[lo*3]<=codepoint?(['R','U','Tu','Tr'] as const)[ranges[lo*3+2]]:'R';
}
