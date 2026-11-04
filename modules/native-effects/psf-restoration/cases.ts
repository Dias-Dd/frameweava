import type {PsfGridV1} from './types.ts';
export function calibration(variant=0,anchor:'input'|'output'='output'):PsfGridV1{const knots=Array.from({length:4},(_,j)=>{const k=Array(9).fill(0) as number[];if(variant===0){k[3]=.5-j*.025;k[4]=.5+j*.025;}else if(variant===1){k[1]=.425+j*.025;k[4]=.575-j*.025;}else{k[0]=.25;k[4]=.5-j*.02;k[8]=.25+j*.02;}return k;});return {kind:'frameweave.psf-grid',schemaVersion:1,anchor,columns:2,rows:2,kernelWidth:3,kernelHeight:3,kernels:knots};}
export const numericOptions={iterations:3,step:.8,regularization:.01,smoothness:.001} as const;
