/** Independent hand-defined Canvas/source-over and row-layout pixel oracle. */
export function reference2(kind:'canvas'|'layout',frame:number){const out=new Float64Array(16*8*4),over=(b:number[],rgb:number[],a:number)=>rgb.map((v,i)=>v*a+b[i]*(1-a)).concat(a+b[3]*(1-a));
 for(let y=0;y<8;y++)for(let x=0;x<16;x++){
  let p=[0,0,0,0];if(kind==='layout'){const shift=frame*.001;if(y+.5>=2&&y+.5<6){if(x+.5>=1+shift&&x+.5<5+shift)p=[.5,0,0,.25];if(x+.5>=7&&x+.5<15)p=[0,0,1,.5];}}
  else{const t=Math.min(1,Math.max(0,(x+.5-1)/8));p=[(-.25+1.75*t)*.25,(.5-.5*t)*.25,(2-1.75*t)*.25,.25];if(x+.5>=2&&x+.5<8&&y+.5>=1&&y+.5<7){if(x+.5<6&&y+.5<5)p=over(p,[2,0,0],.5);if(x+.5>=4&&y+.5>=3)p=over(p,[0,0,2],.25);}if(x>=8){const sx=Math.floor((x+.5-8)/2),sy=Math.floor((y+.5)/4),a=(sx+sy)%4/4;p=over(p,[sx+1,sy+.25,-.125],a);}}
  out.set(p,(y*16+x)*4);
 }return out;}
