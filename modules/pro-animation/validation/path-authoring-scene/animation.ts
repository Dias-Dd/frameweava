import {keyframes} from '../../../../src/core/animation.ts';
import type {PathData} from '../../../graphics-contracts/types.ts';
export const inkAlpha=keyframes([{frame:0,value:.65},{frame:7,value:.85}]);
/** Fixture-only plain control-word trace, not a professional data schema. */
export function pathWords(cases:readonly {path:PathData|null}[]){const words:number[]=[];for(const item of cases){if(!item.path)throw Error('actual nonempty path expected');words.push(item.path.commands.length);for(const command of item.path.commands){if(command.op==='Z'){words.push(5);continue;}words.push(command.op==='M'?1:command.op==='L'?2:command.op==='Q'?3:4);if(command.op==='C')words.push(command.control1.x,command.control1.y,command.control2.x,command.control2.y);if(command.op==='Q')words.push(command.control.x,command.control.y);words.push(command.point.x,command.point.y);}}return words;}
