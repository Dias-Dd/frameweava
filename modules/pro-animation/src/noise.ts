// Adapted from EffectCraft crates/expr/src/noise.rs @861c51f8187bf56efc77cc7b60fc4a513d2b7198.
// Copyright (c) 2026 ArtCraft Team and contributors. MIT; see ../vendor/effectcraft/.
const u64=(x:bigint)=>BigInt.asUintN(64,x);
export function hash64(value:bigint):bigint {
 let x=u64(value+0x9e3779b97f4a7c15n);x=u64((x^(x>>30n))*0xbf58476d1ce4e5b9n);x=u64((x^(x>>27n))*0x94d049bb133111ebn);return x^(x>>31n);
}
export function mix(parts:readonly bigint[]):bigint{return parts.reduce((h,p)=>hash64(h^hash64(p)),0x2545f4914f6cdd1dn);}
export function unit(seed:bigint):number{return Number(hash64(seed)>>11n)/2**53;}
export function noise1(seed:bigint,x:number):number {
 const i=Math.floor(x),t=x-i,u=t*t*t*(t*(t*6-15)+10),a=unit(u64(seed)^hash64(u64(BigInt(i))))*2-1,b=unit(u64(seed)^hash64(u64(BigInt(i+1))))*2-1;
 return a+(b-a)*u;
}
export function wiggleReference(seed:bigint,dims:number,freq:number,amp:number,octaves:number,mult:number,t:number):number[]{
 return Array.from({length:dims},(_,d)=>{let a=amp,f=freq,sum=0;for(let k=0;k<octaves;k++){const s=mix([u64(seed),BigInt(d),BigInt(k)]);sum+=a*noise1(s,f*t+unit(s)*1000);a*=mult;f*=2;}return sum;});
}
