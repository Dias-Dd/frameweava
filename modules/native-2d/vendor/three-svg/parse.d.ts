import type {Matrix3,ShapePath} from 'three';
export interface SvgGradient {type:'linearGradient'|'radialGradient';gradientUnits:'objectBoundingBox'|'userSpaceOnUse';gradientTransform?:Matrix3;spreadMethod?:'pad'|'repeat'|'reflect';stops:readonly {offset:number;color:string;opacity:number}[];x1:number;y1:number;x2:number;y2:number;cx:number;cy:number;r:number;fx:number;fy:number}
export function parseSvgDocument(xml:Document,warning:(...message:unknown[])=>never):{gradients:Record<string,SvgGradient>;localTransform(node:Element):Matrix3;shape(node:Element):ShapePath|null};
