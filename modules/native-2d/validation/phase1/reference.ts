/** Independent pixel-centre F64 compositing oracle. Does not call the scene, mesh,
 * transform, atlas or GPU paint implementation. H264/PNG are separate checks. */
export function reference(frame:number){
 const output=new Float64Array(16*8*4);
 for(let y=0;y<8;y++)for(let x=0;x<16;x++){
  const t=(x+.5)/16,a=.25,base=[(-.25+1.75*t)*a,(.5-.5*t)*a,(2-1.75*t)*a,a];
  const gx=x+.5-frame*.01,gy=y+.5;
  if(gx>=1&&gx<7&&gy>=1&&gy<7){
   const blue=gx>=2&&gx<8&&gy>=2&&gy<8,red=gx>=0&&gx<6&&gy>=0&&gy<6;
   if(blue||red){base[0]=base[0]*.5+(blue?0:1);base[1]*=.5;base[2]=base[2]*.5+(blue?1:0);base[3]=.5+base[3]*.5;}
  }
  if(x>=8){
   const sx=Math.floor(1+(x+.5-8)/4),sy=Math.floor((y+.5)/4),alpha=(sx+sy)%4/4;
   base[0]=(sx+1)*alpha+base[0]*(1-alpha);base[1]=(sy+.25)*alpha+base[1]*(1-alpha);base[2]=-.125*alpha+base[2]*(1-alpha);base[3]=alpha+base[3]*(1-alpha);
  }
  output.set(base,(y*16+x)*4);
 }
 return output;
}
