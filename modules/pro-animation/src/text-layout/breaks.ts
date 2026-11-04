// SPDX-License-Identifier: Apache-2.0 AND MIT
import {Rules} from '../../vendor/unicode-linebreak/lib/index.js';
import {sourceText,frozen,type SourceRange} from './common.ts';
export interface TextSegment extends SourceRange {readonly text:string;readonly wordLike?:boolean}
/** Original Unicode16 UAX14 rules. No caller code/plugins/tailoring are executed. */
export function unicodeLineBreaks(text:string){sourceText(text);return frozen([...new Rules().breaks(text)].map(b=>({position:b.position,required:b.required})));}
/** Uses the same platform ICU primitive as existing segmentText without its old artistic unit cap.
 * Capture runtime Unicode/ICU identity when persisting; segmentation is not reshaping. */
export function textGraphemes(text:string,options:{locale?:string}={}):readonly TextSegment[]{sourceText(text);return frozen([...new Intl.Segmenter(options.locale??'und',{granularity:'grapheme'}).segment(text)].map(p=>({start:p.index,end:p.index+p.segment.length,text:p.segment})));}
export function textWords(text:string,options:{locale?:string;includeSeparators?:boolean}={}):readonly TextSegment[]{sourceText(text);return frozen([...new Intl.Segmenter(options.locale??'und',{granularity:'word'}).segment(text)].filter(p=>options.includeSeparators||p.isWordLike).map(p=>({start:p.index,end:p.index+p.segment.length,text:p.segment,wordLike:Boolean(p.isWordLike)})));}
