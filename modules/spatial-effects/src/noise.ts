import FastNoiseLite,{Vector2,Vector3} from '../vendor/fastnoise-lite/FastNoiseLite.js';
import {finite,integer,spatialError} from './checks.ts';
export type NoiseAlgorithm='openSimplex2'|'openSimplex2S'|'cellular'|'perlin'|'valueCubic'|'value';
export type NoiseFractal='none'|'fbm'|'ridged'|'pingPong';
export interface FractalOptions {kind?:NoiseFractal;octaves?:number;lacunarity?:number;gain?:number;weightedStrength?:number;pingPongStrength?:number}
export interface NoiseOptions {
  seed?:number;frequency?:number;algorithm?:NoiseAlgorithm;fractal?:FractalOptions;
  rotation3D?:'none'|'improveXY'|'improveXZ';
  warp?:{kind?:'openSimplex2'|'openSimplex2Reduced'|'basicGrid';seed?:number;frequency?:number;amplitude?:number;mode?:'single'|'progressive'|'independent';octaves?:number;lacunarity?:number;gain?:number}|null;
  cellular?:{distance?:'euclidean'|'euclideanSq'|'manhattan'|'hybrid';returnType?:'cellValue'|'distance'|'distance2'|'distance2Add'|'distance2Sub'|'distance2Mul'|'distance2Div';jitter?:number};
  /** Configurable CPU/GPU octave planning budget, not a fixed algorithmic ceiling. */
  maxOctaves?:number;
}
export const noiseAlgorithms=Object.freeze({openSimplex2:'OpenSimplex2',openSimplex2S:'OpenSimplex2S',cellular:'Cellular',perlin:'Perlin',valueCubic:'ValueCubic',value:'Value'} satisfies Record<NoiseAlgorithm,string>);
const fractals:Record<NoiseFractal,string>={none:'None',fbm:'FBm',ridged:'Ridged',pingPong:'PingPong'},rotations={none:'None',improveXY:'ImproveXYPlanes',improveXZ:'ImproveXZPlanes'},warps={openSimplex2:'OpenSimplex2',openSimplex2Reduced:'OpenSimplex2Reduced',basicGrid:'BasicGrid'},modes={single:'None',progressive:'DomainWarpProgressive',independent:'DomainWarpIndependent'},distances={euclidean:'Euclidean',euclideanSq:'EuclideanSq',manhattan:'Manhattan',hybrid:'Hybrid'},returns={cellValue:'CellValue',distance:'Distance',distance2:'Distance2',distance2Add:'Distance2Add',distance2Sub:'Distance2Sub',distance2Mul:'Distance2Mul',distance2Div:'Distance2Div'};
function choice<T extends string>(value:T,map:Readonly<Record<T,unknown>>,name:string):T {if(!Object.hasOwn(map,value))spatialError('E_SPATIAL_PARAMETER',`Unknown ${name}`);return value;}
function seed(value:number){integer(value,'seed',-2147483648);if(value>4294967295)spatialError('E_SPATIAL_PARAMETER','Seed must fit signed/unsigned 32 bits');return value|0;}
export function resolveNoise(source:NoiseOptions={}){
  let o:NoiseOptions;try{o=structuredClone(source);}catch{spatialError('E_SPATIAL_PARAMETER','Noise options must be cloneable data');}
  const closed=(value:object,keys:string[])=>{if(!value||typeof value!=='object'||Object.keys(value).some(key=>!keys.includes(key)))spatialError('E_SPATIAL_PARAMETER','Unknown noise option');};
  closed(o,['seed','frequency','algorithm','fractal','rotation3D','warp','cellular','maxOctaves']);if(o.fractal)closed(o.fractal,['kind','octaves','lacunarity','gain','weightedStrength','pingPongStrength']);if(o.warp)closed(o.warp,['kind','seed','frequency','amplitude','mode','octaves','lacunarity','gain']);if(o.cellular)closed(o.cellular,['distance','returnType','jitter']);
  const max=integer(o.maxOctaves??32,'maxOctaves'),f=o.fractal??{},w=o.warp,c=o.cellular??{};
  function octaves(n=3){integer(n,'octaves');if(n>max)spatialError('E_SPATIAL_NOISE_BUDGET','Octaves exceed maxOctaves');return n;}
  const result={seed:seed(o.seed??1337),frequency:finite(o.frequency??.01,'frequency',0),algorithm:choice(o.algorithm??'openSimplex2',noiseAlgorithms,'noise algorithm'),rotation3D:choice(o.rotation3D??'none',rotations,'rotation'),maxOctaves:max,
    fractal:{kind:choice(f.kind??'none',fractals,'fractal'),octaves:octaves(f.octaves),lacunarity:finite(f.lacunarity??2,'lacunarity',Number.MIN_VALUE),gain:finite(f.gain??.5,'gain',0,1),weightedStrength:finite(f.weightedStrength??0,'weightedStrength',0,1),pingPongStrength:finite(f.pingPongStrength??2,'pingPongStrength',0)},
    cellular:{distance:choice(c.distance??'euclideanSq',distances,'cellular distance'),returnType:choice(c.returnType??'distance',returns,'cellular return'),jitter:finite(c.jitter??1,'cellular jitter',0,1)},
    warp:w?{kind:choice(w.kind??'openSimplex2',warps,'warp'),seed:seed(w.seed??o.seed??1337),frequency:finite(w.frequency??o.frequency??.01,'warp frequency',0),amplitude:finite(w.amplitude??1,'warp amplitude',0),mode:choice(w.mode??'single',modes,'warp mode'),octaves:octaves(w.octaves),lacunarity:finite(w.lacunarity??2,'warp lacunarity',Number.MIN_VALUE),gain:finite(w.gain??.5,'warp gain',0,1)}:null};
  for(const [frequency,lacunarity,count] of [[result.frequency,result.fractal.lacunarity,result.fractal.kind==='none'?1:result.fractal.octaves],[result.warp?.frequency??0,result.warp?.lacunarity??1,result.warp?.mode==='single'?1:result.warp?.octaves??1]])if(!Number.isFinite(frequency*Math.max(1,lacunarity)**(count-1)))spatialError('E_SPATIAL_NOISE_RANGE','Frequency/octave lattice scale overflows');
  return result;
}
export type ResolvedNoise=ReturnType<typeof resolveNoise>;
export function assertNoisePosition(position:readonly number[],o:ResolvedNoise){
  for(const n of position)finite(n,'noise coordinate');
  const noiseScale=o.frequency*Math.max(1,o.fractal.lacunarity)**(o.fractal.kind==='none'?0:o.fractal.octaves-1),w=o.warp,warpScale=w?w.frequency*Math.max(1,w.lacunarity)**(w.mode==='single'?0:w.octaves-1):0;
  // Conservative bound for FNL's signed integer lattice, including rotation and bounded warp.
  const extent=Math.max(...position.map(Math.abs))+(w?.amplitude??0)+2;
  if(!Number.isFinite(extent)||extent*Math.max(noiseScale,warpScale)*4>=2**29)spatialError('E_SPATIAL_NOISE_RANGE','Coordinates/frequency/octaves exceed the qualified signed lattice domain');
}
function kernel(o:ResolvedNoise,overrideSeed=o.seed){
  const n=new FastNoiseLite(overrideSeed),f=o.fractal,c=o.cellular;n.SetFrequency(o.frequency);n.SetNoiseType(noiseAlgorithms[o.algorithm]);n.SetRotationType3D(rotations[o.rotation3D]);n.SetFractalType(fractals[f.kind]);n.SetFractalOctaves(f.octaves);n.SetFractalLacunarity(f.lacunarity);n.SetFractalGain(f.gain);n.SetFractalWeightedStrength(f.weightedStrength);n.SetFractalPingPongStrength(f.pingPongStrength);n.SetCellularDistanceFunction(distances[c.distance]);n.SetCellularReturnType(returns[c.returnType]);n.SetCellularJitter(c.jitter);return n;
}
/** Direct mature upstream JS kernel for point/control queries, never a CPU image rasterizer. */
export function createNoise(options:NoiseOptions={}){
  const o=resolveNoise(options),n=kernel(o);let warp:FastNoiseLite|undefined;
  if(o.warp){const w=o.warp;warp=new FastNoiseLite(w.seed);warp.SetFrequency(w.frequency);warp.SetRotationType3D(rotations[o.rotation3D]);warp.SetDomainWarpType(warps[w.kind]);warp.SetDomainWarpAmp(w.amplitude);warp.SetFractalType(modes[w.mode]);warp.SetFractalOctaves(w.octaves);warp.SetFractalLacunarity(w.lacunarity);warp.SetFractalGain(w.gain);}
  const warp2=(p:readonly [number,number]):[number,number]=>{if(p.length!==2)spatialError('E_SPATIAL_PARAMETER','2D point required');assertNoisePosition(p,o);const v=new Vector2(...p);warp?.DomainWrap(v);return [finite(v.x,'warped x'),finite(v.y,'warped y')];};
  const warp3=(p:readonly [number,number,number]):[number,number,number]=>{if(p.length!==3)spatialError('E_SPATIAL_PARAMETER','3D point required');assertNoisePosition(p,o);const v=new Vector3(...p);warp?.DomainWrap(v);return [finite(v.x,'warped x'),finite(v.y,'warped y'),finite(v.z,'warped z')];};
  const sample2=(p:readonly [number,number])=>finite(n.GetNoise(...warp2(p)),'noise result');
  const sample3=(p:readonly [number,number,number])=>finite(n.GetNoise(...warp3(p)),'noise result');
  let potentials:FastNoiseLite[]|undefined;
  function delta(p:readonly number[],epsilon?:number){const h=finite(epsilon??.001/(o.frequency||1),'curl epsilon',Number.MIN_VALUE);if(p.some(v=>v+h===v||v-h===v))spatialError('E_SPATIAL_NOISE_RANGE','Curl epsilon is below coordinate precision');return h;}
  return {sample2,sample3,warp2,warp3,get settings(){return structuredClone(o);},
    curl2(p:readonly [number,number],epsilon?:number):[number,number]{const h=delta(p,epsilon),[x,y]=p;return [finite((sample2([x,y+h])-sample2([x,y-h]))/(2*h),'curl x'),finite(-(sample2([x+h,y])-sample2([x-h,y]))/(2*h),'curl y')];},
    curl3(p:readonly [number,number,number],epsilon?:number):[number,number,number]{const h=delta(p,epsilon);potentials??=[n,kernel(o,o.seed^0x9e3779b9),kernel(o,o.seed^0x243f6a88)];
      const derivative=(component:number,axis:number)=>{const plus=[...p] as [number,number,number],minus=[...p] as [number,number,number];plus[axis]+=h;minus[axis]-=h;return (potentials![component].GetNoise(...warp3(plus))-potentials![component].GetNoise(...warp3(minus)))/(2*h);};
      return [finite(derivative(2,1)-derivative(1,2),'curl x'),finite(derivative(0,2)-derivative(2,0),'curl y'),finite(derivative(1,0)-derivative(0,1),'curl z')];
    }
  };
}
