// NanoVDB32.8 Float traversal based on PNanoVDB.h (OpenVDBv12.1.1).
// Copyright OpenVDB contributors; SPDX-License-Identifier: Apache-2.0
export const sparseSampleShader=`
fn nv(a:u32)->u32{return load0(a/4u);}
fn nf(a:u32)->f32{return bitcast<f32>(nv(a));}
fn nmask(base:u32,n:u32)->u32{return (nv(base+4u*(n/32u))>>(n%32u))&1u;}
fn nhash(lo:u32,hi:u32)->u32{var h=lo^(hi*0x9e3779b9u);h=h^(h>>16u);h=h*0x7feb352du;h=h^(h>>15u);h=h*0x846ca68bu;return h^(h>>16u);}
// value-bits / active / tree-level (0 leaf,1 lower,2 upper,3 root,4 background) / probes
fn nlookup(c:vec3i)->vec4u{let header=paramU32(0u);let cap=nv(header+8u);let root=nv(header+12u);let bg=nv(header+20u);let u=bitcast<vec3u>(c)>>vec3u(12u);let lo=u.z|(u.y<<21u);let hi=(u.x<<10u)|(u.y>>11u);var slot=nhash(lo,hi)%cap;var tile=0u;var probes=0u;
 for(var n=0u;n<cap;n++){probes++;let a=header+32u+slot*16u;let address=nv(a+8u);if(address==0u){return vec4u(bg,0u,4u,probes);}if(nv(a)==lo&&nv(a+4u)==hi){tile=address-1u;break;}slot=(slot+1u)%cap;}
 if(tile==0u){return vec4u(bg,0u,5u,probes);}let child=nv(tile+8u);let childHi=nv(tile+12u);if((child|childHi)==0u){return vec4u(nv(tile+20u),nv(tile+16u),3u,probes);}let upper=root+child;let p=bitcast<vec3u>(c);let i=(((p.x&4095u)>>7u)<<10u)|(((p.y&4095u)>>7u)<<5u)|((p.z&4095u)>>7u);let ua=upper+8256u+8u*i;
 if(nmask(upper+4128u,i)==0u){return vec4u(nv(ua),nmask(upper+32u,i),2u,probes);}let lower=upper+nv(ua);let j=(((p.x&127u)>>3u)<<8u)|(((p.y&127u)>>3u)<<4u)|((p.z&127u)>>3u);let la=lower+1088u+8u*j;
 if(nmask(lower+544u,j)==0u){return vec4u(nv(la),nmask(lower+32u,j),1u,probes);}let leaf=lower+nv(la);let k=((p.x&7u)<<6u)|((p.y&7u)<<3u)|(p.z&7u);return vec4u(nv(leaf+96u+4u*k),nmask(leaf+16u,k),0u,probes);
}
fn nworld(p:vec3f)->vec3f{let q=p-vec3f(nf(368u),nf(372u),nf(376u));return vec3f(dot(q,vec3f(nf(332u),nf(336u),nf(340u))),dot(q,vec3f(nf(344u),nf(348u),nf(352u))),dot(q,vec3f(nf(356u),nf(360u),nf(364u))));}
fn compute(g:vec3u,l:vec3u,w:vec3u){let index=g.x+g.y*paramU32(1u);if(index>=paramU32(2u)){return;}COORDINATE
 let r=nlookup(c);store2(index,bitcast<f32>(r.x));let m=index*4u;store3(m,r.y);store3(m+1u,r.z);store3(m+2u,r.w);store3(m+3u,select(0u,2u,r.z==5u));
}`;
