/** Prepared code/assets become ordinary bundled project or R1 module source.
 * This provenance list is not a replacement for either content lock. */
export interface ServoDocument {
 version:1;profile:'sdr-srgb8';html:string;javascript:string;
 resources:readonly {id:string;bytes:number;sha256:string}[];
 notices?:readonly {id:string;text:string}[];
}
