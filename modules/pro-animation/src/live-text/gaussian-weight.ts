// SPDX-License-Identifier: Apache-2.0
// Coefficient transport only: retain original Gaussian samples, normalization and compensated GPU sum.
import {EngineError} from '../../../../src/core/errors.ts';
export function splitTextCoefficient(n:number):readonly [number,number]{
 const hi=Math.fround(n),lo=Math.fround(n-hi);if(!Number.isFinite(n)||!Number.isFinite(hi)||!Number.isFinite(lo)||n!==0&&hi===0||hi!==0&&Math.abs(hi)<2**-126||lo!==0&&Math.abs(lo)<2**-126)throw new EngineError('E_GPU_FLOAT_PRECISION','Text coefficient exceeds qualified F32-pair domain');return [hi,lo];
}
/** [mantissa-high, mantissa-low, binary-exponent, reserved]. Normal pairs retain exact old transport.
 * For tiny positive Gaussian weights the exponent is applied AFTER multiplying the sample, in normal
 * power-of-two steps on GPU. No coefficient is silently set to zero or rounded through SDR/Half.
 * Final image arithmetic/storage still follows the existing qualified Native F32/F16 profile. */
export function packTextGaussianWeight(n:number):readonly [number,number,number,number]{
 if(!Number.isFinite(n)||n<0||n>1)throw new EngineError('E_GPU_FLOAT_PRECISION','Normalized finite Gaussian weight required');try{const [hi,lo]=splitTextCoefficient(n);return [hi,lo,0,0];}catch(error){if(!(error instanceof EngineError)||error.code!=='E_GPU_FLOAT_PRECISION')throw error;}
 // 2^-1022 is the smallest normal Float64. Division by it is safe even for Number.MIN_VALUE.
 const exponent=Math.min(0,Math.max(-1022,Math.ceil(Math.log2(n)))),mantissa=n/2**exponent,[hi,lo]=splitTextCoefficient(mantissa);return [hi,lo,exponent,0];
}
