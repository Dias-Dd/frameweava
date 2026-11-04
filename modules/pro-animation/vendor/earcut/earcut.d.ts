// Frameweave type-only declaration for the unmodified ISC upstream source.
export default function earcut(data:readonly number[],holeIndices?:readonly number[],dim?:number):number[];
export function deviation(data:readonly number[],holeIndices:readonly number[]|undefined,dim:number,triangles:readonly number[]):number;
export function flatten(data:readonly (readonly (readonly number[])[])[]):{vertices:number[];holes:number[];dimensions:number};
