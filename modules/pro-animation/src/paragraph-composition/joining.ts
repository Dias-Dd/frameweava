// SPDX-License-Identifier: Apache-2.0 AND Unicode-3.0
import {EngineError} from '../../../../src/core/errors.ts';
import {joiningRanges as ranges} from './joining-data.ts';
export type JoiningType='U'|'C'|'D'|'L'|'R'|'T';
export function unicodeJoiningType(cp:number):JoiningType {
 if(!Number.isInteger(cp)||cp<0||cp>0x10ffff||cp>=0xd800&&cp<=0xdfff)throw new EngineError('E_PA_COMPOSE_PARAMETER','Unicode scalar required');
 let lo=0,hi=ranges.length/3;while(lo<hi){const mid=(lo+hi)>>>1;if(ranges[mid*3+1]<cp)lo=mid+1;else hi=mid;}
 return lo<ranges.length/3&&ranges[lo*3]<=cp?(['U','C','D','L','R','T']as const)[ranges[lo*3+2]]:'U';
}
