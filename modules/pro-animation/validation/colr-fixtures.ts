import type {ColrGradient,ColrColorLine} from '../src/font-execution/colr/gradient.ts';
const stops:ColrColorLine['stops']=[{at:0,color:[.8,.1,.2,1]},{at:.5,color:[0,.3,.1,.5]},{at:1,color:[.1,0,.6,.75]}];
export const colrGradientCases:readonly {name:string;brush:ColrGradient;line:ColrColorLine}[]=[
 ...(['pad','repeat','reflect']as const).map(extend=>({name:'linear-'+extend,brush:{op:'linear' as const,geometry:[4.5,0,12.5,0],extend,stops:[]},line:{extend,stops}})),
 {name:'duplicate',brush:{op:'linear',geometry:[.5,0,16.5,0],extend:'pad',stops:[]},line:{extend:'pad',stops:[stops[0],{at:.5,color:[.5,0,0,.5]},{at:.5,color:[0,.75,0,.75]},stops[2]]}},
 {name:'radial-cone',brush:{op:'radial',geometry:[2.5,6.5,1,13.5,6.5,4],extend:'pad',stops:[]},line:{extend:'pad',stops}},
 {name:'radial-negative',brush:{op:'radial',geometry:[4.5,6.5,-3,10.5,6.5,6],extend:'reflect',stops:[]},line:{extend:'reflect',stops}},
 {name:'radial-strip',brush:{op:'radial',geometry:[2.5,6.5,4,12.5,6.5,4],extend:'repeat',stops:[]},line:{extend:'repeat',stops}},
 {name:'radial-identical',brush:{op:'radial',geometry:[8,6,3,8,6,3],extend:'pad',stops:[]},line:{extend:'pad',stops}},
 ...(['pad','repeat','reflect']as const).map(extend=>({name:'sweep-'+extend,brush:{op:'sweep' as const,geometry:[8.5,6.5,30,260],extend,stops:[]},line:{extend,stops}})),
 {name:'sweep-outside',brush:{op:'sweep',geometry:[8.5,6.5,-130,460],extend:'pad',stops:[]},line:{extend:'pad',stops}},
 {name:'sweep-degenerate',brush:{op:'sweep',geometry:[8.5,6.5,90,90],extend:'pad',stops:[]},line:{extend:'pad',stops}},
 {name:'empty',brush:{op:'linear',geometry:[0,0,17,0],extend:'pad',stops:[]},line:{extend:'pad',stops:[]}},
 {name:'single',brush:{op:'linear',geometry:[0,0,17,0],extend:'repeat',stops:[]},line:{extend:'repeat',stops:[{at:.5,color:[1.2,-.2,0,.7]}]}},
 {name:'equal-stops',brush:{op:'linear',geometry:[0,0,17,0],extend:'repeat',stops:[]},line:{extend:'repeat',stops:[{at:.5,color:[1,0,0,1]},{at:.5,color:[0,1,0,1]}]}},
];
