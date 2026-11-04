// Match PixelPass binary16 publication, including subnormals and tie-to-even.
fn half(v:f32)->f32{
 let b=bitcast<u32>(v);let s=b&0x80000000u;let e=i32((b>>23u)&255u)-127;let m=b&0x7fffffu;
 if(e==128){return bitcast<f32>(s|0x7f800000u|select(0u,0x400000u,m!=0u));}
 if(e>15){return bitcast<f32>(s|0x7f800000u);}var h=0u;
 if(e>=-25){if(e < -14){let shift=u32(-e-1);let x=m|0x800000u;h=x>>shift;let r=x&((1u<<shift)-1u);let tie=1u<<(shift-1u);h+=select(0u,1u,r>tie||(r==tie&&(h&1u)!=0u));}
 else{h=(u32(e+15)<<10u)|(m>>13u);let r=m&8191u;h+=select(0u,1u,r>4096u||(r==4096u&&(h&1u)!=0u));}}
 let he=(h>>10u)&31u;let hm=h&1023u;if(he==31u){return bitcast<f32>(s|0x7f800000u|(hm<<13u));}
 if(he==0u){return bitcast<f32>(s|bitcast<u32>(f32(hm)*0x1p-24f));}return bitcast<f32>(s|((he+112u)<<23u)|(hm<<13u));
}
