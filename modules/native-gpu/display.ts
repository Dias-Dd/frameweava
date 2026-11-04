import {EngineError} from '../../src/core/errors.ts';
import {fixedDisplayShader} from '../gpu-effects/pixel-display-shader.ts';
import {reachWords,cuspWords} from '../gpu-effects/pixel-display-tables.ts';
import type {NativeProgram} from './client.ts';
import {gamutMatrix} from '../../src/media/color.ts';
import {srgb,type ColorEncoding} from '../../src/media/surface.ts';
function linear709Shader(color:ColorEncoding){const m=gamutMatrix(color,srgb).map(row=>row.map(v=>v*color.referenceWhiteNits/100));return `
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> destination:array<vec4f>;
@group(0) @binding(2) var<uniform> p:vec4u;
fn encode(v:vec3f)->vec3f {let c=clamp(v,vec3f(0.),vec3f(1.));return select(12.92*c,1.055*pow(c,vec3f(1./2.4))-.055,c>vec3f(.0031308));}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) g:vec3u){if(g.x>=p.x||g.y>=p.y){return;}let i=g.y*p.x+g.x;let v=source[i];var rgb=v.rgb;if(p.z==1u){rgb=select(vec3f(0.),rgb/max(v.a,1e-30),v.a>0.);}rgb=vec3f(${m.map(row=>'dot(rgb,vec3f('+row.join(',')+'))').join(',')});rgb=encode(rgb);if(p.z==1u){rgb*=v.a;}destination[i]=vec4f(rgb,v.a);}`;}
export function configureNativeDisplay(program:NativeProgram,image:number,purpose:'preview'|'delivery'='preview'){
 const color=program.images[image].color as ColorEncoding;
 if(color.transfer!=='linear'||color.reference!=='scene')throw new EngineError('E_NATIVE_COLOR','Native display requires explicit scene-linear input');
 if(color.primaries!=='acescg'){program.display={image,shader:linear709Shader(color),reach:[],cusp:[],profile:'linear709-sdr-v1'};return;}
 if(color.primaries!=='acescg'||color.whitePoint!=='D60')throw new EngineError('E_NATIVE_COLOR','Native display currently supports linear Rec.709 and ACEScg');
 if(purpose==='delivery')throw new EngineError('E_NATIVE_COLOR_ACCURACY','The fixed GPU ACES2 view is preview-qualified, not an exact OCIO delivery transform. Export linear EXR, or use the accurate professional delivery service.');
 if(color.referenceWhiteNits!==100)throw new EngineError('E_NATIVE_COLOR','Fixed ACES2 SDR100 preview requires referenceWhiteNits=100');
 const cusp=new Uint32Array(363*4);for(let i=0;i<363;i++)cusp.set(cuspWords.subarray(i*3,i*3+3),i*4);
 program.display={image,shader:fixedDisplayShader,reach:Array.from(reachWords),cusp:Array.from(cusp),profile:'aces2-sdr100-v1'};
}
