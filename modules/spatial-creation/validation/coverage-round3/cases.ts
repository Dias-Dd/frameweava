const W=96,H=64;
export function sourcePixels(){const values=new Float32Array(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const a=Math.max(0,Math.min(1,(Math.min(x,y,W-1-x,H-1-y)-1)/7)),i=(y*W+x)*4;values.set([(-.25+x/W*2)*a,(.2+y/H)*a,1.4*a,a],i);}return values;}
