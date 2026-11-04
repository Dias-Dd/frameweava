import {EngineError} from '../../../src/core/errors.ts';
import {assertColor,surfaceFromPixels,type ProfessionalSurface,type ColorEncoding} from '../../../src/media/surface.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
import type {PathData} from '../../graphics-contracts/types.ts';
import type {FloatFormat} from './professional.ts';
export interface CoverageOptions {width:number;height:number;workingColor:ColorEncoding;ink:readonly [number,number,number,number];format?:FloatFormat}
export interface RasterOptions extends CoverageOptions {supersample?:1|2|4}
/** Coverage is geometry, not an SDR color image. RGB ink is arbitrary finite scene-linear HDR. */
export function surfaceFromCoverage(coverage:ArrayLike<number>,options:CoverageOptions):ProfessionalSurface{
 const {width,height,ink,workingColor}=options;assertColor(workingColor);
 if(workingColor.transfer!=='linear'||workingColor.reference!=='scene')throw new EngineError('E_PA_WORKING_COLOR','Coverage ink requires an explicit scene-linear color space');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>4194304||coverage.length!==width*height)throw new EngineError('E_PA_SIZE','Invalid coverage dimensions or 4MP budget');
 if(ink.length!==4||ink.some(v=>!Number.isFinite(v))||ink[3]<0||ink[3]>1)throw new EngineError('E_PA_PARAMETER','Finite linear RGBA ink and alpha [0,1] required');
 const format=options.format??'rgba32float';if(format!=='rgba16float'&&format!=='rgba32float')throw new EngineError('E_PA_PRECISION','Coverage output must remain floating');
 const p=new Float32Array(width*height*4);for(let i=0;i<coverage.length;i++){const a=coverage[i];if(!Number.isFinite(a)||a<0||a>1)throw new EngineError('E_PA_PARAMETER','Coverage must be finite [0,1]');p.set([ink[0]*ink[3]*a,ink[1]*ink[3]*a,ink[2]*ink[3]*a,ink[3]*a],i*4);}
 return surfaceFromPixels(width,height,p,{format,color:workingColor,alpha:'premultiplied',deferBase64:true});
}
export function rasterizeCoverage(options:RasterOptions,draw:(c:CanvasRenderingContext2D)=>void):ProfessionalSurface{
  const n=options.supersample??2;if(![1,2,4].includes(n)||!Number.isInteger(options.width)||!Number.isInteger(options.height)||options.width<1||options.height<1||options.width*options.height>4194304||options.width*options.height*n*n>16777216)throw new EngineError('E_PA_LIMIT','Raster coverage exceeds dimensions/supersampling budget');
  const canvas=document.createElement('canvas');canvas.width=options.width*n;canvas.height=options.height*n;
  try{const c=canvas.getContext('2d',{willReadFrequently:true})!;c.scale(n,n);c.fillStyle=c.strokeStyle='#ffffff';draw(c);const p=c.getImageData(0,0,canvas.width,canvas.height).data,coverage=new Float32Array(options.width*options.height);
   for(let y=0;y<options.height;y++)for(let x=0;x<options.width;x++){let a=0;for(let yy=0;yy<n;yy++)for(let xx=0;xx<n;xx++)a+=p[(((y*n+yy)*canvas.width+x*n+xx)*4)+3];coverage[y*options.width+x]=a/(255*n*n);}
   return surfaceFromCoverage(coverage,options);
  }finally{canvas.width=canvas.height=0;}
 }
