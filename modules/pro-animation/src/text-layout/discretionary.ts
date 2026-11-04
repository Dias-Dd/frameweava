// SPDX-License-Identifier: Apache-2.0
import {EngineError} from '../../../../src/core/errors.ts';
export interface PlacedDiscretionaryHyphen {readonly sourceIndex:number;readonly replacement:string;readonly glyphIndices:readonly number[];readonly direction:'ltr'|'rtl'}
/** Explicit language policy, not an automatic dictionary/spelling hyphenator. */
export function discretionaryMarker(value:string){const points=typeof value==='string'?[...value]:[];if(points.length!==1||/^[\p{C}\p{Z}\p{M}]$/u.test(value))throw new EngineError('E_PA_TEXT_DISCRETIONARY','Supply one explicit visible Unicode scalar for a soft-hyphen break');return value;}
