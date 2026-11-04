export const NANO_PROFILE='nanovdb-float-indexed-v1' as const;
export interface NanoIndexOptions {gridClass:'level-set'|'fog-volume';maxRootTiles:number}
export {nanoIndexLayout} from '../native-gpu/binary-resource.ts';
export function rootHash(low:number,high:number){let h=(low^Math.imul(high,0x9e3779b9))>>>0;h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return (h^(h>>>16))>>>0;}
