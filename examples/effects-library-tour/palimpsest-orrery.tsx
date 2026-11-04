/** PALIMPSEST — an imagined, well-used observatory instrument.
 * Editable Frameweave TSX; no downloaded textures, models or images.
 * Native GPU: signed-distance geometry, shadow rays and metal shading.
 * Servo is an ordinary module providing the engraved dial's Canvas texture.
 * This is a deterministic scene shader, not a path tracer or astronomical model.
 */
import {Composition,Stage,Layer,ref,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {processImage,processPa} from 'native-image-effects';
import {createServo} from '../../modules/servo/index.ts';
import {withGpuResources} from '../../modules/gpu-effects/resource-arena.ts';

// Main creative controls. The camera moves; the globe turns very slowly.
export const LOOK={width:1920,height:1080,fps:{num:30000,den:1001},frames:180,
  age:.74,exposure:1.05,aperture:.009,samples:2,cameraArc:.18,seed:1896};

export const instrument=defineNativeStage(async init=>{
  const gpu=init.gpu;
  const dial=await createServo(gpu,{
    profile:'sdr-srgb8',execution:'trusted-local',input:false,width:2048,height:128,seed:LOOK.seed,
    html:'<style>html,body{margin:0;background:#000;overflow:hidden}canvas{display:block}</style><canvas id="dial" width="2048" height="128"></canvas>',
    javascript:`window.frameweaveRender=function(){
      var c=document.getElementById('dial').getContext('2d');
      c.fillStyle='#000';c.fillRect(0,0,2048,128);c.strokeStyle='#fff';c.fillStyle='#fff';
      c.lineWidth=1.5;c.beginPath();
      for(var i=0;i<360;i++){var x=i/360*2048;c.moveTo(x,8);c.lineTo(x,i%10===0?37:i%5===0?27:19);}
      c.stroke();c.textAlign='center';c.font='24px Georgia';
      var roman=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
      for(var j=0;j<12;j++)c.fillText(roman[j],(j+.5)/12*2048,76);
      c.font='10px Georgia';for(var j=0;j<24;j++)c.fillText(String(j*15),(j+.5)/24*2048,113);
    };`,
  });
  const ray=await gpu.compile({abiVersion:1,id:'palimpsest/aged-armillary',version:'1.0.0',inputCount:1,parameterWords:12,code:`
const PI:f32=3.14159265359;
const TAU:f32=6.28318530718;
const CENTER:vec3f=vec3f(0.,2.18,0.);
fn hash(p:vec3f)->f32{var q=fract(p*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
fn hash2(p:vec2f)->f32{return hash(vec3f(p,17.));}
fn noise(p:vec3f)->f32{
  let i=floor(p);let f=fract(p);let u=f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3f(1,0,0)),u.x),mix(hash(i+vec3f(0,1,0)),hash(i+vec3f(1,1,0)),u.x),u.y),
    mix(mix(hash(i+vec3f(0,0,1)),hash(i+vec3f(1,0,1)),u.x),mix(hash(i+vec3f(0,1,1)),hash(i+vec3f(1)),u.x),u.y),u.z);
}
fn grain(p:vec3f)->f32{return .58*noise(p)+.28*noise(p*2.07)+.14*noise(p*4.13);}
fn rx(p:vec3f,a:f32)->vec3f{return vec3f(p.x,cos(a)*p.y-sin(a)*p.z,sin(a)*p.y+cos(a)*p.z);}
fn ry(p:vec3f,a:f32)->vec3f{return vec3f(cos(a)*p.x+sin(a)*p.z,p.y,-sin(a)*p.x+cos(a)*p.z);}
fn rz(p:vec3f,a:f32)->vec3f{return vec3f(cos(a)*p.x-sin(a)*p.y,sin(a)*p.x+cos(a)*p.y,p.z);}
fn cylinder(p:vec3f,r:f32,h:f32)->f32{let q=vec2f(length(p.xz)-r,abs(p.y)-h);return min(max(q.x,q.y),0.)+length(max(q,vec2f(0.)));}
fn box(p:vec3f,b:vec3f)->f32{let q=abs(p)-b;return length(max(q,vec3f(0.)))+min(max(q.x,max(q.y,q.z)),0.);}
fn band(p:vec3f,r:f32,w:f32,h:f32)->f32{let q=abs(vec2f(length(p.xy)-r,p.z))-vec2f(w,h);return length(max(q,vec2f(0.)))+min(max(q.x,q.y),0.)-.008;}
fn torus(p:vec3f,r:f32,t:f32)->f32{return length(vec2f(length(p.xz)-r,p.y))-t;}
fn ringLocal(p:vec3f,id:f32)->vec3f{
  let q=p-CENTER;
  if(id<1.5){return vec3f(q.x,.96377*q.y-.26673*q.z,.26673*q.y+.96377*q.z);}
  if(id<2.5){return vec3f(.93937*q.z+.34290*q.x,q.y,-.34290*q.z+.93937*q.x);}
  return vec3f(q.x,.97815*q.z-.20791*q.y,.20791*q.z+.97815*q.y);
}
fn nearest(a:vec2f,b:vec2f)->vec2f{return select(a,b,b.x<a.x);}
fn scene(p:vec3f)->vec2f{
  var s=vec2f(band(ringLocal(p,1.),1.72,.073,.047),1.);
  s=nearest(s,vec2f(band(ringLocal(p,2.),1.46,.044,.029),2.));
  s=nearest(s,vec2f(band(ringLocal(p,3.),1.87,.103,.039),3.));
  s=nearest(s,vec2f(length(p-CENTER)-.805,4.));
  // Wooden plinth, turned mouldings, brass foot and vertical spindle.
  s=nearest(s,vec2f(cylinder(p-vec3f(0,.23,0),1.40,.18)-.045,5.));
  s=nearest(s,vec2f(cylinder(p-vec3f(0,.47,0),1.30,.055)-.025,5.));
  s=nearest(s,vec2f(torus(p-vec3f(0,.12,0),1.43,.022),6.));
  s=nearest(s,vec2f(torus(p-vec3f(0,.405,0),1.405,.017),6.));
  s=nearest(s,vec2f(cylinder(p-vec3f(0,.61,0),.40,.075)-.035,6.));
  s=nearest(s,vec2f(cylinder(p-vec3f(0,.93,0),.115,.31)-.012,6.));
  s=nearest(s,vec2f(torus(p-vec3f(0,.77,0),.135,.028),6.));
  s=nearest(s,vec2f(torus(p-vec3f(0,1.10,0),.13,.022),6.));
  // Polar axle and its turned end caps.
  s=nearest(s,vec2f(cylinder(p-CENTER,.035,1.53),7.));
  s=nearest(s,vec2f(length(p-CENTER-vec3f(0,1.51,0))-.083,6.));
  s=nearest(s,vec2f(length(p-CENTER+vec3f(0,1.51,0))-.083,6.));
  // Four real screw heads with incised slots, not painted dots.
  let a=atan2(p.z,p.x);let sector=floor((a+PI/4.)/(PI/2.));
  let q=ry(p,sector*PI/2.)-vec3f(1.075,.54,0.);
  let screw=max(cylinder(q,.052,.020),-box(q-vec3f(0,.021,0),vec3f(.045,.010,.006)));
  s=nearest(s,vec2f(screw,7.));
  return s;
}
fn normal(p:vec3f)->vec3f{
  let e=.00065;let a=vec3f(1,-1,-1)*e;let b=vec3f(-1,-1,1)*e;let c=vec3f(-1,1,-1)*e;let d=vec3f(1,1,1)*e;
  return normalize(a*scene(p+a).x+b*scene(p+b).x+c*scene(p+c).x+d*scene(p+d).x);
}
fn intersect(ro:vec3f,rd:vec3f,limit:f32)->vec2f{
  // Bound the instrument before sphere tracing. The desktop is analytic.
  let oc=ro-vec3f(0,1.95,0);let b=dot(oc,rd);let h=b*b-dot(oc,oc)+6.25;
  if(h<0.){return vec2f(limit,0.);}
  var t=max(.02,-b-sqrt(h));let stop=min(limit,-b+sqrt(h));var hit=0.;
  for(var i=0;i<112;i++){
    if(t>stop){break;}let s=scene(ro+rd*t);
    if(s.x<.00065*max(1.,t*.32)){hit=s.y;break;}
    t+=max(.00025,s.x*.86);
  }
  return vec2f(select(limit,t,hit>0.),hit);
}
fn shadow(p:vec3f,light:vec3f)->f32{
  let delta=light-p;let far=length(delta);let rd=delta/far;var t=.018;var shade=1.;
  for(var i=0;i<28;i++){
    if(t>far){break;}let d=scene(p+rd*t).x;
    shade=min(shade,12.*d/t);if(d<.0004){return .06;}
    t+=clamp(d,.018,.23);
  }return clamp(shade,.06,1.);
}
fn occlusion(p:vec3f,n:vec3f)->f32{
  var a=0.;var w=1.;for(var i=1;i<=4;i++){let d=.045*f32(i);a+=(d-scene(p+n*d).x)*w;w*=.58;}
  return clamp(1.-a*2.7,.25,1.);
}
struct Paint{base:vec3f,rough:f32,metal:f32,bump:f32}
fn paint(p:vec3f,id:f32)->Paint{
  let age=paramF32(2u);let mottled=grain(p*8.7);let fine=noise(p*230.);
  var brass=vec3f(.54,.32,.115);var rough=.33;var metal=1.;var bump=0.;
  let dirt=smoothstep(.46,.78,mottled)*age;
  var patina=dirt*.72;
  if(id<=3.){
    let q=ringLocal(p,id);let r=length(q.xy);let radius=select(select(1.87,1.46,id<2.5),1.72,id<1.5);
    let width=select(select(.103,.044,id<2.5),.073,id<1.5);
    let edge=smoothstep(width-.020,width+.008,abs(r-radius));
    patina*=1.-edge*.87;rough=mix(.43,.20,edge);
    let theta=atan2(q.y,q.x)/TAU+.5;
    let radial=clamp((r-radius+width)/(width*2.),0.,1.);
    let marks=sampleUv0(vec2f(fract(theta),radial),true).r;
    let face=smoothstep(.018,.034,abs(q.z));
    let groove=marks*face;
    brass=mix(brass,vec3f(.035,.025,.012),groove*.92);
    patina=max(patina,groove*age*.75);
    // Shallow machining lines and intermittent fine, directional scratches.
    let hair=pow(.5+.5*sin(r*1650.+noise(q*5.)*9.),30.);
    rough+=hair*.075+groove*.1;
    bump=(fine-.5)*.11;
  }
  if(id==4.){
    let q=ry(rx(p-CENTER,-.20),-.35-paramF32(0u)*.028);
    let longitude=atan2(q.z,q.x);let latitude=asin(clamp(q.y/.805,-1.,1.));
    let lat=abs(sin(latitude*12.));let lon=abs(sin(longitude*12.));
    let grid=(1.-smoothstep(.009,.020,min(lat,lon)))*.68;
    let uv=vec2f(longitude/TAU+.5,latitude/PI+.5);
    let tile=floor(uv*vec2f(62,31));let r=hash2(tile);
    let xy=fract(uv*vec2f(62,31))-.5;
    let star=(1.-smoothstep(.025,.065,length(xy)))*step(.82,r);
    let cross=(exp(-abs(xy.x)*150.)*exp(-abs(xy.y)*18.)+exp(-abs(xy.y)*150.)*exp(-abs(xy.x)*18.))*step(.98,r);
    let stain=grain(q*12.);
    let blue=mix(vec3f(.010,.023,.031),vec3f(.028,.061,.066),stain);
    brass=mix(blue,vec3f(.43,.30,.13),clamp(grid+star+cross*.7,0.,1.));
    return Paint(brass,.32+stain*.18,.18+grid*.6,(fine-.5)*.08);
  }
  if(id==5.||id==8.){
    let warp=noise(p*vec3f(1.7,1.2,.45))*13.;
    let lines=sin(p.x*43.+p.z*3.+warp+sin(p.x*4.)*1.2);
    let pore=pow(abs(sin(p.x*146.+p.z*2.+warp*3.)),16.);
    let wear=grain(p*2.3);let fibres=noise(p*vec3f(23.,2.,.7));
    let wood=vec3f(.060,.024,.011)*(.72+.12*lines+.26*fibres);
    let faded=wood*(.70+wear*.50)-vec3f(pore*.0012);
    return Paint(faded,select(.43,.74,id==8.)+noise(p*45.)*.08,0.,(fine-.5)*.035);
  }
  if(id==7.){brass=vec3f(.16,.17,.16);rough=.29;patina=dirt*.4;}
  let oxide=vec3f(.021,.091,.072)*(.6+mottled*.7);
  brass=mix(brass*(.86+fine*.20),oxide,patina);
  rough=clamp(rough+patina*.40,.15,.90);metal=1.-patina*.85;
  return Paint(brass,rough,metal,bump);
}
fn environment(d:vec3f,rough:f32)->vec3f{
  var col=mix(vec3f(.033,.025,.018),vec3f(.12,.145,.16),smoothstep(-.15,.8,d.y));
  // Reflected studio windows. Width increases with surface roughness.
  let key=normalize(vec3f(-.65,.75,1.));let rim=normalize(vec3f(.85,.35,-.7));
  col+=vec3f(3.2,2.45,1.60)*pow(max(dot(d,key),0.),mix(180.,5.,rough*rough));
  col+=vec3f(.55,.78,1.08)*pow(max(dot(d,rim),0.),mix(130.,4.,rough*rough));
  return col;
}
fn direct(p:vec3f,n:vec3f,v:vec3f,material:Paint,position:vec3f,radiance:vec3f,vis:f32)->vec3f{
  let l=normalize(position-p);let h=normalize(v+l);let nl=max(dot(n,l),0.);let nv=max(dot(n,v),.001);
  let nh=max(dot(n,h),0.);let vh=max(dot(v,h),0.);let a=material.rough*material.rough;let a2=a*a;
  let den=nh*nh*(a2-1.)+1.;let D=a2/max(PI*den*den,.00001);
  let k=(material.rough+1.)*(material.rough+1.)/8.;let G=nv/(nv*(1.-k)+k)*nl/max(nl*(1.-k)+k,.001);
  let f0=mix(vec3f(.04),material.base,material.metal);let F=f0+(1.-f0)*pow(1.-vh,5.);
  let spec=D*G*F/max(4.*nv*nl,.001);
  let diffuse=material.base*(1.-material.metal)*(1.-F)/PI;
  return (diffuse+spec)*radiance*nl*vis;
}
fn trace(ro:vec3f,rd:vec3f)->vec3f{
  let tableT=select(120.,max(.01,-ro.y/rd.y),rd.y<-.001);
  let hit=intersect(ro,rd,tableT);var id=hit.y;
  if(id==0.&&tableT>=120.){return vec3f(.006,.009,.009);}
  if(id==0.){id=8.;}
  let p=ro+rd*hit.x;var n=vec3f(0.,1.,0.);if(id!=8.){n=normal(p);}
  let m=paint(p,id);let micro=vec3f(noise(p*193.),noise(p.yzx*193.+7.),noise(p.zxy*193.+13.))-.5;
  n=normalize(n+(micro-n*dot(micro,n))*m.bump);
  let v=-rd;let key=vec3f(-3.8,6.5,4.8);let fill=vec3f(4.5,3.5,-3.8);
  let vis=shadow(p+n*.003,key);var ao=1.;if(id!=8.){ao=occlusion(p,n);}else{ao=clamp(1.-.48*exp(-dot(p.xz,p.xz)*.65),.45,1.);}
  var col=direct(p,n,v,m,key,vec3f(4.6,3.8,2.8),vis);
  col+=direct(p,n,v,m,fill,vec3f(.62,.88,1.12),1.);
  let nv=max(dot(n,v),0.);let f0=mix(vec3f(.04),m.base,m.metal);
  let F=f0+(1.-f0)*pow(1.-nv,5.);
  col+=environment(reflect(rd,n),m.rough)*F*ao*(1.-m.rough*.34);
  col+=m.base*(1.-m.metal)*vec3f(.17,.20,.19)*ao;
  // Subtle reflection on the varnished desktop; traced against actual geometry.
  if(id==8.&&length(p.xz)<3.3){
    let reflected=intersect(p+n*.015,reflect(rd,n),8.);
    if(reflected.y>0.){let rp=p+n*.015+reflect(rd,n)*reflected.x;let rm=paint(rp,reflected.y);col+=rm.base*.10*exp(-reflected.x*.6);}
  }
  let atmosphere=1.-exp(-max(hit.x-9.,0.)*.11);
  return mix(max(col,vec3f(0.)),vec3f(.006,.009,.009),atmosphere);
}
fn pixel(p:vec2u)->vec4f{
  let size=vec2f(outputSize());let t=paramF32(0u);let orbit=-.34+paramF32(5u)*(t/6.-.5);
  let eye=vec3f(sin(orbit)*8.9,4.15+sin(t*.18)*.06,cos(orbit)*8.9);
  let focusPoint=vec3f(0.,1.98,0.);let forward=normalize(focusPoint-eye);let right=normalize(cross(forward,vec3f(0,1,0)));let up=cross(right,forward);
  var color=vec3f(0.);let count=u32(paramF32(4u));
  for(var sample=0u;sample<4u;sample++){
    if(sample>=count){break;}
    let r=vec2f(hash2(vec2f(p)+f32(sample)*17.),hash2(vec2f(p)+f32(sample)*41.+11.));
    let uv=(2.*(vec2f(p)+r)-size)/size.y;
    let direction=normalize(forward*3.05+right*uv.x-up*uv.y);
    let aperture=(r-.5)*paramF32(3u);let offset=right*aperture.x+up*aperture.y;
    let focus=eye+direction*(length(focusPoint-eye)/dot(direction,forward));
    color+=trace(eye+offset,normalize(focus-eye-offset));
  }
  color=color/f32(max(count,1u))*paramF32(1u);
  // A gentle shoulder for the final SDR photograph, not hard highlight clipping.
  color=color/(1.+color*.27);
  let uv=vec2f(p)/size;let vignette=1.-.15*dot((uv-.5)*vec2f(1.2,1.),(uv-.5)*vec2f(1.2,1.));
  return vec4f(color*vignette,1.);
}`});
  return {
    async renderAt(context){
      const t=context.frame/(LOOK.frames-1)*6;
      const engraving=await dial.render(undefined,{context,parameters:{}});
      return withGpuResources(gpu,async arena=>{
        const photograph=arena.image(await gpu.run(ray,[engraving],{
          parameters:Float32Array.of(t,LOOK.exposure,LOOK.age,LOOK.aperture,LOOK.samples,LOOK.cameraArc,0,0,0,0,0,0),
          output:{width:init.width,height:init.height,format:'rgba32float',alpha:'opaque',color:linear709},
        }));
        const optical=await processPa(photograph,(image,fx)=>fx.glow(image,{
          radius:2.0*init.height/1080,intensity:.045,threshold:1.0,boundary:'clamp'}),{context});
        return processImage(optical,(image,fx)=>fx.brightnessContrast(image,{contrast:1.025,pivot:.12}),{context});
      });
    },
    async dispose(){await dial.dispose();},
  };
});

export default <Composition id="palimpsest-antique-orrery" width={LOOK.width} height={LOOK.height}
 fps={LOOK.fps} durationInFrames={LOOK.frames} seed={LOOK.seed} background="#10100d">
 <Stage id="instrument" factory={instrument}/>
 <Layer id="photograph" source={ref('instrument')}/>
</Composition>;
