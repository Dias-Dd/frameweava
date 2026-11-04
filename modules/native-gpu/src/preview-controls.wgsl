// Thirteen-by-seven monochrome icons, one row per word, least significant bit at the left.
const previewIcons=array<array<u32,7>,7>(
 array<u32,7>(0x0u,0x20u,0xb30u,0x1527u,0x1520u,0x1570u,0x0u), // -1m
 array<u32,7>(0x0u,0x20u,0xe30u,0x327u,0xc20u,0x770u,0x0u), // -1s
 array<u32,7>(0x88u,0xc8u,0xe8u,0xf8u,0xe8u,0xc8u,0x88u), // previous frame
 array<u32,7>(0x504u,0x50cu,0x51cu,0x53cu,0x51cu,0x50cu,0x504u), // play/pause
 array<u32,7>(0x220u,0x260u,0x2e0u,0x3e0u,0x2e0u,0x260u,0x220u), // next frame
 array<u32,7>(0x0u,0x20u,0xe32u,0x327u,0xc22u,0x770u,0x0u), // +1s
 array<u32,7>(0x0u,0x20u,0xb32u,0x1527u,0x1522u,0x1570u,0x0u), // +1m
);

fn previewToolbar(at:vec2f,geometry:vec4u)->vec4f {
 let background=vec4f(.035,.04,.055,1.);
 let left=f32(geometry.x);
 let cell=f32(geometry.y);
 if(cell==0. || at.x<left || at.x>=left+7.*cell){return background;}
 let index=u32((at.x-left)/cell);
 let local=vec2f(at.x-left-f32(index)*cell,at.y);
 let center=vec2f(cell,f32(geometry.z))*.5;
 let distance=abs(local-center);
 let inset=min(vec2f(3.,4.),center*.18);
 if(any(distance>=center-inset)){return background;}
 let scale=max(1.,floor(min((cell-4.)/13.,(f32(geometry.z)-6.)/7.)));
 let icon=vec2i(floor((local-center)/scale+vec2f(6.5,3.5)));
 if(all(icon>=vec2i(0)) && all(icon<vec2i(13,7))){
    if((previewIcons[index][u32(icon.y)] & (1u<<u32(icon.x)))!=0u){return vec4f(.88,.93,1.,1.);}
 }
 return select(vec4f(.11,.13,.18,1.),vec4f(.15,.31,.58,1.),index==3u);
}
