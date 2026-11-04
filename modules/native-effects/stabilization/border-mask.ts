import {warp} from './kernels.ts';
const original='let x=add(constant(data1(0u),data1(1u)),multiply(uintPair(p.x),scale));let y=add(constant(data1(2u),data1(3u)),multiply(uintPair(p.y),scale));';
if(warp.code.split(original).length!==2)throw Error('Crop shader source changed');
export const maskedCropWarp={...warp,id:warp.id+'/unscaled-mask',code:warp.code.replace(original,`let x=uintPair(p.x);let y=uintPair(p.y);let left=constant(data1(0u),data1(1u));let top=constant(data1(2u),data1(3u));let right=add(left,negate(floorP(negate(multiply(uintPair(size0().x-1u),scale)))));let bottom=add(top,negate(floorP(negate(multiply(uintPair(size0().y-1u),scale)))));if(greater(left,x)||greater(x,right)||greater(top,y)||greater(y,bottom)){return finish(sourceValue,scalar(0.));}`)};
