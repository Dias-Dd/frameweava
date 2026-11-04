/** BSD-3-Clause derived OCIO 2.5.2 CPU/GLSL operation-order adapter.
 * Source: frozen v2.5.2 ACES2/{Transform.cpp,Common.h}, FixedFunctionOpCPU.cpp.
 * No fixture-selected constants, altered tables or tolerance changes. */
function alignAces2Forward(source:string,version:string):string{
 if(version!=='2.5.2'||!source.includes('// Add RGB to JMh'))return source;
 const calls=[...source.matchAll(/float J_ts = (\w+_tonescale_fwd\d+)\((\w+)\.r\);/g)];
 const helpers:string[]=[];
 for(const call of calls){const at=call.index!,rgb=source.lastIndexOf('// Add RGB to JMh',at),end=source.lastIndexOf('// Add JMh to RGB',at);if(rgb<0||rgb<end)continue;
  const name=call[1],helper=source.match(new RegExp('float '+name+'\\(float J\\)\\s*\\{([^}]+)\\}'));if(!helper)throw Error('OCIO 2.5.2 combined forward helper changed');
  const body=helper[1],aw=body.match(/float A = ([\d.e+-]+) \* pow/),offset=body.match(/float Y = pow\(\( ([\d.e+-]+) \* A\)/),tone=body.match(/float f = ([\d.e+-]+) \* pow\(Y \/ \(Y \+ ([\d.e+-]+)\), ([\d.e+-]+)\)/),t1=body.match(/f \+ ([\d.e+-]+)\)/),fl=body.match(/float F_L_Y = pow\(([\d.e+-]+) \* Y_ts/),j=body.match(/\* ([\d.e+-]+), ([\d.e+-]+)\);\s*return sign\(J\)/);
  if(!aw||!offset||!tone||!t1||!fl||!j)throw Error('OCIO 2.5.2 combined forward constants changed');
  const F=Math.fround,FL=F(Number(fl[1])/100),s2=F(Number(tone[2])/FL),literal=(n:number)=>{if(!Number.isFinite(n)||n<=0)throw Error('Invalid OCIO CPU constant');return String(n);},adapted=name+'_from_A';
  helpers.push(`float ${adapted}(float AabValue){if(AabValue<=0.)return 0.;float A=min(${aw[1]}*AabValue,0.99);float Y=pow((${offset[1]}*A)/(1.-A),${literal(F(1/F(.42)))})/${literal(FL)};float f=${tone[1]}*pow(Y/(Y+${literal(s2)}),${tone[3]});float Y_ts=max(0.,f*f/(f+${t1[1]}))*100.;float F_L_Y=pow(Y_ts*${literal(FL)},0.42);return 100.*pow((F_L_Y/(${offset[1]}+F_L_Y))*${j[1]},${j[2]});}`);
  source=source.replace(call[0],`float J_ts = ${adapted}(Aab.r);`);
 }
 // CPU sums unscaled F32 harmonic weights, then multiplies the final scale.
 // The stock GPU generator pre-scales each weight in double precision instead.
 source=source.replace(/Mnorm = dot\(cosines, cosine_weights\) \+ dot\(sines, sine_weights\) \+ ([\d.e+-]+);/g,(_whole:string,tail:string)=>{const scale=Math.fround(Number(tail)/77.12896);if(!Number.isFinite(scale)||scale<=0)throw Error('Invalid OCIO chroma scale');return 'Mnorm = ((((((11.34072*cos_hr + 16.46899*cos_hr2) + 7.88380*cos_hr3) + 14.66441*sin_hr) - 6.37224*sin_hr2) + 9.19364*sin_hr3) + 77.12896) * '+String(scale)+';';});
 return helpers.length?helpers.join('\n')+'\n'+source:source;
}

export function aces2CpuOrder(source:string,version:string){
 if(version!=='2.5.2'||!source.includes('// Add RGB to JMh'))return source;
 // CPU Common.h uses (180*atan)/PI and (PI*h)/180, not multiplication
 // by pre-divided constants. It does not replace atan2(y,0) with zero.
 return alignAces2Forward(source,version)
  .replace(/float h = \(Aab\.g == 0\.0\) \? 0\.0 : atan\(Aab\.b, Aab\.g\) \* [\d.e+-]+;/g,'float h = (180. * atan(Aab.b,Aab.g)) / 3.1415927410125732;')
  .replace(/h = h - floor\(h \/ 360\.0\) \* 360\.0;/g,'')
  .replace(/float h_rad = (\w+\.b) \* 0\.0174532924;/g,'float h_rad = (3.1415927410125732 * $1) / 180.;');
}
