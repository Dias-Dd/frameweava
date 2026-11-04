/** Experimental display-only pack after the fixed OCIO view. This never stores
 * a professional intermediate. Run in the SAME existing device/encoder as the
 * view, then read width*height*4 bytes plus the 12-byte validation ledger.
 *
 * Not wired into a product API or the frozen F32 benchmark. A future probe must
 * separately freeze its byte-error criteria; this is not an exact replacement
 * for JavaScript's f64 division/rounding or the accurate CPU display path.
 */
export const displayPreviewPackShader=/* wgsl */`
struct Policy { width:u32, height:u32, alphaMode:u32, clip:u32 }
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> destination:array<u32>;
// Initialize all words to [0xffffffff, 0, 0] BEFORE submission. The first word
// is the earliest invalid RGBA component (zero is a valid error position), the
// second counts out-of-range RGB components, and the third counts pixels.
@group(0) @binding(2) var<storage,read_write> ledger:array<atomic<u32>>;
@group(0) @binding(3) var<uniform> p:Policy;
fn finite(v:f32)->bool { return (bitcast<u32>(v)&0x7f800000u)!=0x7f800000u; }
fn mark(component:u32) { atomicMin(&ledger[0],component); }
fn byte(v:f32)->u32 {
 // WGSL round() has ties-to-even semantics; the explicit floor expresses the
 // nonnegative Math.round rule used by mediaPreview. f32 edge cases still need
 // comparison with that f64 reference, not an unsupported exactness claim.
 return u32(floor(clamp(v,0.,1.)*255.+0.5));
}
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id:vec3u) {
 if(id.x>=p.width||id.y>=p.height){return;}
 let i=id.y*p.width+id.x;let v=source[i];var invalid=false;
 for(var c=0u;c<4u;c++) {
  if(!finite(v[c])){mark(4u*i+c);invalid=true;}
 }
 // Bit tests retain the sign of a negative subnormal even on a flushing GPU.
 let aw=bitcast<u32>(v.a);let am=aw&0x7fffffffu;
 if(((aw&0x80000000u)!=0u&&am!=0u)||am>0x3f800000u||p.alphaMode>2u||(p.alphaMode==2u&&aw!=0x3f800000u)){mark(4u*i+3u);invalid=true;}
 if(invalid){destination[i]=0u;return;}
 var rgb=v.rgb;
 if(p.alphaMode==1u) {
  if(am==0u){rgb=vec3f(0.);}else{rgb=rgb/v.a;}
 }
 for(var c=0u;c<3u;c++) {
  if(!finite(rgb[c])){mark(4u*i+c);invalid=true;}
  else if(rgb[c]<0.||rgb[c]>1.) {
   atomicAdd(&ledger[1],1u);
   if(p.clip==0u){mark(4u*i+c);invalid=true;}
  }
 }
 if(invalid){destination[i]=0u;return;}
 destination[i]=byte(rgb.r)|(byte(rgb.g)<<8u)|(byte(rgb.b)<<16u)|(byte(v.a)<<24u);
 atomicAdd(&ledger[2],1u);
}
`;
