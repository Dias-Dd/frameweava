// Independent CPU F64 reference for numerical validation only, never a runtime fallback.
export const points=[0,0,0, .3,.5,-.2, -.4,-.8,.6, 1,0,0, 0,1,0, 0,0,1, 2,2,2, -.2,.1,.3];
const normal=[0,1,0],target=points.map((x,i)=>x+(i%3===0?.3:i%3===1?-.2:.4));
const corners=Array.from({length:8},(_,i)=>{const x=i&1?1:-1,y=i&2?1:-1,z=i&4?1:-1;return [x+.2*y*z,y+.1*x,z*.8];});
function noise(p:number[],seed:number){const val=(x:number,y:number,z:number)=>{let h=Math.imul(seed^Math.imul(x,501125321)^Math.imul(y,1136930381)^Math.imul(z,1720413743),0x27d4eb2d);h=Math.imul(h,h);h=h^(h<<19);return h/2147483648;},i=p.map(Math.floor),f=p.map((x,j)=>x-i[j]),u=f.map(x=>x*x*(3-2*x)),mix=(a:number,b:number,t:number)=>a+(b-a)*t;const a=val(i[0],i[1],i[2]),b=val(i[0]+1,i[1],i[2]),c=val(i[0],i[1]+1,i[2]),d=val(i[0]+1,i[1]+1,i[2]),e=val(i[0],i[1],i[2]+1),g=val(i[0]+1,i[1],i[2]+1),h=val(i[0],i[1]+1,i[2]+1),j=val(i[0]+1,i[1]+1,i[2]+1);return mix(mix(mix(a,b,u[0]),mix(c,d,u[0]),u[1]),mix(mix(e,g,u[0]),mix(h,j,u[0]),u[1]),u[2]);}
export function fixtures(){const values=Array.from(Float32Array.from(points)),other=Array.from(Float32Array.from(target));const list:{name:string;options:any;expected:number[];inputs:number[][];tolerance:number;note?:string}[]=[];
 const add=(name:string,options:any,map:(v:number[],i:number)=>number[],inputs=[values],tolerance=6e-6,note?:string)=>list.push({name,options,expected:Array.from({length:values.length/3},(_,i)=>map(values.slice(i*3,i*3+3),i)).flat(),inputs,tolerance,note});
 add('transformPositions',{scale:[1.2,.8,-.9],rotation:[.2,-.3,.4],translation:[.1,-.2,.3]},([x,y,z])=>{let r=[x*1.2,y*.8,z*-.9];for(let a=0;a<3;a++){const b=(a+1)%3,c=(a+2)%3,t=[.2,-.3,.4][a],u=r[b],v=r[c];r[b]=Math.cos(t)*u-Math.sin(t)*v;r[c]=Math.sin(t)*u+Math.cos(t)*v;}return r.map((v,i)=>v+[.1,-.2,.3][i]);});
 add('twistPositions',{rate:.7,offset:.2},([x,y,z])=>{const t=.7*y+.2;return [x*Math.cos(t)+z*Math.sin(t),y,z*Math.cos(t)-x*Math.sin(t)];});
 add('bendPositions',{axis:'y',toward:'x',curvature:.6},([x,y,z])=>{const t=.6*y;return [y*(t===0?0:(1-Math.cos(t))/t)+x*Math.cos(t),y*(t===0?1:Math.sin(t)/t)-x*Math.sin(t),z];});
 add('taperPositions',{slope:.3},([x,y,z])=>[x*(1+.3*y),y,z*(1+.3*y)]);
 add('shearPositions',{axis:'y',toward:'x',amount:.4},([x,y,z])=>[x+.4*y,y,z]);
 add('stretchPositions',{factor:1.7},([x,y,z])=>[x/Math.sqrt(1.7),y*1.7,z/Math.sqrt(1.7)]);
 add('bulgePositions',{amplitude:.5,length:2},([x,y,z])=>{const s=1+(Math.abs(y)<1?.5*Math.cos(Math.PI*y/2):0);return [x*s,y,z*s];});
 add('spherifyPositions',{radius:.8,amount:.7},v=>{const d=Math.hypot(...v);return d?v.map(x=>x*(.3+.7*.8/d)):v;});
 add('cylindrifyPositions',{radius:.7,amount:.8},([x,y,z])=>{const d=Math.hypot(x,z),s=d?.2+.8*.7/d:1;return [x*s,y,z*s];});
 add('wavePositions',{frequency:2.5,phase:.3,amplitude:.2},([x,y,z])=>[x,y,z+.2*Math.sin(2.5*y+.3)]);
 add('ripplePositions',{axis:'z',frequency:4,phase:.2,amplitude:.3,decay:.5},([x,y,z])=>{const d=Math.hypot(x,y);return [x,y,z+.3*Math.sin(d*4+.2)*Math.exp(-d*.5)];});
 add('noiseDisplacePositions',{frequency:2,offset:[.125,.25,.5],amplitude:.2,seed:91},v=>v.map((x,i)=>x+normal[i]*noise(v.map((x,j)=>x*2+[.125,.25,.5][j]),91)*.2),[values,Array.from({length:values.length/3},()=>normal).flat()],4e-6,'Fixed FastNoiseLite hash/Hermite subset, CPU F64 scalar interpolation.');
 add('morphPositions',{amount:.35},(v,i)=>v.map((x,j)=>x+(other[i*3+j]-x)*.35),[values,other]);
 add('cageDeformPositions',{corners,outside:'preserve'},v=>{const t=v.map(x=>(x+1)/2);if(t.some(x=>x<0||x>1))return v;const r=[0,0,0];for(let i=0;i<8;i++){const w=(i&1?t[0]:1-t[0])*(i&2?t[1]:1-t[1])*(i&4?t[2]:1-t[2]);for(let j=0;j<3;j++)r[j]+=corners[i][j]*w;}return r;});
 add('attractPositions',{target:[.5,.8,-.2],radius:2,strength:.7},v=>{const d=Math.hypot(...v)/2,w=d<1?(1-d)**2*(1+2*d)*.7:0;return v.map((x,i)=>x+([.5,.8,-.2][i]-x)*w);});
 // Neutral limits, small-angle cancellation, immutable input/order and non-origin center.
 add('bendPositions',{curvature:0},v=>v);
 add('bendPositions',{curvature:1e-7},([x,y,z])=>[x,y,z],undefined,1e-6,'Near-zero stable bend limit.');
 add('stretchPositions',{factor:2,preserveVolume:false},([x,y,z])=>[x,2*y,z]);
 add('spherifyPositions',{amount:0},v=>v);
 add('wavePositions',{center:[0,.5,0],phase:{$keyframes:[{frame:0,value:0},{frame:12,value:1}]}},([x,y,z])=>[x,y,z+.2*Math.sin((y-.5)*3)]);
 add('cageDeformPositions',{corners:Array.from({length:8},(_,i)=>[i&1?1:-1,i&2?1:-1,i&4?1:-1]),outside:'extend'},v=>v);
 return list;
}
