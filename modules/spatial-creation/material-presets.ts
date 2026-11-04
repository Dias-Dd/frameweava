import type {MaterialOptions} from './types.ts';import {assetOptions} from './physics-assets.ts';import {fail} from './lifecycle.ts';
/** Existing four profiles retain every original number and field. Added
 * isotropic GGX recipes do not imply glass, transmission or anisotropy. */
export const materialStyles={
 ceramic:{ink:[.075,.52,.62],roughness:.27,metalness:.12},copper:{ink:[.85,.3,.12],roughness:.25,metalness:.75},chrome:{ink:[.65,.75,.9],roughness:.16,metalness:.92},matte:{ink:[.25,.32,.45],roughness:.8,metalness:0},
 gold:{ink:[1,.66,.23],roughness:.28,metalness:.85},silver:{ink:[.72,.78,.85],roughness:.22,metalness:.9},porcelain:{ink:[.92,.88,.8],roughness:.22,metalness:0},plastic:{ink:[.08,.35,.62],roughness:.3,metalness:0},rubber:{ink:[.018,.023,.03],roughness:.92,metalness:0},emissive:{ink:[.025,.08,.12],emissive:[.15,1.5,2.5],roughness:.5,metalness:0},
} as const;
export type CreationMaterialPreset=keyof typeof materialStyles;
export function materialPreset(name:CreationMaterialPreset,o:MaterialOptions={}):MaterialOptions{if(!Object.hasOwn(materialStyles,name))fail('Unknown material preset: '+String(name));assetOptions(o,['ink','opacity','emissive','roughness','metalness'],'material preset');try{return {...structuredClone(materialStyles[name]),...Object.fromEntries(Object.entries(structuredClone(o)).filter(([,v])=>v!==undefined))};}catch{fail('Material controls require serializable Core Signals');}}
