import type {LayerSpec} from '../core/types.ts';
export type Affine=[number,number,number,number,number,number];
export const identity:Affine=[1,0,0,1,0,0];
export const multiply=(a:Affine,b:Affine):Affine=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function matrix(layer:LayerSpec):Affine {const angle=Number(layer.rotation??0)*Math.PI/180,s=Number(layer.scale??1),sx=s*Number(layer.scaleX??1),sy=s*Number(layer.scaleY??1),ox=layer.originX??0,oy=layer.originY??0,c=Math.cos(angle),t=Math.sin(angle);return [c*sx,t*sx,-t*sy,c*sy,Number(layer.x??0)+ox-c*sx*ox+t*sy*oy,Number(layer.y??0)+oy-t*sx*ox-c*sy*oy];}
export function invert(a:Affine):Affine|undefined {const d=a[0]*a[3]-a[1]*a[2];if(Math.abs(d)<1e-12)return;return [a[3]/d,-a[1]/d,-a[2]/d,a[0]/d,(a[2]*a[5]-a[3]*a[4])/d,(a[1]*a[4]-a[0]*a[5])/d];}
