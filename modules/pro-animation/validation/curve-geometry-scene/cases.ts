import type {PathData} from '../../../graphics-contracts/types.ts';
import type {Cubic} from '../../src/geometry.ts';
export const controlPoints:Cubic=[[40,185],[160,10],[460,320],[600,70]];
export function sourceCurve():PathData{const p=(i:number)=>({id:'p.'+i,x:controlPoints[i][0],y:controlPoints[i][1]});return {schema:'frameweave.path',version:1,id:'precise.curve',coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:640,height:400},fillRule:'nonzero',commands:[{op:'M',point:p(0)},{op:'C',control1:p(1),control2:p(2),point:p(3)}]};}
