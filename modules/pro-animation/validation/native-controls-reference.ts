// Independent Float64 references. Never imported into the creative Stage.
const f=Math.fround,clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
export const A=[-.125,3,.25,.5],B=[1.25,-.25,2,.25];
const lerp=(q:number,a=A,b=B)=>a.map((v,c)=>v*(1-q)+b[c]*q);
export function gridReference(x:number,y:number){
 const angle=f(27*Math.PI/180),c=f(Math.cos(angle)),s=f(Math.sin(angle)),side=f(Math.sqrt(32*20/7));
 const u=(x+.5-16)*c+(y+.5-10)*s,v=-(x+.5-16)*s+(y+.5-10)*c,cu=(Math.floor(u/side)+.5)*side,cv=(Math.floor(v/side)+.5)*side;
 const maximum=f(Math.max(...[[0,0],[32,0],[0,20],[32,20]].map(([x,y])=>Math.hypot((x-16)*c+(y-10)*s,-(x-16)*s+(y-10)*c))));
 const phase=clamp((f(.371)*1.25-(1-clamp(Math.hypot(cu,cv)/maximum)))/.25);
 const distance=Math.min(side*.5*(1-phase)-Math.abs(u-cu),side*.5*(1-phase)-Math.abs(v-cv));
 return phase===0?0:1-clamp(distance/1.25+.5);
}
export function jawsReference(x:number,y:number){
 const angle=f(23*Math.PI/180),c=f(Math.cos(angle)),s=f(Math.sin(angle)),u=(x+.5-16)*c+(y+.5-10)*s,v=-(x+.5-16)*s+(y+.5-10)*c;
 const height=f(37*f(7.25)/200),tooth=Math.sin((u/7.25-Math.floor(u/7.25))*2*Math.PI)*height;
 const maximum=f(Math.max(...[[0,0],[32,0],[0,20],[32,20]].map(([x,y])=>Math.abs(-(x-16)*s+(y-10)*c)))+2*height+2),travel=f(.371)*maximum;
 return v+travel<tooth||v-travel>=tooth?A:B;
}
export function lightReference(x:number,y:number){
 const center=[f(-.2*32),f(.7*20)],distance=Math.hypot(x+.5-center[0],y+.5-center[1]);
 const maximum=f(Math.max(...[[0,0],[32,0],[0,20],[32,20]].map(([x,y])=>Math.hypot(x-center[0],y-center[1])))),t=f(.371),edge=(1-t)*maximum;
 if(distance>=edge)return B;
 const energy=Math.exp(-(((distance-edge)/Math.max(maximum*.06,2))**2))*2*Math.min(t*20,1)*Math.min((1-t)*20,1);
 return A.map((v,c)=>c===3?v:v*(1+energy));
}
export function lineReference(x:number,y:number,overlap?:number){
 const angle=f(27*Math.PI/180),c=f(Math.cos(angle)),s=f(Math.sin(angle)),corners=[[0,0],[32,0],[0,20],[32,20]].map(([x,y])=>[x*c+y*s,-x*s+y*c]);
 const min=Math.min(...corners.map(p=>p[0])),max=Math.max(...corners.map(p=>p[0])),vmin=f(Math.min(...corners.map(p=>p[1]))),n=f(Math.ceil((Math.max(...corners.map(p=>p[1]))-vmin)/f(3.5)));
 const spacing=overlap===undefined?-2:f((max-min)*(1-overlap)),extent=f(max-min+Math.abs(spacing)*(overlap===undefined?n:n-1)+(overlap===undefined?1:0));
 const k=Math.floor((-(x+.5)*s+(y+.5)*c-vmin)/3.5),stagger=spacing>=0?k:n-1-k,front=f(-max)+f(.371)*extent-Math.abs(spacing)*stagger,u=-((x+.5)*c+(y+.5)*s);
 return smooth((front-u)/(f(.05)*extent)+.5);
}
export function variedSource(kind:number,x:number,y:number){const u=f((x+.5)/32),v=f((y+.5)/20);return kind===3?[f(.1+u),f(.25+v),-.125,1]:[f(u*u),f(-.125+v*.5),.25,1];}
export function sourceReactorField(reactor:string,gaussian:(v:number[],sigma:number)=>number[]){
 const luma=(kind:number)=>Array.from({length:640},(_,i)=>variedSource(kind,i%32,Math.floor(i/32)).slice(0,3).reduce((n,v,c)=>n+v*f([.2126,.7152,.0722][c]),0));
 const a=luma(3),b=luma(4),ma=gaussian(a,8),mb=gaussian(b,8),difference=a.map((v,i)=>v-b[i]);
 const read=(x:number,y:number)=>difference[Math.max(0,Math.min(19,y))*32+Math.max(0,Math.min(31,x))];
 const raw=a.map((v,i)=>reactor==='brightness-difference'?Math.abs(v-b[i]):reactor==='contrast-difference'?Math.abs((v-ma[i])-(b[i]-mb[i])):reactor==='local-difference'?Math.hypot((read(i%32+1,Math.floor(i/32))-read(i%32-1,Math.floor(i/32)))*.5,(read(i%32,Math.floor(i/32)+1)-read(i%32,Math.floor(i/32)-1))*.5):(v+b[i])*.5);
 return gaussian(raw,1);
}
export function sourceBlendReference(x:number,y:number){const t=smooth((f(.371)-.5)/f(.4)+.5);return lerp(t,variedSource(3,x,y),variedSource(4,x,y));}
function noise(x:number,y:number,seed:number){let h=Math.imul(x,0x8da6b343)^Math.imul(y,0xd8163841)^Math.imul(seed,0xcb1ab31f);h^=h>>>13;h=Math.imul(h,0x5bd1e995);h^=h>>>15;return (h&0xffffff)/16777216;}
export function cardReference(x:number,y:number){
 const uv=[(x+.5)/32,(y+.5)/20],cell=uv.map(v=>Math.floor(v*6)),point=cell.map(v=>(v+.5)/6);
 const gradient=Math.max(.125,Math.min(.875,point[0]))*f(.2126)+Math.max(1/6,Math.min(5/6,point[1]))*f(.7152)+.5*f(.0722),order=gradient*(1-f(.3))+noise(cell[0],cell[1],37)*f(.3);
 const phase=clamp((f(.371)-order*(1-.25))/.25),k=phase===0?1:phase===1?-1:Math.cos(phase*f(Math.PI));
 if(Math.abs(k)<.0001)return [0,0,0,0];const axis=Number(noise(cell[0],cell[1],37^0x91)>=.5),q=uv.map((v,i)=>((v*6-Math.floor(v*6))-.5)/(i===axis?Math.abs(k):1));
 if(q.some(v=>Math.abs(v)>.375))return [0,0,0,0];const mapped=q.map((v,c)=>(cell[c]+.5+v/.75)/6*[32,20][c]-.5),edge=mapped.reduce((n,v,c)=>n*clamp(v+1)*clamp([32,20][c]-v),1),source=k<0?B:A,shade=1-f(.4)*(1-Math.abs(k));return source.map((v,c)=>edge*(c===3?v:v*shade));
}
export function centeredBacksideReference(x:number,y:number){
 const qx=x-14,qy=y-8.5,ix=Math.floor(qx),iy=Math.floor(qy),tx=qx-ix,ty=qy-iy,out=[0,0,0,0];
 for(const [dx,dy,k]of [[0,0,(1-tx)*(1-ty)],[1,0,tx*(1-ty)],[0,1,(1-tx)*ty],[1,1,tx*ty]]){const sx=ix+dx,sy=iy+dy;if(sx<0||sx>=4||sy<0||sy>=3)continue;const p=[f((sx+.5)/4),f((sy+.5)/3),.5,1];for(let c=0;c<4;c++)out[c]+=p[c]*k;}return out;
}

