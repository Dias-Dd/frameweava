/** BSD-3-Clause, derived from OCIO v2.5.2 SSE.h / Grading*OpCPU.cpp.
 * Preserve the official CPU grading polynomial and operation order explicitly
 * on every GPU. This is a frozen algorithm, not host-ISA/backend detection.
 * Other OCIO transforms retain the existing compensated transcendental math. */
const f=(x:number)=>String(Math.fround(x));
const log=[.04487361286440374,-.4165637071209677,1.6311488261194363,-3.550793018041176,5.091710879305474,-2.8003640543959657],exp=[.013534167928335474,.05201146058412685,.24144275690918652,.6930038344665415,1.0000025933706032];
const horner=(a:number[],x:string)=>a.slice(1).reduce((s,v)=>'('+s+'*'+x+'+'+f(v)+')',f(a[0]));
const helpers=`float ocio_cpu_log2(float x){uint bits=floatBitsToUint(x);float m=uintBitsToFloat((bits&0x807fffffu)|0x3f800000u);int e=int((bits&0x7f800000u)>>23u)-127;return ${horner(log,'m')}+float(e);}
float ocio_cpu_exp2(float x){if(x< -126.)return 0.;if(x>=128.)return uintBitsToFloat(0x7f800000u);int i=int(x)-(x<0.?1:0);float t=x-float(i);return uintBitsToFloat(uint(i+127)<<23u)*${horner(exp,'t')};}
float ocio_cpu_power(float x,float y){return x>0.?ocio_cpu_exp2(y*ocio_cpu_log2(x)):0.;}
float ocio_cpu_contrast(float c,float k,float p){float v=c/p;float r=ocio_cpu_power(abs(v),k)*p;return uintBitsToFloat(floatBitsToUint(r)^(floatBitsToUint(v)&0x80000000u));}
vec3 ocio_cpu_contrast(vec3 c,vec3 k,float p){return vec3(ocio_cpu_contrast(c.r,k.r,p),ocio_cpu_contrast(c.g,k.g,p),ocio_cpu_contrast(c.b,k.b,p));}
vec3 ocio_cpu_exposure(vec3 c,float e,float k,float p){if(k==1.)return c*e;float scale=e/p;return vec3(ocio_cpu_power(c.r*scale,k),ocio_cpu_power(c.g*scale,k),ocio_cpu_power(c.b*scale,k))*p;}
float ocio_cpu_linlog(float c){return c>${f(.0041318374739483946)}?ocio_cpu_log2((c+${f(-.000157849851665374)})*${f(1/Math.fround(Math.fround(.18)+Math.fround(-.000157849851665374)))}):c*${f(363.034608563)}-7.;}
vec3 ocio_cpu_linlog(vec3 c){return vec3(ocio_cpu_linlog(c.r),ocio_cpu_linlog(c.g),ocio_cpu_linlog(c.b));}
float ocio_cpu_loglin(float c){return c> -5.5?ocio_cpu_power(2.,c)*${f(Math.fround(.18)+Math.fround(-.000157849851665374))} - (${f(-.000157849851665374)}):(c+7.)*${f(1/Math.fround(363.034608563))};}
vec3 ocio_cpu_loglin(vec3 c){return vec3(ocio_cpu_loglin(c.r),ocio_cpu_loglin(c.g),ocio_cpu_loglin(c.b));}
`;
/** Only source-confirmed v2.5.2 linear grading forms. Unrelated pow/log calls
 * are not replaced, and Naga still performs the actual language validation. */
export function cpuGrading(source:string,version:string){
 if(version!=='2.5.2')return source;let used=false,code=source;
 if(code.includes("// Add ExposureContrast 'linear' processing"))code=code.replace(/outColor\.rgb = outColor\.rgb \* exposure;\s*if \(contrast != 1\.0\)\s*\{\s*outColor\.rgb = pow\( max\( vec3\(0\., 0\., 0\.\), outColor\.rgb \/ vec3\(([^,]+), [^,]+, [^)]+\) \), vec3\(contrast, contrast, contrast\) \) \* vec3\([^)]+\);\s*\}/g,(_m,pivot:string)=>{used=true;return `outColor.rgb = ocio_cpu_exposure(outColor.rgb,exposure,contrast,${pivot});`;});
 code=code.replace(/outColor\.rgb = pow\( abs\(outColor\.rgb \/ (ocio_uniform_\d+\(\))\), (ocio_uniform_\d+\(\)) \) \* sign\(outColor\.rgb\) \* \1;/g,(_m,pivot:string,contrast:string)=>{used=true;return `outColor.rgb = ocio_cpu_contrast(outColor.rgb,${contrast},${pivot});`;});
 if(code.includes("// Add GradingRGBCurve 'linear'")){
  code=code.replace(/vec3 ylog = base2 \* log\( \( outColor\.rgb \+ shift \) \* m \);/g,()=>{used=true;return 'vec3 ylog = ocio_cpu_linlog(outColor.rgb);';})
   .replace(/vec3 xlog = pow\( vec3\(2\., 2\., 2\.\), outColor\.rgb \) \* \(0\.18 \+ shift\) - shift;/g,()=>{used=true;return 'vec3 xlog = ocio_cpu_loglin(outColor.rgb);';})
   .replace(/vec3 xlin = \(outColor\.rgb - offs\) \/ gain;/g,`vec3 xlin = (outColor.rgb - offs) * ${f(1/Math.fround(363.034608563))};`);
 }
 return used?helpers+'\n'+code:code;
}
