/** Independent pixel-centre reference for the actual SVG/Native edit fixture. */
export function reference(frame:number){const result=new Float64Array(16*8*4);for(let y=0;y<8;y++)for(let x=0;x<16;x++){
 const a=.25,t=(x+.5)/16,v=t<=.04045?t/12.92:((t+.055)/1.055)**2.4,p=[v*a,v*a,v*a,a],gx=x+.5-frame*.01,gy=y+.5;
 if(gx>=1&&gx<7&&gy>=1&&gy<7){const blue=gx>=2&&gy>=2,red=gx<6&&gy<6;if(blue||red){p[0]=p[0]*.5+(blue?0:1);p[1]*=.5;p[2]=p[2]*.5+(blue?1:0);p[3]=.5+p[3]*.5;}}
 if(x>=8){const sx=Math.floor((x+.5-8)/2),sy=Math.floor((y+.5)/4),alpha=(sx+sy)%4/4;p[0]=(sx+1)*alpha+p[0]*(1-alpha);p[1]=(sy+.25)*alpha+p[1]*(1-alpha);p[2]=-.125*alpha+p[2]*(1-alpha);p[3]=alpha+p[3]*(1-alpha);}
 result.set(p,(y*16+x)*4);
 }return result;}

export function gradientReference(space:'srgb'|'linear'|'native'){const result=new Float64Array(16*8*4),decode=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;for(let y=0;y<8;y++)for(let x=0;x<16;x++){const t=(x+.5)/16;result.set([space==='native'?0:(space==='srgb'?decode(1-t):1-t)*t,0,space==='native'?t:(space==='srgb'?decode(t):t)*t,t],(y*16+x)*4);}return result;}
