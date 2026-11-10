import {EngineError} from '../../src/core/errors.ts';

export interface SceneEnvironmentImportance {
  width:number;
  height:number;
  /** Approximate nonnegative luminance at equirectangular cell centers.
   * Only controls sampling, with an independent uniform-sphere component. */
  luminance:readonly number[];
}

export function environmentDistribution(importance:SceneEnvironmentImportance) {
  const {width,height,luminance}=importance;
  if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0) || !Number.isSafeInteger(width*height) ||
      luminance.length!==width*height || luminance.some(n=>!Number.isFinite(n)||n<0))
    throw new EngineError('E_NATIVE_SCENE_ENVIRONMENT','Require complete finite nonnegative equirectangular luminance');
  const probabilities=new Float64Array(luminance.length);
  let total=0;
  for(let y=0;y<height;y++) {
    const area=(Math.cos(Math.PI*y/height)-Math.cos(Math.PI*(y+1)/height))*(2*Math.PI/width);
    for(let x=0;x<width;x++)total+=probabilities[y*width+x]=luminance[y*width+x]*area;
  }
  const words=new Uint32Array(2+probabilities.length);
  words.set([width,height]);
  const values=new Float32Array(words.buffer);
  let sum=0;
  for(let i=0;i<probabilities.length;i++) {
    const row=Math.floor(i/width);
    sum+=total?probabilities[i]/total:
      (Math.cos(Math.PI*row/height)-Math.cos(Math.PI*(row+1)/height))/(2*width);
    values[2+i]=Math.min(1,sum);
  }
  values[values.length-1]=1;
  return words;
}

export const environmentSampling = /* wgsl */ `
fn environmentUV(d:vec3f)->vec2f {
  let n=d/max(length(d),1e-20);
  return vec2f(fract(atan2(n.z,n.x)/(2.*pi)+.5),acos(clamp(n.y,-1.,1.))/pi);
}
fn environmentRadiance(d:vec3f)->vec3f {
  let region=paramU32(25u);
  if(region==0u){return sceneSky(d);}
  return sceneTexture(region,environmentUV(d)).rgb;
}
fn environmentCellPdf(d:vec3f)->f32 {
  let offset=paramU32(26u);
  let width=load11(offset);let height=load11(offset+1u);
  let uv=environmentUV(d);
  let x=min(u32(uv.x*f32(width)),width-1u);
  let y=min(u32(uv.y*f32(height)),height-1u);
  let cell=y*width+x;
  let end=bitcast<f32>(load11(offset+2u+cell));
  var start=0.;
  if(cell>0u){start=bitcast<f32>(load11(offset+1u+cell));}
  let area=(cos(pi*f32(y)/f32(height))-cos(pi*f32(y+1u)/f32(height)))*(2.*pi/f32(width));
  return .95*(end-start)/area+.05/(4.*pi);
}
fn sampleEnvironment(seed:u32)->vec3f {
  if(sceneUnit(seed^0x563ac24du)<.05) {
    let y=1.-2.*sceneUnit(seed^0x743ca1e3u);let phi=2.*pi*sceneUnit(seed^0xba45c712u);
    let r=sqrt(max(0.,1.-y*y));return vec3f(r*cos(phi),y,r*sin(phi));
  }
  let offset=paramU32(26u);
  let width=load11(offset);let height=load11(offset+1u);
  let u=sceneUnit(seed^0x43fa719du);
  var lo=0u;var hi=width*height;
  while(lo<hi){
    let mid=lo+(hi-lo)/2u;
    if(bitcast<f32>(load11(offset+2u+mid))<=u){lo=mid+1u;}else{hi=mid;}
  }
  let cell=min(lo,width*height-1u);
  let row=cell/width;let col=cell%width;
  let y=mix(cos(pi*f32(row)/f32(height)),cos(pi*f32(row+1u)/f32(height)),sceneUnit(seed^0x9734de19u));
  let phi=2.*pi*((f32(col)+sceneUnit(seed^0x8b45ac92u))/f32(width)-.5);
  let r=sqrt(max(0.,1.-y*y));
  return vec3f(r*cos(phi),y,r*sin(phi));
}
`;
