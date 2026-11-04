/** AUREOLE / Orbital Engine — real XYZ geometry, shared depth, moving perspective.
 * 1920×1080 / 30000:1001 / 240 frames. Native F32 mesh + existing image effects.
 * Three.js supplies geometry and camera math, not a second renderer.
 * One Servo module supplies typography. The original score uses an Audio Stage.
 */
import {Composition,Stage,Layer,ref,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {frameToSample} from '@frameweave/engine/audio';
import {processImage,processPa,processRaster} from 'native-image-effects';
import {TorusGeometry,TorusKnotGeometry,SphereGeometry,IcosahedronGeometry,BoxGeometry,
  CylinderGeometry,PerspectiveCamera,Matrix4,WebGPUCoordinateSystem} from 'three';
import type {BufferGeometry} from 'three';
import {withGpuResources} from '../../modules/gpu-effects/resource-arena.ts';
import {createServo} from '../../modules/servo/index.ts';

export const ART={width:1920,height:1080,fps:{num:30000,den:1001},frames:240,seed:1927};
export const SOUND={volume:.92,pad:.14,bass:.048,bells:.17,air:.006,crest:.032};

export const world=defineNativeStage(async init=>{
  const g=init.gpu;
  const output={width:init.width,height:init.height,format:'rgba32float' as const,
    alpha:'premultiplied' as const,color:linear709};
  const xyz:number[]=[],normals:number[]=[],traits:number[]=[];
  function add(geometry:BufferGeometry,kind:number,id:number,material:number){
    const mesh=geometry.index?geometry.toNonIndexed():geometry;
    const p=mesh.getAttribute('position'),n=mesh.getAttribute('normal');
    for(let i=0;i<p.count;i++){
      xyz.push(p.getX(i),p.getY(i),p.getZ(i));
      normals.push(n.getX(i),n.getY(i),n.getZ(i));
      traits.push(kind,id,material,0);
    }
    if(mesh!==geometry)mesh.dispose();geometry.dispose();
  }
  add(new TorusKnotGeometry(.72,.20,120,10,2,3),0,0,0);
  for(let i=0;i<4;i++)add(new TorusGeometry(1.48+i*.39,.035-i*.0035,8,112),1,i,1);
  for(let i=0;i<48;i++)add(new BoxGeometry(.055,i%4===0?.20:.105,.065),2,i,i%4===0?2:1);
  for(let i=0;i<14;i++)add(new SphereGeometry(.085+(i%3)*.014,10,7),4,i,i%3===0?1:2);
  for(let i=0;i<64;i++)add(new IcosahedronGeometry(.018+(i%4)*.005,0),5,i,i%3===0?5:4);
  add(new CylinderGeometry(2.93,3.12,.22,96,1).translate(0,-2.77,0),3,0,3);
  add(new TorusGeometry(2.94,.024,6,144).rotateX(Math.PI/2).translate(0,-2.64,0),3,0,1);
  add(new CylinderGeometry(1.05,1.24,.15,72,1).translate(0,-2.58,0),3,0,3);
  add(new BoxGeometry(24,.035,24).translate(0,-2.925,0),6,0,6);
  for(let i=-12;i<=12;i++){
    add(new BoxGeometry(.008,.006,24).translate(i,-2.903,0),7,0,7);
    add(new BoxGeometry(24,.006,.008).translate(0,-2.903,i),7,0,7);
  }
  const count=xyz.length/3;
  const positions=await g.createField({type:'f32',dimensions:[count,1,1],components:3,
    semantic:'position',space:'aureole.local',units:'meter'},Float32Array.from(xyz));
  const vertexNormals=await g.createField({type:'f32',dimensions:[count,1,1],components:3,
    semantic:'normal',space:'aureole.local',units:'dimensionless'},Float32Array.from(normals));
  const objects=await g.createField({type:'f32',dimensions:[count,1,1],components:4,
    semantic:'generic',space:'aureole.objects',units:'dimensionless'},Float32Array.from(traits));

  // One fixed geometry batch: GPU computes world positions and per-vertex light.
  // Central twist/wave normals use the inverse-transpose deformation Jacobian.
  const animate=await g.compileCompute({abiVersion:1,id:'aureole/world-and-light',version:'1.0.0',
    bindings:[{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read'},
      {type:'f32',access:'read_write'},{type:'f32',access:'read_write'}],
    parameterWords:8,workgroupSize:[64,1,1],code:`
fn rx(v:vec3f,a:f32)->vec3f{return vec3f(v.x,cos(a)*v.y-sin(a)*v.z,sin(a)*v.y+cos(a)*v.z);}
fn ry(v:vec3f,a:f32)->vec3f{return vec3f(cos(a)*v.x+sin(a)*v.z,v.y,-sin(a)*v.x+cos(a)*v.z);}
fn rz(v:vec3f,a:f32)->vec3f{return vec3f(cos(a)*v.x-sin(a)*v.y,sin(a)*v.x+cos(a)*v.y,v.z);}
fn compute(id:vec3u,local:vec3u,group:vec3u){
  let i=id.x;let offset=i*3u;
  var p=vec3f(load0(offset),load0(offset+1u),load0(offset+2u));
  var n=vec3f(load1(offset),load1(offset+1u),load1(offset+2u));
  let kind=u32(load2(i*4u));let item=load2(i*4u+1u);let material=load2(i*4u+2u);
  let t=paramF32(0u);let eye=vec3f(paramF32(1u),paramF32(2u),paramF32(3u));
  if(kind==0u){
    let k=.25*sin(t*.73);let a=k*p.y;
    n=normalize(ry(vec3f(n.x,n.y-k*p.z*n.x+k*p.x*n.z,n.z),a));p=ry(p,a);
    let slope=.065*4.*cos(p.y*4.+t*1.4);
    n=normalize(vec3f(n.x,n.y-slope*n.x,n.z));p.x+=.065*sin(p.y*4.+t*1.4);
    p=ry(rz(p,t*.22),t*.48);n=ry(rz(n,t*.22),t*.48);
  }else if(kind==1u){
    if(item<.5){p=ry(rx(p,.28+t*.34),t*.19);n=ry(rx(n,.28+t*.34),t*.19);}
    else if(item<1.5){p=rz(ry(p,1.05-t*.31),-.3+t*.17);n=rz(ry(n,1.05-t*.31),-.3+t*.17);}
    else if(item<2.5){p=ry(rx(p,1.25+t*.23),t*.36);n=ry(rx(n,1.25+t*.23),t*.36);}
    else{p=ry(rx(p,.55),t*.11);n=ry(rx(n,.55),t*.11);}
  }else if(kind==2u){
    let a=item/48.*6.28318530718;
    p=rz(p,a)+vec3f(cos(a)*2.65,sin(a)*2.65,0.);n=rz(n,a);
    p=ry(rx(p,.55),t*.11);n=ry(rx(n,.55),t*.11);
  }else if(kind==4u){
    let a=item/14.*6.28318530718+t*(.36+fract(item*.17)*.15);
    p+=vec3f(cos(a)*3.05,.46*sin(a*2.+item*.3),sin(a)*3.05);
  }else if(kind==5u){
    let a=item*2.39996323+t*.14;let radius=3.3+.40*sin(item*1.7);
    p+=vec3f(cos(a)*radius,.2+1.75*sin(item*.81+t*.24),sin(a)*radius);
  }
  n=normalize(n);
  let key=normalize(vec3f(-.6,.85,.7));let fill=normalize(vec3f(.7,.2,-.65));
  let view=normalize(eye-p);let halfVector=normalize(key+view+vec3f(.00001));
  let diffuse=max(0.,dot(n,key));let bounce=max(0.,dot(n,fill));
  let specular=pow(max(0.,dot(n,halfVector)),42.);
  let rim=pow(1.-max(0.,dot(n,view)),3.);
  var shade=clamp(.085+.56*diffuse+.14*bounce+.48*specular+.14*rim,0.,1.);
  if(kind==5u){shade=.60+.20*sin(t*1.4+item);}
  if(kind==7u){shade=.23;}
  store3(offset,p.x);store3(offset+1u,p.y);store3(offset+2u,p.z);
  store4(i*2u,(.5+shade*511.)/512.);store4(i*2u+1u,(material+.5)/8.);
}`});

  const paint=await g.compile({abiVersion:1,id:'aureole/metal-ceramic-light-atlas',version:'1.0.0',
    inputCount:0,parameterWords:0,code:`
fn pixel(p:vec2u)->vec4f{
  let s=f32(p.x)/511.;var base=vec3f(.035,.19,.29);
  if(p.y==1u){base=vec3f(.68,.34,.085);}
  if(p.y==2u){base=vec3f(.63,.69,.74);}
  if(p.y==3u){base=vec3f(.015,.019,.028);}
  if(p.y==4u){return vec4f(vec3f(.075,.94,1.55)*(.4+s*1.8),1.);}
  if(p.y==5u){return vec4f(vec3f(2.0,.65,.11)*(.4+s*1.8),1.);}
  if(p.y==6u){base=vec3f(.0035,.0045,.007);}
  if(p.y==7u){base=vec3f(.038,.054,.076);}
  let spec=pow(s,18.);let shine=select(vec3f(1.3,1.6,1.9),vec3f(2.3,1.6,.74),p.y==1u);
  return vec4f(base*(.09+1.55*s)+shine*spec,1.);
}`});
  const background=await g.compile({abiVersion:1,id:'aureole/atmosphere',version:'1.0.0',
    inputCount:0,parameterWords:1,code:`
fn hash(p:vec2f)->f32{return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);}
fn pixel(p:vec2u)->vec4f{
  let size=vec2f(outputSize());let uv=(vec2f(p)+.5)/size;let q=(uv-.5)*vec2f(size.x/size.y,1.);
  let halo=exp(-dot(q,q)*2.8);let horizon=exp(-abs(uv.y-.63)*13.);
  let cell=floor(uv*vec2f(90.,51.));let point=fract(uv*vec2f(90.,51.))-.5;
  let star=exp(-dot(point,point)*210.)*step(.986,hash(cell));
  return vec4f(vec3f(.002,.004,.009)+vec3f(.005,.024,.045)*halo+
    vec3f(.014,.009,.004)*horizon+vec3f(.10,.19,.24)*star,1.);
}`});

  const captions=await createServo(g,{
    profile:'sdr-srgb8',execution:'trusted-local',input:false,width:init.width,height:init.height,seed:ART.seed,
    html:`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
      #page{position:absolute;inset:0;color:#f0e6d1;font-family:Arial,sans-serif}
      .label{position:absolute;left:5%;top:7%;font-size:11px;letter-spacing:3px;color:#a6bbb8}
      h1{position:absolute;left:4.8%;top:8%;margin:0;font-family:Georgia,serif;font-weight:400;font-size:48px;letter-spacing:2px}
      .sub{position:absolute;left:5%;bottom:7%;font-family:Georgia,serif;font-style:italic;font-size:20px;color:#c7c5b4}
      .right{position:absolute;right:5%;bottom:7.4%;font-size:10px;letter-spacing:2px;color:#8ea5a9}
    </style><div id="page"><div class="label">AN ORBITAL ENGINE</div><h1>AUREOLE</h1>
      <div class="sub">An impossible instrument.</div><div class="right">FORM / LIGHT / MOTION</div></div>`,
    javascript:`window.frameweaveRender=function(c,p){
      var t=p.time,v=Math.min(1,t/.65)*Math.min(1,(8-t)/.75);
      document.getElementById('page').style.opacity=String(.01+.99*Math.max(0,v));
    };`,
  });
  const camera=new PerspectiveCamera(40,init.width/init.height,.05,80);
  camera.coordinateSystem=WebGPUCoordinateSystem;

  return {
    async renderAt(context){
      const t=context.frame/(ART.frames-1)*8;
      const angle=-.66+t*.17,range=11.9-.60*Math.sin(t/8*Math.PI);
      camera.position.set(Math.sin(angle)*range,3.3+.52*Math.sin(t*.43),Math.cos(angle)*range);
      camera.lookAt(0,-.45,0);camera.updateMatrixWorld();camera.updateProjectionMatrix();
      const matrix=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).toArray();
      return withGpuResources(g,async arena=>{
        const world=arena.buffer(await g.createField({type:'f32',dimensions:[count,1,1],components:3,
          semantic:'position',space:'world',units:'meter'}));
        const uv=arena.buffer(await g.createField({type:'f32',dimensions:[count,1,1],components:2,
          semantic:'generic',space:'aureole.light-atlas',units:'dimensionless'}));
        await g.dispatch(animate,[positions,vertexNormals,objects,world,uv],{workItems:[count,1,1],
          parameters:Float32Array.of(t,camera.position.x,camera.position.y,camera.position.z,0,0,0,0)});
        const material=arena.image(await g.run(paint,[],{output:{width:512,height:8,format:'rgba32float',alpha:'opaque',color:linear709}}));
        const mesh=arena.image(await g.drawMesh({positions:world,count,matrix,
          texture:{version:1,image:material,uvs:uv,filter:'linear',addressU:'clamp',addressV:'clamp'},
          raster:{version:1,mode:'cutout',alphaCutoff:.01},output}));
        const sky=arena.image(await g.run(background,[],{parameters:Float32Array.of(t),output:{...output,alpha:'opaque'}}));
        const scene=await processRaster(mesh,(image,fx)=>fx.over(image,sky),{context});
        const lit=await processPa(scene,async(image,fx)=>{
          const softened=await fx.blur(image,{radius:.34*init.height/1080,boundary:'clamp'});
          return fx.glow(softened,{radius:4.5*init.height/1080,
            intensity:.33,threshold:1.05,boundary:'clamp'});
        },{context});
        const graded=await processImage(lit,async(image,fx)=>{
          const crisp=await fx.brightnessContrast(image,{contrast:1.035,pivot:.12});
          return fx.vignette(crisp,{amount:.16,radius:.95,center:[.5,.48],pinHighlights:.8});
        },{context});
        const title=await captions.render(undefined,{context,parameters:{time:t}});
        return processRaster(graded,(image,fx)=>fx.over(title,image),{context});
      });
    },
    async dispose(){await captions.dispose();for(const b of [objects,vertexNormals,positions])await g.releaseBuffer(b);},
  };
});

// Original sample-accurate score and ordinary Composition follow below.

export default <Composition id="aureole-orbital-engine" width={ART.width} height={ART.height}
 fps={ART.fps} durationInFrames={ART.frames} seed={ART.seed} background="#000000">
 <Stage id="world" factory={world}/><Stage id="soundtrack" engine="audio" entry="./aureole-score.ts" audio={{schemaVersion:1,sampleRate:48000,layout:'stereo',durationSamples:frameToSample(ART.frames,48000,ART.fps),seek:'stateless',lookbehindSamples:0,lookaheadSamples:0,latencySamples:0,tailSamples:0}}/>
 <Layer id="picture" source={ref('world')}/>
 <Layer id="music" source={ref('soundtrack','audio')} start={0} end={ART.frames} gain={SOUND.volume}/>
</Composition>;
