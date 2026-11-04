import type {GpuPixelKernelSource} from '../pixel-types.ts';

/** Same input values as gpu-pixel-scope-stage's CPU fixture, produced on GPU.
 * Integer/rational operations deliberately avoid vendor-dependent trig. */
export const residentSourceKernel:GpuPixelKernelSource={
 abiVersion:1,id:'frameweave/example-source',version:'1.0.0',inputCount:0,parameterWords:1,
 code:`fn pixel(p:vec2u)->vec4f{
  var a=0.;switch((p.x+p.y)%5u){case 1u:{a=.125;}case 2u:{a=.5;}case 3u:{a=.875;}case 4u:{a=1.;}default:{}}
  let v=(f32((13u*p.x+7u*p.y+3u*paramU32(0u))%29u)-10.)*.25;
  if(a==0.){return vec4f(2.,-1.,.5,0.);}return vec4f(v*a,(v*.5+1.)*a,(2.-v*.25)*a,a);
 }`,
};
export const residentBackgroundKernel:GpuPixelKernelSource={
 abiVersion:1,id:'frameweave/example-background',version:'1.0.0',inputCount:0,parameterWords:0,
 code:'fn pixel(p:vec2u)->vec4f{return vec4f(.25,.5,2.,.5);}',
};
