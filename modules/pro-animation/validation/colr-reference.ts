// Independent Float64 oracle only. Production image execution is Native GPU.
export function colrCompositeReference(mode:number,s:readonly number[],d:readonly number[]):number[]{
 const a=s[3],b=d[3],cs=s.slice(0,3).map(v=>a?v/a:0),cd=d.slice(0,3).map(v=>b?v/b:0),oneMinusS=1-a,oneMinusD=1-b;
 const lum=(c:readonly number[])=>.3*c[0]+.59*c[1]+.11*c[2],sat=(c:readonly number[])=>Math.max(...c)-Math.min(...c),bounded=[...cs,...cd].every(v=>v>=0&&v<=1);
 const clip=(c:number[])=>{const l=lum(c),n=Math.min(...c),x=Math.max(...c);if(n<0)c=c.map(v=>l+(v-l)*l/(l-n));if(x>1)c=c.map(v=>l+(v-l)*(1-l)/(x-l));return c;};
 const setLum=(c:number[],l:number)=>{const delta=l-lum(c),v=c.map(x=>x+delta);return bounded?clip(v):v;},setSat=(c:readonly number[],v:number)=>{const lo=Math.min(...c),range=sat(c);return c.map(x=>range?(x-lo)*v/range:0);};
 if(mode<=12){let fs:number,fd:number;switch(mode){case 0:fs=fd=0;break;case 1:fs=1;fd=0;break;case 2:fs=0;fd=1;break;case 3:fs=1;fd=oneMinusS;break;case 4:fs=oneMinusD;fd=1;break;case 5:fs=b;fd=0;break;case 6:fs=0;fd=a;break;case 7:fs=oneMinusD;fd=0;break;case 8:fs=0;fd=oneMinusS;break;case 9:fs=b;fd=oneMinusS;break;case 10:fs=oneMinusD;fd=a;break;case 11:fs=oneMinusD;fd=oneMinusS;break;default:fs=fd=1;}return s.map((v,i)=>i===3?Math.min(1,Math.max(0,v*fs+d[i]*fd)):v*fs+d[i]*fd);}
 const hard=(x:number,y:number)=>y<=.5?2*x*y:1-2*(1-x)*(1-y),safe=(v:number)=>Math.abs(v)<2**-20?(v<0?-1:1)*2**-20:v;
 let blend:number[];
 if(mode===24)blend=setLum(setSat(cs,sat(cd)),lum(cd));else if(mode===25)blend=setLum(setSat(cd,sat(cs)),lum(cd));else if(mode===26)blend=setLum([...cs],lum(cd));else if(mode===27)blend=setLum([...cd],lum(cs));else blend=cs.map((y,i)=>{const x=cd[i];switch(mode){case 13:return x+y-x*y;case 14:return hard(y,x);case 15:return Math.min(x,y);case 16:return Math.max(x,y);case 17:return bounded?x===0?0:y>=1?1:Math.min(1,x/(1-y)):x/safe(1-y);case 18:return bounded?x>=1?1:y===0?0:1-Math.min(1,(1-x)/y):1-(1-x)/safe(y);case 19:return hard(x,y);case 20:{const z=Math.abs(x),curve=(x<0?-1:1)*(z<=.25?((16*z-12)*z+4)*z:Math.sqrt(z));return y<=.5?x-(1-2*y)*x*(1-x):x+(2*y-1)*(curve-x);}case 21:return Math.abs(x-y);case 22:return x+y-2*x*y;case 23:return x*y;default:throw Error('Unknown original mode');}});
 return blend.map((v,i)=>s[i]*oneMinusD+d[i]*oneMinusS+a*b*v).concat(a+b*oneMinusS);
}
