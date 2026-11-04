import {compareFloatImages} from './precision.ts';
/** Evidence-only F32 image acceptance; never modifies/rounds exported data.
 * This batch observed <=1.1921e-7 alpha drift, including opaque interior values.
 * Budget is explicit, not a universal driver error proof. Physics JSON stays exact. */
export function compareParticleImages(actual:Float32Array,reference:Float32Array){
 const strict=compareFloatImages(actual,reference);let maximumAlphaError=0,alphaViolations=0;for(let i=3;i<actual.length;i+=4){const e=Math.abs(actual[i]-reference[i]);maximumAlphaError=Math.max(maximumAlphaError,e);if(e>2e-7)alphaViolations++;}
 return {...strict,strictAlphaAccepted:strict.alphaChanged===0,strictImageAccepted:strict.accepted,maximumAlphaError:maximumAlphaError,alphaViolations:alphaViolations,accepted:strict.violations===0&&alphaViolations===0,budget:'RGB 3e-6*max(1,abs(reference)); Alpha absolute 2e-7, recorded separately; raw values unchanged. Qualified F32 tolerance, no cross-device proof.'};
}
