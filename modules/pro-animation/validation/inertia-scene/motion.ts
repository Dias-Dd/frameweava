import {createInertia,type InertiaOptions} from '../../../../modules/pro-animation/src/inertia.ts';
/** Finite composition range is explicit in project.tsx. These response functions have no implicit end. */
export const motionSpecs:{id:string;y:number;options:InertiaOptions}[]=[
 {id:'free-decay',y:42,options:{from:50,velocity:500,timeConstantSeconds:.35}},
 {id:'upper-soft-anchor',y:94,options:{from:60,velocity:1200,timeConstantSeconds:.25,bounds:{max:300,spring:{stiffness:170,damping:16}}}},
 {id:'lower-soft-anchor',y:146,options:{from:550,velocity:-1100,timeConstantSeconds:.25,bounds:{min:340,spring:{stiffness:170,damping:16}}}},
 {id:'initially-outside',y:198,options:{from:500,velocity:-120,timeConstantSeconds:.25,bounds:{max:450,spring:{stiffness:100,damping:14}}}},
];
export const motions=motionSpecs.map(spec=>({...spec,response:createInertia(spec.options)}));
