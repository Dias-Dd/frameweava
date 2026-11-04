/** Independent double-precision coverage/material reference for one bubble.
 * No production shader, GPU helper or raster implementation is imported. */
export function bubbleReference(state:ArrayLike<number>,style:number,width=96,height=64){
 const out=new Float64Array(width*height*4),age=Math.max(0,state[4]),radius=state[5]*Math.min(1,age*4);if(!state[9]||!radius)return out;
 const aa=2.2/height/radius,fade=Math.max(0,Math.min(1,(state[7]-age)/.15)),spin=state[6];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const u=((x+.5-width/2)*2.2/height-state[0])/radius,v=((height/2-y-.5)*2.2/height-state[1])/radius,d=Math.hypot(u,v);if(d>1+aa)continue;const a=Math.max(0,1-aa),s=Math.max(0,Math.min(1,(d-a)/(1+aa-a))),coverage=1-s*s*(3-2*s),ru=u*Math.cos(spin)+v*Math.sin(spin),rv=-u*Math.sin(spin)+v*Math.cos(spin),rim=Math.min(1,d)**8,highlight=Math.max(0,1-Math.hypot(ru+.28,rv-.32)/.55)**4,rgb=[1.5,-.2,.7];let alpha=.6*(.08+.7*rim+.3*highlight);
  if(style===1){alpha=.6*(.25+.5*rim);rgb[0]*=1.1;rgb[1]*=.9;rgb[2]*=.6;}else if(style===2)alpha=.6*(.7+.3*highlight);else if(style===3){alpha=.6*(.3+.5*rim);rgb[0]*=.7;rgb[1]*=.9;}else if(style===4)alpha=.6*(.65+.25*rim);
  alpha=Math.max(0,Math.min(1,alpha*coverage*fade));const i=(y*width+x)*4;out.set([...rgb.map(c=>(c+highlight*1.4)*alpha),alpha],i);
 }return out;
}
