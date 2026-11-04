// SPDX-License-Identifier: Apache-2.0
// GPU form of Three's area-weighted indexed vertex-normal sum, using fixed CSR topology.
export const cacheMeshCode=/* wgsl */`
fn position(i:u32)->vec3f{return vec3f(load0(i*3u),load0(i*3u+1u),load0(i*3u+2u));}
fn face(t:u32)->vec3f{let a=position(load1(t*3u));let b=position(load1(t*3u+1u));let c=position(load1(t*3u+2u));return cross(b-a,c-a);}
fn compute(g:vec3u,l:vec3u,w:vec3u){let t=g.x+g.y*paramU32(1u);if(t>=paramU32(0u)){return;}for(var corner=0u;corner<3u;corner++){let id=load1(t*3u+corner);let p=position(id);var n=face(t);if(paramU32(4u)==1u){n=vec3f(0.);for(var at=load2(id);at<load2(id+1u);at++){n+=face(load3(at));}}if(length(n)==0.){n=vec3f(0.,0.,1.);}n=normalize(n);let vertex=t*3u+corner;for(var k=0u;k<3u;k++){store4(vertex*3u+k,p[k]);store5(vertex*3u+k,n[k]);}let tile=vec2u(t%paramU32(2u),t/paramU32(2u))*2u;let uv=(vec2f(tile)+vec2f(.5)+vec2f(select(0.,1.,corner==1u),select(0.,1.,corner==2u)))/vec2f(f32(paramU32(2u)*2u),f32(paramU32(3u)));store6(vertex*2u,uv.x);store6(vertex*2u+1u,uv.y);}}
`;
export const cacheBillboardCode=/* wgsl */`
fn model(v:vec3f)->vec3f{return (mat4x4f(vec4f(paramF32(16u),paramF32(17u),paramF32(18u),paramF32(19u)),vec4f(paramF32(20u),paramF32(21u),paramF32(22u),paramF32(23u)),vec4f(paramF32(24u),paramF32(25u),paramF32(26u),paramF32(27u)),vec4f(paramF32(28u),paramF32(29u),paramF32(30u),paramF32(31u)))*vec4f(v,1.)).xyz;}
fn compute(g:vec3u,l:vec3u,w:vec3u){let i=g.x+g.y*paramU32(1u);if(i>=paramU32(0u)){return;}let center=model(vec3f(load0(i*3u),load0(i*3u+1u),load0(i*3u+2u)));let right=vec3f(paramF32(4u),paramF32(5u),paramF32(6u));let up=vec3f(paramF32(8u),paramF32(9u),paramF32(10u));var indices=array<u32,6>(0u,1u,2u,0u,2u,3u);var corners=array<vec2f,4>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(1.,1.),vec2f(-1.,1.));for(var k=0u;k<6u;k++){let q=corners[indices[k]];let p=center+(right*q.x+up*q.y)*paramF32(2u);let at=i*6u+k;for(var a=0u;a<3u;a++){store1(at*3u+a,p[a]);}store2(at*2u,(q.x+1.)*.5);store2(at*2u+1u,(1.-q.y)*.5);}}
`;
export const cachePointSpriteCode=/* wgsl */`fn pixel(p:vec2u)->vec4f{let q=(vec2f(p)+vec2f(.5))/vec2f(outputSize())*2.-vec2f(1.);let alpha=(1.-smoothstep(1.-paramF32(4u),1.,length(q)))*paramF32(3u);return vec4f(vec3f(paramF32(0u),paramF32(1u),paramF32(2u))*alpha,alpha);}`;
