import type {HeightCausticsOptions} from '../../height-caustics.ts';
import type {WaveWorldOptions} from '../../wave-world.ts';
export const W=48,H=32,NX=9,NY=7;
export const mode=Float32Array.from({length:NX*NY},(_,i)=>.08*Math.cos(Math.PI*(i%NX+.5)/NX)*Math.cos(Math.PI*(Math.floor(i/NX)+.5)/NY));
export const waves:WaveWorldOptions[]=[
 {dimensions:[NX,NY],size:[3,2],substeps:1,sources:[],speed:.8,damping:0,initialGrid:{height:mode}},
 {dimensions:[NX,NY],size:[3,2],substeps:1,sources:[],speed:.8,damping:0,initialGrid:{height:mode},edges:{left:'absorb',right:'absorb',top:'absorb',bottom:'absorb'},spongeCells:1,absorption:12},
 {dimensions:[NX,NY],size:[3,2],substeps:1,sources:[],terrain:{kind:'shore',level:.5,elevation:.4,slope:[.5,0]},obstacles:[{kind:'box',position:[0,0],size:[.6,.5]}],initial:[{position:[-.7,0],radius:.3,amplitude:.08}]},
 {dimensions:[NX,NY],size:[3,2],substeps:1,sources:[],terrain:{kind:'flat',level:.5,map:{gradient:{kind:'linear',center:[0,0,0],edge:[1,1,1]}},mapScale:1},initialGrid:{height:mode}},
];
export function configuration(frame:number):HeightCausticsOptions{
 const n=frame%8,o:HeightCausticsOptions={surface:'height',bottom:'bottom',size:[3,2],depth:.6,ior:1.333};
 if(n===0)o.ior=1;if(n===3||n===4){o.interpretation='normal';o.normalEncoding=n===4?'unorm':'signed';}
 if(n===5){o.boundary='repeat';o.bottomScale=1.3;}if(n===6){o.boundary='mirror';o.smoothing=1.5;}
 if(n===7){o.sky='sky';o.lightPosition=[.3,-.2,2];o.surfaceColor=[-.1,1.2,.4];o.surfaceOpacity=.3;o.lightColor=[.9,1.1,1];o.diffuse=.25;o.ambient=.75;o.specular=.2;o.skyIntensity=.8;o.convergence=.35;}
 return o;
}
export function pixels(frame:number){const surface=new Float32Array(W*H*4),bottom=new Float32Array(W*H*4),n=frame%8,nn=Math.hypot(.2,-.1,1);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const u=(x+.5)/W,v=(y+.5)/H,wx=(u-.5)*3,wy=(v-.5)*2,a=Math.max(0,Math.min(1,Math.min(x,y,W-1-x,H-1-y)/5)),at=(y*W+x)*4;bottom.set([(-.2+1.5*u)*a,(.3+.6*v)*a,1.2*a,a],at);let h=n===1?.2:n===2?.1*wx-.05*wy:n===6?.06*wx*wy:.05*Math.exp(-(wx*wx+wy*wy)*3);let rgb=[h,h,h];if(n===3||n===4){rgb=[-.2/nn,.1/nn,1/nn];if(n===4)rgb=rgb.map(x=>x*.5+.5);}surface.set([...rgb.map(x=>x*.65),.65],at);}return {surface,bottom};}
