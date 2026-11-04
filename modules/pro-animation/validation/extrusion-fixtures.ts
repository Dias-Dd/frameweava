import type {PathData,PathCommand} from '../../graphics-contracts/types.ts';
export const extrusionCoordinates={spaceId:'stage',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:240,height:160};
const ring=(p:number[][],id:string):PathCommand[]=>[...p.map(([x,y],i):PathCommand=>({op:i?'L':'M',point:{id:id+i,x,y}})),{op:'Z'}];
export function extrusionShape(kind:'ornament'|'reference'):PathData{return {schema:'frameweave.path',version:1,id:kind,coordinates:extrusionCoordinates,fillRule:'evenodd',commands:kind==='reference'?ring([[16,12],[48,12],[48,36],[16,36]],'r'):[...ring([[173,49],[220,49],[220,108],[173,108]],'o'),...ring([[185,62],[208,62],[208,94],[185,94]],'h')]};}
