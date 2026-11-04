import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {NativeRasterFilters} from './filters.ts';
export type RasterName=keyof NativeRasterFilters;
export const calls={
 blur:(f,a)=>f.blur(a,{radius:.7,boundary:'transparent'}),
 glow:(f,a)=>f.glow(a,{radius:.8,threshold:.4,intensity:1.3,boundary:'clamp'}),
 feather:(f,a)=>f.feather(a,{radius:.7,boundary:'clamp'}),
 fill:(f,a)=>f.fill(a,{color:[3,-.5,.75],opacity:.71300000001}),
 applyMatte:(f,a,b)=>f.applyMatte(a,b,{opacity:.71300000001}),
 dropShadow:(f,a)=>f.dropShadow(a,{color:[2,-.25,.5],opacity:.71300000001,radius:.7,offset:[-1.25,1.75]}),
 reframe:(f,a)=>f.reframe(a,{x:-2,y:1,flipX:true,flipY:true}),
 mergeMatte:(f,a,b)=>f.mergeMatte(a,b),
 alphaToRGB:(f,a)=>f.alphaToRGB(a,{color:[3,-.5,.75]}),
 flattenBlack:(f,a)=>f.flattenBlack(a),
 tile:(f,a)=>f.tile(a,{offset:[Number.MAX_SAFE_INTEGER,-Number.MAX_SAFE_INTEGER],mode:'mirror'}),
 exposure:(f,a)=>f.exposure(a,{stops:.7}),
 invert:(f,a)=>f.invert(a),
 add:(f,a,b)=>f.add(a,b),
 invertMatte:(f,a)=>f.invertMatte(a),
 replaceMatte:(f,a,b)=>f.replaceMatte(a,b),
 modulate:(f,a,b)=>f.modulate(a,b),
 over:(f,a,b)=>f.over(a,b,{opacity:.71300000001}),
 screen:(f,a,b)=>f.screen(a,b,{opacity:.71300000001}),
 multiply:(f,a,b)=>f.multiply(a,b,{opacity:.71300000001}),
 offsetRGB:(f,a)=>f.offsetRGB(a,{offset:[.37,-.25,1.125]}),
 subtractMatte:(f,a,b)=>f.subtractMatte(a,b),
 crossfade:(f,a,b)=>f.crossfade(a,b,{mix:.71300000001}),
} satisfies Record<RasterName,(f:NativeRasterFilters,a:GpuPixelImage,b:GpuPixelImage)=>Promise<GpuPixelImage>>;