export function placedGradient(mode:'stretch'|'center'|'tile'){
 const read=(x:number,y:number)=>{if(mode==='tile'){x=(x%4+4)%4;y=(y%3+3)%3;}else if(mode==='stretch'){x=clamp(x,0,3);y=clamp(y,0,2);}if(x<0||x>=4||y<0||y>=3)return [0,0,0,0];return [Math.fround((x+.5)/4),Math.fround((y+.5)/3),.5,1];};
 return Array.from({length:32*20},(_,i)=>{const x=i%32,y=Math.floor(i/32),qx=mode==='stretch'?(x+.5)*4/32-.5:mode==='center'?x-14:x,qy=mode==='stretch'?(y+.5)*3/20-.5:mode==='center'?y-8.5:y,ix=Math.floor(qx),iy=Math.floor(qy),tx=qx-ix,ty=qy-iy;const p=[0,0,0,0];for(const [dx,dy,weight]of [[0,0,(1-tx)*(1-ty)],[1,0,tx*(1-ty)],[0,1,(1-tx)*ty],[1,1,tx*ty]]){const v=read(ix+dx,iy+dy);for(let c=0;c<4;c++)p[c]+=v[c]*weight;}return p[3]>0?(p[0]*Math.fround(.2126)+p[1]*Math.fround(.7152)+p[2]*Math.fround(.0722))/p[3]:0;});
}
export function gaussian(values:number[],sigma:number){const r=Math.ceil(3*sigma),k=Array.from({length:r*2+1},(_,i)=>Math.exp(-.5*((i-r)/sigma)**2)),sum=k.reduce((a,b)=>a+b,0);for(let i=0;i<k.length;i++)k[i]/=sum;const pass=(v:number[],axis:number)=>v.map((_,i)=>{const x=i%32,y=Math.floor(i/32);let s=0;for(let j=-r;j<=r;j++)s+=v[clamp(y+(axis?j:0),0,19)*32+clamp(x+(axis?0:j),0,31)]*k[j+r];return Math.fround(s);});return pass(pass(values.map(Math.fround),0),1);}
