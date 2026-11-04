/** THE STILL HOURS / 庄园的午后
 * A furnished, inhabited drawing room, authored as ordinary editable TSX.
 * All geometry, ornament, printed matter and textures are made in this file.
 * Three.js supplies geometry/math; Servo supplies a Canvas texture atlas.
 * Scene-specific Native GPU ray queries use the existing owner and lifecycle.
 * No downloaded model, image, font, network request or second Renderer.
 */
import {Composition,Stage,Layer,ref,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {processImage,processPa} from 'native-image-effects';
import {BoxGeometry,SphereGeometry,CylinderGeometry,TorusGeometry,PlaneGeometry,
  LatheGeometry,TubeGeometry,CatmullRomCurve3,Vector2,Vector3,Matrix4,Quaternion,Euler,Color} from 'three';
import type {BufferGeometry} from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createServo} from '../../modules/servo/index.ts';
import {withGpuResources} from '../../modules/gpu-effects/resource-arena.ts';

export const FILM={width:1920,height:1080,fps:{num:30000,den:1001},frames:720,seed:1896,
  exposure:1.15,samples:2,aperture:.005,fire:1,daylight:1,grain:.001};

type V3=[number,number,number];
type Material={color:string;rough?:number;metal?:number;kind?:number;tile?:number;
  emission?:number;scale?:[number,number];rect?:[number,number,number,number];wear?:number};
type Triangle={values:number[];lo:V3;hi:V3;center:V3};

/** Shot authoring helpers. Furniture stays ordinary TS geometry composition. */
export function furnishManor(){
  let matrix=new Matrix4(),motion=0;const room:Triangle[]=[],cat:Triangle[]=[];
  const paints:number[]=[],inventory:Record<string,number>={};
  const material=(m:Material)=>{
    const c=new Color(m.color),tile=m.tile??-1;
    const rect=m.rect??[tile<0?0:tile%4/4,tile<0?0:Math.floor(tile/4)/4,.25,.25];
    const id=paints.length/16;
    paints.push(c.r,c.g,c.b,m.rough??.5,m.metal??0,m.kind??0,tile,m.emission??0,
      m.scale?.[0]??1,m.scale?.[1]??1,m.wear??.3,id*.731,...rect);
    return id;
  };
  const walnut=material({color:'#67432a',kind:1,rough:.38,wear:.6});
  const darkWood=material({color:'#37251b',kind:1,rough:.33,wear:.7});
  const oak=Array.from({length:8},(_,i)=>material({color:['#785539','#6d4d35','#896446','#715039','#806048','#674a34','#89664d','#755438'][i],kind:1,rough:.54,wear:.75}));
  const greenWall=material({color:'#798171',kind:14,tile:2,scale:[3,4],rough:.85,wear:.55});
  const panel=material({color:'#405449',kind:1,rough:.56,wear:.6});
  const ivory=material({color:'#d8c9a4',rough:.82,wear:.35});
  const gilding=material({color:'#b3914f',kind:3,metal:.88,rough:.29,wear:.7});
  const brass=material({color:'#a78042',kind:3,metal:.94,rough:.24,wear:.75});
  const iron=material({color:'#292725',metal:.7,rough:.59,wear:.8});
  const black=material({color:'#151616',rough:.75});
  const cream=material({color:'#dbcdb0',rough:.49});
  const marble=material({color:'#453e35',kind:4,rough:.34,wear:.65});
  const hearthStone=material({color:'#36302a',kind:4,rough:.69,wear:.85});
  const velvet=material({color:'#485d49',kind:2,tile:10,scale:[2,2],rough:.73});
  const wine=material({color:'#73483d',kind:2,rough:.77,wear:.7});
  const linen=material({color:'#c8b898',kind:2,tile:10,rough:.88,wear:.55});
  const piping=material({color:'#8b815c',kind:2,rough:.75});
  const carpet=material({color:'#b39b78',kind:13,tile:1,rough:.96});
  const page=material({color:'#d1bc8b',kind:10,rough:.93,wear:.7});
  const paper=material({color:'#ddd2b2',kind:5,tile:4,rough:.93,wear:.55});
  const letter=material({color:'#ddd0ae',kind:5,tile:5,rough:.88,wear:.45});
  const porcelain=material({color:'#d8d7c6',kind:6,rough:.18});
  const tea=material({color:'#382014',rough:.12});
  const milk=material({color:'#ded5b5',rough:.25});
  const glass=material({color:'#c4d2cf',kind:9,rough:.1});
  const wax=material({color:'#d1be8d',rough:.55});
  const flame=material({color:'#ffc97c',kind:11,emission:6,rough:.3});
  const ember=material({color:'#ee7124',kind:8,emission:2.5});
  const green=material({color:'#40553a',kind:12,rough:.83});
  const brown=material({color:'#70513a',kind:1,rough:.9});
  const bookColors=['#6c3a31','#3a4f4c','#695737','#303d50','#725344','#444329','#66363d','#48574a'];
  const books=bookColors.map((color,i)=>material({color,rough:.56,kind:5,tile:3,
    rect:[.75+(i%4)*.0625,Math.floor(i/4)*.125,.0625,.125],wear:.7}));
  const leather=material({color:'#694336',rough:.55,kind:2});
  const goldPaint=material({color:'#b59964',rough:.65});
  const sceneLabel=(s:string)=>{inventory[s]=(inventory[s]??0)+1;};
  function at(p:V3,rotation:V3,fn:()=>void,scale:V3=[1,1,1]){
    const saved=matrix;matrix=saved.clone().multiply(new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...rotation)),new Vector3(...scale)));
    fn();matrix=saved;
  }
  function animated(tag:number,fn:()=>void){const saved=motion;motion=tag;fn();motion=saved;}
  function add(g:BufferGeometry,m:number,p:V3=[0,0,0],r:V3=[0,0,0],scale:V3=[1,1,1]){
    const transform=matrix.clone().multiply(new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r)),new Vector3(...scale)));
    const expanded=g.index?g.toNonIndexed():g;expanded.applyMatrix4(transform);
    const a=expanded.getAttribute('position'),n=expanded.getAttribute('normal'),uv=expanded.getAttribute('uv');
    for(let i=0;i<a.count;i+=3){
      const v=[0,1,2].map(j=>[a.getX(i+j),a.getY(i+j),a.getZ(i+j)]);
      const norm=[0,1,2].map(j=>[n.getX(i+j),n.getY(i+j),n.getZ(i+j)]);
      const tex=[0,1,2].map(j=>uv?[uv.getX(i+j),uv.getY(i+j)]:[0,0]);
      const e1=v[1].map((x,k)=>x-v[0][k]),e2=v[2].map((x,k)=>x-v[0][k]);
      // Geometry with animation has conservative swept bounds, never a stale BVH.
      let margin=motion>=100?.24:motion===1?.15:motion===2?.12:motion===4?.52:.002;
      const lo=v[0].map((_,k)=>Math.min(v[0][k],v[1][k],v[2][k])-margin) as V3;
      const hi=v[0].map((_,k)=>Math.max(v[0][k],v[1][k],v[2][k])+margin) as V3;
      (motion>=100?cat:room).push({values:[...v[0],m,...e1,motion,...e2,0,...norm[0],tex[0][0],
        ...norm[1],tex[0][1],...norm[2],tex[1][0],tex[1][1],tex[2][0],tex[2][1],0],lo,hi,
        center:v[0].map((_,k)=>(lo[k]+hi[k])*.5) as V3});
    }
    if(expanded!==g)expanded.dispose();g.dispose();
  }
  const block=(p:V3,size:V3,m:number,round=0,r:V3=[0,0,0])=>add(round>0?new RoundedBoxGeometry(...size,1,round):new BoxGeometry(...size),m,p,r);
  const ball=(p:V3,size:V3,m:number,segments=12)=>add(new SphereGeometry(1,segments,Math.max(6,segments/2)),m,p,[0,0,0],size);
  const cylinder=(p:V3,rt:number,rb:number,h:number,m:number,r:V3=[0,0,0],segments=16)=>add(new CylinderGeometry(rt,rb,h,segments,1),m,p,r);
  const ring=(p:V3,radius:number,tube:number,m:number,rotation:V3=[0,0,0],segments=32)=>add(new TorusGeometry(radius,tube,5,segments),m,p,rotation);
  const line=(points:V3[],radius:number,m:number,steps=12)=>add(new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),steps,radius,5,false),m);
  const turned=(p:V3,profile:[number,number][],m:number,scale:V3=[1,1,1],segments=18)=>add(new LatheGeometry(profile.map(v=>new Vector2(...v)),segments),m,p,[0,0,0],scale);
  const print=(p:V3,size:[number,number],m:number,rotation:V3=[0,0,0])=>add(new PlaneGeometry(...size),m,p,rotation);
  const frame=(p:V3,size:[number,number],tile:number,rotation:V3=[0,0,0])=>at(p,rotation,()=>{
    const [w,h]=size;block([0,0,-.025],[w+.16,h+.16,.075],darkWood,.015);
    for(const b of [.075,.025,-.008]){
      const thick=b===.075?.04:.014;const mat=b===.075?gilding:brass;
      block([0,h/2+b,.02],[w+2*b,thick,.045],mat,.007);
      block([0,-h/2-b,.02],[w+2*b,thick,.045],mat,.007);
      block([w/2+b,0,.02],[thick,h+2*b,.045],mat,.007);
      block([-w/2-b,0,.02],[thick,h+2*b,.045],mat,.007);
    }
    const portrait=Math.floor(Math.abs(p[0]*7+p[2]*11))%3;
    const image=material({color:'#ffffff',kind:5,tile,rough:.82,wear:.35,
      ...(tile===7?{rect:[.75+portrait/12,.25,1/12,.25] as [number,number,number,number]}:{})});
    print([0,0,.032],[w,h],image);
    for(const x of [-1,1])for(const y of [-1,1]){
      for(let k=0;k<3;k++)ball([x*(w/2+.055-k*.015),y*(h/2+.045),.065],[.032,.018,.014],gilding,8);
    }sceneLabel('framed paintings and photographs');
  });

  // Architectural shell: a room with actual openings and individual floorboards.
  block([0,-.10,0],[10.3,.18,11.4],darkWood);
  for(let row=0;row<36;row++)for(let column=0;column<8;column++){
    const x=-4.85+row*.277,z=-5.4+column*1.39+(row%2)*.22;
    block([x,.005,z],[.270,.026,1.375],oak[(row*5+column*3)%8]);
  }
  block([0,2.50,-5.30],[10.25,5,.16],greenWall);
  block([-5.10,2.50,0],[.16,5,10.6],greenWall);
  // Right-hand wall: two real glazed window openings.
  block([5.10,.54,0],[.16,1.08,10.6],greenWall);
  block([5.10,4.70,0],[.16,.62,10.6],greenWall);
  for(const [z,length] of [[-4.5,1.6],[-.525,1.75],[3.925,2.75]] as const)block([5.1,2.7,z],[.16,3.35,length],greenWall);
  block([0,5.03,0],[10.3,.13,10.7],ivory);
  // Wainscot panels, skirting, picture rails, layered plaster cornices.
  for(const side of [0,1,2])at(side===0?[0,0,-5.18]:side===1?[-5,0,0]:[5,0,0],[0,side===0?0:side===1?Math.PI/2:-Math.PI/2,0],()=>{
    block([0,.50,0],[10,.96,.065],panel);
    for(let x=-4.6;x<4.8;x+=.92){
      block([x,.50,.045],[.76,.63,.032],darkWood,.009);
      block([x,.50,.07],[.68,.55,.035],panel,.008);
      for(const y of [.19,.81])block([x,y,.09],[.75,.022,.025],gilding);
      for(const dx of [-.37,.37])block([x+dx,.5,.09],[.021,.60,.025],gilding);
    }
    for(const [y,h,d] of [[.10,.16,.12],[1.02,.07,.11],[1.08,.028,.14],[4.50,.035,.07],[4.80,.09,.10],[4.89,.06,.17],[4.96,.05,.23]])
      block([0,y,d*.5],[10,h,d],y>4.6?ivory:panel,.006);
    for(let x=-4.8;x<5;x+=.24)block([x,4.84,.115],[.10,.12,.13],ivory,.009);
  });
  for(const x of [-3.25,0,3.25]){block([x,4.96,0],[.09,.12,10.6],ivory,.012);}
  for(const z of [-3,0,3]){block([0,4.96,z],[10.1,.12,.09],ivory,.012);}
  // Hairline plaster crack and rubbed skirting; separate authored geometry.
  line([[-4.72,3.8,-5.205],[-4.65,3.72,-5.205],[-4.68,3.61,-5.205],[-4.61,3.52,-5.205]],.0025,hearthStone,5);
  sceneLabel('paneled room with cornice and oak floor');

  // Tall windows, glazing bars, old brass handles, curtain rails and tiebacks.
  for(const z of [-2.55,1.45])at([4.99,0,z],[0,-Math.PI/2,0],()=>{
    print([0,2.72,.138],[1.85,3.04],glass);
    // Hollow frame: garden and daylight can actually pass through the opening.
    for(const x of [-1.10,1.10])block([x,2.72,.17],[.085,3.49,.19],ivory,.009);
    for(const y of [1.05,4.4])block([0,y,.17],[2.3,.09,.20],ivory,.01);
    for(const x of [-.97,0,.97])block([x,2.72,.20],[.048,3.18,.048],cream,.006);
    for(const y of [1.10,2.18,3.26,4.35])block([0,y,.20],[1.98,.045,.045],cream,.005);
    block([0,1.00,.24],[2.44,.10,.36],ivory,.015);
    line([[.06,2.05,.25],[.06,2.15,.28],[.06,2.27,.25]],.012,brass,6);
    cylinder([0,4.62,.36],.022,.022,2.8,brass,[0,0,Math.PI/2]);
    for(const side of [-1,1]){
      ball([side*1.47,4.62,.36],[.06,.045,.045],brass);
      const curtain=new PlaneGeometry(.81,4.27,18,34),p=curtain.getAttribute('position');
      for(let i=0;i<p.count;i++){
        const u=p.getX(i)/.81+.5,v=(p.getY(i)+2.135)/4.27;
        const tie=Math.exp(-Math.pow((v-.47)*5.,2));
        p.setXYZ(i,side*1.02+p.getX(i)*(1.-tie*.53)+side*tie*.19,2.35+p.getY(i),.33+Math.sin(u*Math.PI*12.)*.080*(1.-tie*.4));
      }curtain.computeVertexNormals();animated(1,()=>add(curtain,wine));
      // Weighted hem, gathered heading, tasseled tieback and braid.
      for(let i=0;i<7;i++)ring([side*.64+side*i*.095,4.57,.36],.027,.006,brass,[0,Math.PI/2,0],10);
      line([[side*.74,2.2,.42],[side*1.13,2.13,.50],[side*1.35,2.25,.35]],.012,gilding,10);
      cylinder([side*1.24,1.96,.49],.018,.037,.22,gilding);
      for(let j=0;j<6;j++)line([[side*1.24,1.88,.49],[side*1.24+(j-2.5)*.012,1.72,.49]],.003,gilding,3);
    }sceneLabel('curtained sash windows');
  });

  // A deep fireplace, masonry, grate, hearth tools and a smoke-darkened mantel.
  at([.35,0,-4.92],[0,0,0],()=>{
    block([0,.86,.04],[2.42,1.72,.34],marble,.035);
    block([0,.72,.25],[1.72,1.30,.08],black);
    for(let row=0;row<6;row++)for(let j=0;j<6;j++)block([-.69+j*.27+(row%2)*.08,.17+row*.18,.30],[.253,.165,.04],row%2?brown:hearthStone,.009);
    block([0,.12,.72],[2.80,.14,1.22],hearthStone,.027);
    for(const x of [-1.04,1.04]){
      block([x,.89,.49],[.30,1.58,.33],marble,.025);
      for(let j=-2;j<=2;j++)cylinder([x+j*.044,.94,.675],.010,.010,1.08,gilding,[0,0,0],8);
      block([x,1.62,.52],[.43,.15,.43],marble,.02);
      block([x,.20,.52],[.43,.15,.43],marble,.02);
    }
    block([0,1.76,.47],[2.75,.18,.63],marble,.035);
    block([0,1.88,.49],[2.92,.085,.75],darkWood,.023);
    for(let i=0;i<6;i++){
      cylinder([-.52+i*.20,.29,.62],.085,.085,.80,brown,[Math.PI/2,.14*(i%2),-.18+i*.07],10);
      animated(3,()=>turned([-.55+i*.22,.31,.57],[[0,0],[.05,.07],[.085,.20],[.04,.39],[.008,.64]],flame,[.7+(.3*(i%2)),.6+(i%3)*.22,.8],10));
    }
    for(let i=0;i<22;i++){const x=Math.sin(i*12.7)*.64,z=.55+Math.cos(i*4.7)*.21;ball([x,.22,z],[.025,.014,.020],i%3?ember:black,6);}
    for(const x of [-.67,.67]){cylinder([x,.25,.94],.025,.035,.42,iron);ball([x,.48,.94],[.050,.045,.050],brass,8);}
    for(let i=-6;i<=6;i++)cylinder([i*.105,.31,.91],.012,.012,.37,iron);
    line([[-.74,.48,.90],[0,.53,.90],[.74,.48,.90]],.014,iron,10);
    at([1.64,0,.72],[0,0,0],()=>{
      cylinder([0,.10,0],.18,.20,.05,iron);
      for(let i=0;i<3;i++){cylinder([(i-1)*.075,.60,0],.009,.009,.96,iron);ring([(i-1)*.075,1.10,0],.026,.007,brass);}
      block([-.075,.16,0],[.12,.20,.025],iron,.015);
      cylinder([0,.21,0],.025,.045,.17,black);
    });
  });sceneLabel('fireplace, firewood, grate and tools');

  // Oil landscape and carved gilt frame above the mantel.
  frame([.35,3.24,-5.03],[2.14,1.36],0);
  // Mantel clock: real case, dial, hands, visible pendulum and winding key.
  at([.28,1.94,-4.50],[0,0,0],()=>{
    block([0,.31,0],[.62,.59,.22],darkWood,.06);
    block([0,.03,0],[.76,.07,.32],walnut,.017);
    ball([0,.52,0],[.31,.22,.12],darkWood);
    ring([0,.41,.135],.205,.017,brass);
    print([0,.41,.140],[.39,.39],material({color:'#ffffff',kind:5,tile:6,rough:.6}));
    animated(5,()=>block([.015,.472,.151],[.012,.126,.009],iron,.003,[0,0,-.34]));
    animated(6,()=>block([-.061,.39,.158],[.152,.013,.009],iron,.003,[0,0,-.28]));
    ball([0,.41,.169],[.018,.018,.009],brass,8);
    animated(2,()=>{cylinder([0,.14,.14],.006,.006,.18,brass);ball([0,.057,.14],[.052,.052,.012],brass);});
    for(const x of [-.24,.24])ball([x,0,0],[.044,.035,.075],brass);
  });
  function vase(p:V3,scale:V3,flowers=false){at(p,[0,0,0],()=>{
    turned([0,0,0],[[.05,0],[.08,.02],[.14,.14],[.15,.23],[.08,.35],[.065,.46],[.08,.49]],porcelain,scale);
    for(const y of [.035,.44])ring([0,y*scale[1],0],.073*scale[0],.006,brass,[Math.PI/2,0,0],20);
    if(flowers)for(let i=0;i<7;i++){
      const a=i*2.39996,x=Math.cos(a)*.18,z=Math.sin(a)*.14,y=.77+.15*Math.sin(i*1.7);
      line([[0,.28,0],[x*.4,.57,z*.5],[x,y,z]],.005,green,7);
      for(let k=0;k<5;k++){const b=k/5*Math.PI*2;ball([x+Math.cos(b)*.035,y,z+Math.sin(b)*.035],[.039,.017,.027],wine,8);}
      ball([x*.5,.55,z*.5],[.06,.014,.026],green,8);
    }
  });sceneLabel(flowers?'flower arrangements':'porcelain vases');}
  vase([- .71,1.94,-4.43],[.8,.85,.8]);vase([1.38,1.94,-4.45],[.65,.95,.65]);
  frame([-.50,2.13,-4.30],[.23,.30],7,[0,-.16,0]);
  for(const x of [-.95,1.61])at([x,1.93,-4.45],[0,0,0],()=>{
    turned([0,0,0],[[.08,0],[.085,.025],[.03,.08],[.022,.21],[.05,.25]],brass);
    cylinder([0,.37,0],.024,.026,.26,wax);
    line([[.01,.48,0],[.024,.41,.01],[.025,.35,.008]],.006,wax,6);
    animated(3,()=>ball([0,.53,0],[.016,.053,.015],flame,8));
  });

  // Bookcase: individually sized volumes, uneven shelves, stacked folios.
  at([-3.05,0,-4.89],[0,0,0],()=>{
    block([0,1.69,-.20],[2.90,3.38,.34],darkWood,.02);
    for(const x of [-1.45,1.45])block([x,1.75,.13],[.12,3.5,.58],walnut,.018);
    for(const y of [.16,.85,1.56,2.27,3.02,3.48])block([0,y,.13],[2.99,.09,.65],walnut,.013);
    block([0,3.56,.11],[3.15,.10,.76],darkWood,.025);
    for(let shelf=0;shelf<4;shelf++){
      let x=-1.31;
      for(let i=0;i<17;i++){
        const w=.10+((i*7+shelf*3)%5)*.015,h=.39+((i*13+shelf*5)%7)*.034;
        if(x+w>1.3)break;
        at([x+w/2,.235+shelf*.71+h/2,.15+Math.sin(i*7)*.035],[0,0,i===12?.10:0],()=>{
          block([0,0,0],[w,h,.34],books[(i+shelf*2)%8],.006);
          block([0,0,-.01],[w-.025,h-.025,.32],page,.003);
          block([0,0,.177],[w,h,.017],books[(i+shelf*2)%8],.003);
          for(const y of [-h*.36,h*.36])block([0,y,.190],[w*.81,.012,.006],gilding);
          for(let j=0;j<3;j++)block([0,-h*.16+j*.055,.192],[w*.48,.004,.004],goldPaint);
        });x+=w+.012;sceneLabel('individual books');
      }
    }
    for(let i=0;i<3;i++)block([.68,3.62+i*.067,.10],[.63,.058,.43],books[(i+2)%8],.005,[0,i*.05,0]);
    vase([-.95,3.61,.06],[.64,.75,.64]);
  });

  // Persian carpet with actual thickness, border braid and individually frayed ends.
  block([-.20,.037,.25],[4.35,.022,3.46],carpet,.012);
  print([-.20,.050,.25],[4.35,3.46],carpet,[-Math.PI/2,0,0]);
  for(const end of [-1,1])for(let i=0;i<72;i++){
    const x=-2.34+i*.060,z=.25+end*1.74;
    line([[x,.045,z],[x+.009*Math.sin(i*7),.041,z+end*.070],[x+.015*Math.sin(i*13),.037,z+end*(.11+(i%4)*.009)]],.0022,linen,3);
  }sceneLabel('woven rug and hand-frayed fringe');

  // Furniture vocabulary: turned cabriole feet, cushions, piping and brass tacks.
  function leg(p:V3,height:number,m=walnut){at(p,[0,0,0],()=>{
    turned([0,0,0],[[.045,0],[.055,.025],[.033,.08],[.022,height*.5],[.048,height*.77],[.055,height]],m);
    ring([0,height*.79,0],.047,.006,brass,[Math.PI/2,0,0],12);
  });}
  function cushion(p:V3,size:V3,m:number,rotation:V3=[0,0,0]){at(p,rotation,()=>{
    block([0,0,0],size,m,.075);
    const [w,h,d]=size;const coords:V3[]=[];
    for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;coords.push([Math.sign(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),.26)*(w/2-.016),h*.20,Math.sign(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),.26)*(d/2-.016)]);}
    line(coords,.005,piping,32);
  });}
  function sofa(p:V3,rotation:number){at(p,[0,rotation,0],()=>{
    for(const x of [-1.10,1.10])for(const z of [-.40,.40])leg([x,.03,z],.27);
    block([0,.40,0],[2.64,.25,1.08],walnut,.05);
    block([0,.95,-.41],[2.60,1.05,.25],velvet,.10);
    for(let i=0;i<3;i++)cushion([-.82+i*.82,.64,.05],[.79,.25,.91],velvet);
    for(const x of [-1.22,1.22]){
      block([x,.78,.02],[.28,.62,1.16],velvet,.12);
      cylinder([x,1.03,.02],.15,.15,.91,velvet,[Math.PI/2,0,0],14);
      line([[x,.54,.53],[x,.58,.56],[x,.93,.52],[x,1.10,.25],[x,1.1,-.38]],.018,walnut,12);
    }
    for(let i=0;i<12;i++)for(let j=0;j<2;j++){
      const x=-1.08+i*.196,y=.86+j*.28;
      ball([x,y,-.256],[.016,.016,.011],piping,6);
    }
    for(let i=0;i<40;i++)ball([-1.17+i*.06,.48,.551],[.008,.008,.008],brass,6);
    cushion([-.86,.95,-.10],[.49,.14,.47],wine,[.75,.1,.1]);
    cushion([.84,.98,-.12],[.48,.13,.45],linen,[.68,-.1,-.13]);
    // A casually folded throw: bent cloth, hem stitching and loose threads.
    const throwGeo=new PlaneGeometry(.86,1.44,12,18),a=throwGeo.getAttribute('position');
    for(let i=0;i<a.count;i++){let x=a.getX(i),v=a.getY(i)+.72;a.setXYZ(i,.39+x,.72-Math.max(v-.66,0.)*.70+.02*Math.sin(x*22),.48-v*.65);}
    throwGeo.computeVertexNormals();add(throwGeo,linen);
    sceneLabel('carved sofa, tufting, throw and cushions');
  });}
  sofa([-2.74,0,-.52],Math.PI/2);
  function chair(p:V3,rotation:number,m:number){at(p,[0,rotation,0],()=>{
    for(const x of [-.40,.40])for(const z of [-.32,.32])leg([x,.03,z],.30);
    block([0,.40,0],[1.05,.15,.95],walnut,.04);
    cushion([0,.57,.05],[.92,.26,.88],m);
    block([0,1.10,-.35],[1.02,1.19,.22],m,.12);
    for(const x of [-.48,.48]){
      block([x,1.24,-.22],[.18,.84,.49],m,.08,[0,x*.25,0]);
      cylinder([x,.84,.03],.09,.10,.85,m,[Math.PI/2,0,0]);
      line([[x,.44,.43],[x,.63,.46],[x,.85,.37],[x,.84,-.32]],.023,walnut,10);
    }
    for(const x of [-.25,0,.25])for(const y of [.93,1.25,1.49])ball([x,y,-.225],[.013,.013,.008],piping,6);
    sceneLabel('wingback chairs');
  });}
  chair([2.35,0,.55],-.62,wine);chair([-1.75,0,2.78],2.82,velvet);

  // Low tea table, carved apron and curved stretcher.
  at([-.15,0,.02],[0,-.07,0],()=>{
    for(const x of [-.91,.91])for(const z of [-.49,.49]){
      line([[x,.05,z],[x*1.02,.19,z*1.04],[x*.94,.45,z*.94],[x,.72,z]],.040,walnut,10);
      ball([x,.08,z],[.07,.05,.075],walnut,8);
    }
    block([0,.69,0],[2.10,.16,1.28],darkWood,.037);
    block([0,.79,0],[2.28,.09,1.40],walnut,.035);
    for(const z of [-.57,.57])line([[-.93,.65,z],[-.45,.56,z],[0,.63,z],[.45,.56,z],[.93,.65,z]],.022,walnut,18);
    ring([.36,.855,-.02],.40,.018,brass,[Math.PI/2,0,0],40);
    cylinder([.36,.848,-.02],.405,.405,.018,brass,[0,0,0],40);
    function cup(p:V3,angle:number){at(p,[0,angle,0],()=>{
      turned([0,0,0],[[.035,0],[.055,.005],[.068,.024],[.080,.105],[.079,.115]],porcelain,[1,1,1],20);
      cylinder([0,.103,0],.070,.070,.003,tea,[0,0,0],20);
      ring([0,.116,0],.078,.0032,brass,[Math.PI/2,0,0],24);
      ring([.092,.069,0],.036,.009,porcelain,[0,0,0],16);
      cylinder([0,-.009,0],.120,.110,.012,porcelain,[0,0,0],24);
      ring([0,-.002,0],.106,.0035,brass,[Math.PI/2,0,0],24);
      // Tiny rim chip: an intentionally uneven dark fleck.
      ball([.044,.113,.064],[.008,.002,.004],page,6);
    });sceneLabel('tea cups, handles, saucers and rim chips');}
    cup([.20,.874,.17],-.4);cup([.62,.874,-.02],2.1);
    // Teapot, lid knob, curved pouring spout and loop handle.
    turned([.28,.872,-.21],[[.045,0],[.09,.015],[.12,.09],[.11,.17],[.066,.21]],porcelain);
    cylinder([.28,1.086,-.21],.075,.075,.012,porcelain);
    ball([.28,1.107,-.21],[.020,.018,.020],brass,8);
    line([[.39,.93,-.21],[.49,.97,-.21],[.51,1.06,-.21],[.54,1.08,-.21]],.028,porcelain,10);
    line([[.19,1.03,-.21],[.08,1.04,-.21],[.05,.94,-.21],[.18,.91,-.21]],.017,porcelain,12);
    turned([.57,.88,.19],[[.03,0],[.055,.015],[.065,.06],[.047,.11]],porcelain);
    cylinder([.57,.994,.19],.043,.043,.003,milk);
    // Silver teaspoon, sugar cubes, biscuit crumbs, lemon slices.
    line([[.10,.879,.31],[.24,.884,.33],[.31,.884,.34]],.004,brass,7);
    ball([.31,.885,.34],[.026,.005,.016],brass,8);
    for(let i=0;i<4;i++)block([.59+(i%2)*.03,.89+Math.floor(i/2)*.025,-.25],[.026,.025,.026],cream,.003,[0,i*.2,0]);
    cylinder([.83,.846,.36],.155,.14,.012,porcelain,[0,0,0],24);
    const biscuit=material({color:'#a77743',rough:.88});
    for(let i=0;i<3;i++){
      cylinder([.78+(i%2)*.09,.866+(i===2?.014:0),.32+(i===2?.07:0)],.048,.048,.017,biscuit,[0,0,0],18);
      for(let k=0;k<7;k++)ball([.78+(i%2)*.09+Math.sin(k*6.2)*.035,.877+(i===2?.014:0),.32+(i===2?.07:0)+Math.cos(k*7.7)*.035],[.0025,.0015,.0025],brown,5);
    }
    for(let i=0;i<9;i++)ball([.69+Math.sin(i*17)*.14,.843,.42+Math.cos(i*13)*.12],[.002,.001,.002],biscuit,4);
    // Newspaper, half-open correspondence, fountain pen and reading spectacles.
    print([-.60,.843,.22],[.64,.43],paper,[-Math.PI/2,0,.12]);
    block([-.72,.839,-.27],[.40,.008,.28],letter,0,[0,-.24,0]);
    print([-.71,.845,-.25],[.37,.25],letter,[-Math.PI/2,0,-.24]);
    cylinder([-.62,.86,-.31],.008,.008,.22,black,[0,0,1.45],10);
    cylinder([-.51,.86,-.31],.009,.009,.027,brass,[0,0,1.45],8);
    for(const x of [-.75,-.64])ring([x,.852,.50],.045,.0025,brass,[Math.PI/2,0,0],20);
    line([[-.71,.852,.50],[-.695,.858,.49],[-.68,.852,.50]],.0025,brass,4);
    line([[-.80,.852,.50],[-.88,.87,.42],[-.9,.85,.40]],.0025,brass,6);
    // Small closed atlas with a gently lifting loose page.
    block([-.22,.86,-.40],[.43,.045,.30],leather,.004,[0,-.16,0]);
    block([-.22,.867,-.40],[.40,.025,.285],page,.002,[0,-.16,0]);
    animated(4,()=>print([-.20,.890,-.40],[.40,.28],material({color:'#d8c79d',kind:5,tile:13,rough:.9}),[-Math.PI/2,0,-.16]));
  });sceneLabel('tea table with correspondence, atlas and tea service');

  // Chess table at the window: a mid-game position, captured pieces and score book.
  at([2.80,0,-2.14],[0,.16,0],()=>{
    for(const x of [-.35,.35])for(const z of [-.35,.35])leg([x,0,z],.76);
    block([0,.81,0],[1.03,.10,1.03],walnut,.025);
    const board=material({color:'#d3bb89',kind:5,tile:9,rough:.37});
    print([0,.866,0],[.70,.70],board,[-Math.PI/2,0,0]);
    for(const x of [-.375,.375])block([x,.866,0],[.035,.014,.77],darkWood);
    for(const z of [-.375,.375])block([0,.866,z],[.77,.014,.035],darkWood);
    const white=material({color:'#c9b890',rough:.31}),ebony=material({color:'#302721',kind:1,rough:.30});
    const profiles:[number,number][][]=[[[.024,0],[.029,.012],[.018,.032],[.013,.065],[.022,.079],[.018,.105],[0,.12]],
      [[.030,0],[.032,.013],[.017,.035],[.015,.095],[.028,.11],[.028,.13]],
      [[.026,0],[.031,.014],[.016,.05],[.012,.09],[.021,.12],[.007,.155]],
      [[.029,0],[.033,.015],[.017,.05],[.015,.10],[.025,.125],[.012,.16],[0,.18]]];
    const position=[[0,0,1],[1,0,2],[3,0,3],[5,0,2],[7,0,1],[0,1,0],[2,2,0],[3,3,0],[4,1,0],[6,2,0],[7,1,0],
      [0,7,1],[2,7,2],[4,7,3],[6,7,2],[7,7,1],[0,6,0],[1,4,0],[3,5,0],[4,4,0],[5,6,0],[7,5,0]];
    for(const [i,j,kind]of position){turned([(i-3.5)*.081,.875,(j-3.5)*.081],profiles[kind],j<4?white:ebony,[1,1,1],12);sceneLabel('chess pieces');}
    for(let i=0;i<3;i++)turned([.43,.873,-.2+i*.12],profiles[0],i%2?white:ebony,[1,1,1],12);
    block([-.38,.879,.45],[.27,.025,.16],leather,.004,[0,.2,0]);
    print([-.38,.896,.45],[.25,.145],letter,[-Math.PI/2,0,.2]);
  });sceneLabel('chess table and unfinished game');

  // Gramophone, record, winding handle, floral vase and sheet music.
  at([-3.93,0,2.52],[0,.25,0],()=>{
    for(const x of [-.35,.35])for(const z of [-.28,.28])leg([x,0,z],.68);
    block([0,.75,0],[1.08,.13,.84],walnut,.025);
    block([0,.91,0],[.70,.23,.57],darkWood,.026);
    cylinder([0,1.045,0],.24,.24,.027,iron,[0,0,0],40);
    const record=material({color:'#25201a',rough:.20,kind:5,tile:11});
    animated(7,()=>{cylinder([0,1.064,0],.22,.22,.006,black,[0,0,0],40);print([0,1.069,0],[.40,.40],record,[-Math.PI/2,0,0]);});
    line([[.22,1.05,-.12],[.25,1.21,-.18],[.19,1.37,-.2]],.028,brass,10);
    at([.15,1.32,-.18],[0,0,-.64],()=>{
      turned([0,0,0],[[.025,0],[.045,.11],[.085,.24],[.16,.37],[.27,.47],[.35,.52]],brass,[1,1,1],24);
      cylinder([0,.52,0],.31,.31,.008,darkWood,[0,0,0],24);
      ring([0,.525,0],.348,.009,gilding,[Math.PI/2,0,0],32);
    });
    line([[.34,.94,0],[.49,.94,0],[.49,1.02,0],[.56,1.02,0]],.009,brass,6);
    print([0,.827,.31],[.65,.28],material({color:'#d8cba6',kind:5,tile:8,rough:.94}),[-Math.PI/2,0,.15]);
  });sceneLabel('gramophone and printed sheet music');
  at([-4.38,0,-2.05],[0,0,0],()=>{
    for(const x of [-.29,.29])for(const z of [-.24,.24])leg([x,0,z],.79);
    block([0,.86,0],[.85,.07,.73],walnut,.015);
    vase([0,.91,0],[1,1,1],true);
    frame([.26,1.12,-.12],[.21,.26],7,[0,-.22,0]);
  });
  frame([-4.98,2.77,.20],[1.04,1.30],12,[0,Math.PI/2,0]);
  frame([-4.98,2.86,2.02],[.64,.83],7,[0,Math.PI/2,.045]);
  frame([-4.98,2.68,-1.45],[.70,.94],7,[0,Math.PI/2,-.04]);

  // Chandelier, curled arms, drip pans, candle sleeves, chain and glass drops.
  at([.18,0,-.14],[0,0,0],()=>{
    turned([0,3.57,0],[[.03,0],[.13,.09],[.16,.17],[.075,.34],[.04,.61]],brass);
    for(let k=0;k<10;k++)ring([0,4.22+k*.075,0],.038,.006,brass,[0,k%2*Math.PI/2,0],10);
    cylinder([0,4.98,0],.15,.07,.06,brass);
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2;
      at([0,0,0],[0,a,0],()=>{
        line([[0,3.84,0],[.29,3.70,0],[.58,3.74,0],[.69,3.95,0]],.019,brass,18);
        turned([.69,3.93,0],[[.025,0],[.10,.04],[.11,.06],[.03,.085]],brass);
        cylinder([.69,4.09,0],.029,.033,.22,wax);
        ball([.69,4.23,0],[.024,.064,.024],flame,10);
        for(let j=0;j<3;j++){
          const y=3.75-j*.08,x=.31+j*.12;
          ring([x,y,0],.010,.003,brass,[0,0,0],8);
          ball([x,y-.055,0],[.018,.048,.018],glass,8);
        }
      });
    }
  });sceneLabel('six-arm chandelier and glass drops');
  for(const x of [-1.49,2.25])at([x,2.75,-5.05],[0,0,0],()=>{
    ball([0,0,0],[.10,.18,.045],brass);
    line([[0,-.10,0],[0,-.13,.18],[0,.02,.25]],.018,brass,10);
    turned([0,0,.25],[[.02,0],[.065,.02],[.025,.04]],brass);
    cylinder([0,.17,.25],.024,.029,.24,wax);ball([0,.32,.25],[.022,.055,.022],flame,10);
  });

  // Garden beyond the windows: geometry, not a flat room backdrop.
  const grass=material({color:'#596449',kind:12,rough:1});
  block([12,-.06,-.5],[14,.1,26],grass);
  for(let i=0;i<15;i++){
    const x=7.9+(i%4)*1.6,z=-9+Math.floor(i/4)*5.2;
    cylinder([x,1.9,z],.08,.17,3.8,brown,[0,0,0],8);
    for(let j=0;j<4;j++)ball([x+Math.sin(j*7+i)*.55,2.7+j*.55,z+Math.cos(j*8+i)*.4],[.92,.85,.95],green,10);
  }
  // An unobtrusive umbrella and walking stick in a brass stand.
  at([-4.42,0,4.1],[0,.2,0],()=>{
    cylinder([0,.29,0],.14,.13,.55,brass);
    for(let i=0;i<3;i++)line([[(i-1)*.09,.1,0],[(i-1)*.12,1.05,0],[(i-1)*.12+.045,1.20,0],[(i-1)*.12+.11,1.18,0]],.012,i===0?black:darkWood,12);
  });sceneLabel('umbrella stand and walking sticks');

  // Small tabby cat: separate local BVH, absolute-time articulated pose.
  const fur=material({color:'#a57a50',kind:7,rough:.88}),muzzle=material({color:'#c2b295',kind:7,rough:.9});
  const nose=material({color:'#745249',rough:.55}),eye=material({color:'#a68e42',rough:.13});
  animated(100,()=>{
    ball([0,.29,.02],[.19,.20,.36],fur,16);
    ball([0,.33,.25],[.19,.19,.19],fur,12);
  });
  animated(101,()=>{
    ball([0,.47,-.32],[.15,.14,.145],fur,16);
    ball([-.065,.425,-.438],[.070,.048,.046],muzzle,10);
    ball([.065,.425,-.438],[.070,.048,.046],muzzle,10);
    ball([0,.447,-.477],[.025,.015,.015],nose,8);
    for(const side of [-1,1]){
      // Faceted ears are small cones, backed by a darker inner ear.
      cylinder([side*.10,.60,-.31],0,.063,.18,fur,[0,0,-side*.25],4);
      cylinder([side*.10,.602,-.325],0,.040,.12,nose,[0,0,-side*.25],4);
      ball([side*.077,.50,-.429],[.035,.018,.011],eye,10);
      ball([side*.077,.50,-.440],[.008,.017,.004],black,8);
      for(let j=0;j<3;j++)line([[side*.05,.43-j*.009,-.46],[side*.15,.44-j*.012,-.47],[side*.24,.46-j*.016,-.46]],.0011,cream,5);
    }
  });
  for(let i=0;i<4;i++)animated(120+i,()=>{
    const x=i%2===0?-.125:.125,z=i<2?-.23:.23;
    ball([x,.19,z],[.061,.14,.064],fur,10);
    ball([x,.061,z-.025],[.068,.065,.095],muzzle,10);
  });
  animated(110,()=>line([[0,.34,.30],[.05,.33,.47],[.06,.34,.65],[.01,.43,.80]],.047,fur,18));
  sceneLabel('animated tabby cat with paws, whiskers and tail');

  // Build two compact stackless BVHs. Leaf triangles are stored contiguously.
  const nodes:number[]=[],triangles:number[]=[];
  function tree(items:Triangle[]):number{
    const id=nodes.length/12;nodes.push(...new Array(12).fill(0));
    const lo:V3=[Infinity,Infinity,Infinity],hi:V3=[-Infinity,-Infinity,-Infinity];
    for(const t of items)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],t.lo[k]);hi[k]=Math.max(hi[k],t.hi[k]);}
    let first=0,count=0;
    if(items.length<=6){first=triangles.length/28;count=items.length;for(const t of items)triangles.push(...t.values);}
    else{let axis=0;for(let k=1;k<3;k++)if(hi[k]-lo[k]>hi[axis]-lo[axis])axis=k;items.sort((a,b)=>a.center[axis]-b.center[axis]);
      const middle=Math.floor(items.length/2);tree(items.slice(0,middle));tree(items.slice(middle));}
    nodes.splice(id*12,12,...lo,first,...hi,count,nodes.length/12,0,0,0);return id;
  }
  const roomRoot=tree(room),catRoot=tree(cat);
  return {nodes:Float32Array.from(nodes),triangles:Float32Array.from(triangles),materials:Float32Array.from(paints),roomRoot,catRoot,
    summary:{objects:inventory,triangleCount:triangles.length/28,nodeCount:nodes.length/12,materialCount:paints.length/16}};
}

/** Printed and painted details remain ordinary Canvas work inside Servo. */
export const ATLAS_SCRIPT=String.raw`
var painted=false;
window.frameweaveRender=function(){
 if(painted)return;painted=true;
 var canvas=document.getElementById('atlas'),c=canvas.getContext('2d');
 var seed=1896;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
 function tile(id,fn){c.save();c.translate((id%4)*512,Math.floor(id/4)*512);c.beginPath();c.rect(0,0,512,512);c.clip();fn();c.restore();}
 function ellipse(x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
 function line(points,color,width){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(points[0][0],points[0][1]);for(var i=1;i<points.length;i++)c.lineTo(points[i][0],points[i][1]);c.stroke();}
 c.fillStyle='#b4a17d';c.fillRect(0,0,2048,2048);
 // 0: brush-built landscape. The house has chimneys, sash windows and ivy.
 tile(0,function(){
   var sky=c.createLinearGradient(0,0,0,512);sky.addColorStop(0,'#9baba3');sky.addColorStop(.55,'#d0bea0');sky.addColorStop(1,'#514d36');c.fillStyle=sky;c.fillRect(0,0,512,512);
   for(var i=0;i<160;i++){var x=random()*512,y=20+random()*180;c.globalAlpha=.04+random()*.07;ellipse(x,y,20+random()*60,2+random()*9,'#e1d4b5');}c.globalAlpha=1;
   c.fillStyle='#707c6d';c.beginPath();c.moveTo(0,310);for(var x=0;x<=512;x+=8)c.lineTo(x,230+22*Math.sin(x*.014)+12*Math.sin(x*.037));c.lineTo(512,512);c.lineTo(0,512);c.fill();
   c.fillStyle='#525e4d';c.beginPath();c.moveTo(0,360);for(var x=0;x<=512;x+=10)c.lineTo(x,297+30*Math.sin(x*.011+.4));c.lineTo(512,512);c.lineTo(0,512);c.fill();
   c.fillStyle='#b4aa90';c.fillRect(258,241,149,95);c.fillStyle='#685f4f';c.beginPath();c.moveTo(244,245);c.lineTo(330,190);c.lineTo(422,245);c.fill();
   c.fillStyle='#8d8069';c.fillRect(278,196,13,40);c.fillRect(376,198,13,39);c.fillStyle='#b8b29d';c.fillRect(253,275,162,5);
   for(var y=0;y<2;y++)for(var x=0;x<6;x++){var px=267+x*24,py=254+y*37;c.fillStyle='#414a43';c.fillRect(px,py,11,21);line([[px+5.5,py],[px+5.5,py+21]],'#b8b29d',1);line([[px,py+10],[px+11,py+10]],'#b8b29d',1);}
   c.fillStyle='#4a4637';c.fillRect(325,298,20,38);c.fillStyle='#beb395';c.fillRect(321,296,28,4);
   for(var i=0;i<350;i++){var x=70+random()*90,y=100+random()*240;ellipse(x,y,random()*14+3,random()*8+2,['#3f4b38','#505a3d','#64704a','#7d7950'][i%4]);}
   line([[109,356],[122,216],[136,163]],'#534934',10);line([[119,280],[77,220]],'#534934',5);
   c.fillStyle='#a49c78';c.beginPath();c.moveTo(340,336);c.bezierCurveTo(210,360,380,435,180,512);c.lineTo(311,512);c.bezierCurveTo(427,425,270,364,349,336);c.fill();
   for(var i=0;i<1200;i++){var x=random()*512,y=327+random()*190;c.globalAlpha=.10+random()*.16;c.fillStyle=['#b6a474','#3d4a34','#6e7348','#968450'][i%4];c.fillRect(x,y,1+random()*10,1+random()*3);}c.globalAlpha=1;
   c.fillStyle='#ada185';c.font='italic 10px Georgia';c.fillText('The south lawn — E. W.',342,485);
 });
 // 1: knotted carpet, nested borders, diamonds, palmettes and worn pile.
 tile(1,function(){
   c.fillStyle='#4b3730';c.fillRect(0,0,512,512);c.strokeStyle='#b29b6e';
   [12,20,38,49,67].forEach(function(n,i){c.lineWidth=i%2?3:7;c.strokeRect(n,n,512-n*2,512-n*2);});
   c.fillStyle='#713f33';c.fillRect(72,72,368,368);
   for(var y=85;y<440;y+=36)for(var x=86;x<440;x+=36){var dx=x+((y/36|0)%2)*18;c.save();c.translate(dx,y);c.rotate(Math.PI/4);c.fillStyle='#b49b67';c.fillRect(-5,-5,10,10);c.fillStyle='#5a6660';c.fillRect(-2,-2,4,4);c.restore();}
   for(var r=150;r>24;r-=27){c.save();c.translate(256,256);c.rotate(Math.PI/4);c.fillStyle=(r/27|0)%2?'#425251':'#b29d75';c.fillRect(-r*.58,-r*.58,r*1.16,r*1.16);c.restore();}
   for(var i=0;i<44;i++){var q=13+i*11;ellipse(q,30,3,7,'#a48b60');ellipse(q,482,3,7,'#a48b60');ellipse(30,q,7,3,'#a48b60');ellipse(482,q,7,3,'#a48b60');}
   for(var i=0;i<22000;i++){c.fillStyle=i%3?'rgba(220,193,142,.055)':'rgba(25,24,21,.10)';c.fillRect(random()*512,random()*512,1,1+random()*3);}
   var worn=c.createRadialGradient(275,240,15,275,240,230);worn.addColorStop(0,'rgba(196,177,140,.20)');worn.addColorStop(1,'rgba(196,177,140,0)');c.fillStyle=worn;c.fillRect(0,0,512,512);
 });
 // 2: restrained, irregular damask wallpaper.
 tile(2,function(){
   c.fillStyle='#b0b39d';c.fillRect(0,0,512,512);
   for(var row=-1;row<5;row++)for(var col=-1;col<5;col++){
     var x=col*128+(row%2)*64,y=row*128;c.save();c.translate(x,y);c.strokeStyle='rgba(72,86,63,.34)';c.lineWidth=2;
     for(var side=-1;side<=1;side+=2){c.beginPath();c.moveTo(0,52);c.bezierCurveTo(side*53,20,side*35,-10,side*9,-20);c.bezierCurveTo(side*39,-25,side*24,-52,0,-61);c.stroke();c.beginPath();c.moveTo(0,47);c.bezierCurveTo(side*12,12,side*3,-8,0,-44);c.stroke();ellipse(side*19,5,7,16,'rgba(88,101,72,.26)');}c.restore();
   }
   for(var i=0;i<4000;i++){c.fillStyle='rgba(57,54,39,.035)';c.fillRect(random()*512,random()*512,1,2);}
 });
 // 3: eight separate, gilt-lettered book spines.
 tile(3,function(){
   var titles=['BOTANY','POEMS','TRAVELS','LETTERS','ATLAS','NATURAL HISTORY','ESSAYS','THE GARDEN'];
   var colors=['#713e32','#3f5550','#716142','#354659','#795344','#4b4e35','#6a3f47','#52614d'];
   for(var i=0;i<8;i++){var x=i%4*128,y=(i/4|0)*256;c.fillStyle=colors[i];c.fillRect(x,y,128,256);c.strokeStyle='#bea16b';c.lineWidth=2;c.strokeRect(x+10,y+14,108,228);line([[x+10,y+53],[x+118,y+53]],'#bea16b',2);line([[x+10,y+208],[x+118,y+208]],'#bea16b',2);c.save();c.translate(x+64,y+128);c.rotate(-Math.PI/2);c.fillStyle='#cdb883';c.textAlign='center';c.font=(i===5?'12':'17')+'px Georgia';c.fillText(titles[i],0,4);c.restore();c.font='13px Georgia';c.fillStyle='#cdb883';c.textAlign='center';c.fillText('VOL. '+(i+1),x+64,y+235);}
 });
 // 4: folded newspaper, real columns and an illustrated engraving.
 tile(4,function(){
   c.fillStyle='#d4c49e';c.fillRect(0,0,512,512);c.fillStyle='#3e3b31';c.textAlign='center';c.font='bold 29px Georgia';c.fillText('THE COUNTRY GAZETTE',256,43);c.font='11px Georgia';c.fillText('SATURDAY, OCTOBER 17, 1896     •     TWO PENCE',256,67);line([[18,78],[494,78]],'#5d5340',2);c.font='bold 17px Georgia';c.fillText('AN AFTERNOON AT THE ESTATE',256,105);
   var words=['A letter arrived at the house shortly after noon.','The garden was quiet beneath a pale autumn sky.','In the drawing room the fire had been made up.','No one had yet put away the books or the tea.'];
   c.textAlign='left';for(var col=0;col<3;col++)for(var row=0;row<34;row++){var x=20+col*162,y=128+row*10;c.fillStyle='#6c604b';c.font='7px Georgia';c.fillText(words[(row+col)%4],x,y,150);}
   line([[256,0],[255,512]],'rgba(95,72,40,.15)',4);line([[0,258],[512,256]],'rgba(95,72,40,.10)',3);
 });
 // 5: personal correspondence, stamp, seal mark and slanting handwriting.
 tile(5,function(){
   c.fillStyle='#dfd1ae';c.fillRect(0,0,512,512);c.fillStyle='#4d4941';c.font='italic 25px Georgia';c.textAlign='left';c.fillText('My dearest Eleanor,',34,71);
   var text=['The light has returned to the south windows,','and the house is at last beginning to feel warm.','I have left your book beside the tea tray.','The roses will not last another week, I fear,','but the old clock continues, quite unconcerned.','Come before the garden forgets the summer.','','Yours, always,','Edward'];
   c.font='italic 18px Georgia';text.forEach(function(s,i){c.fillText(s,36,124+i*33,437);});
   c.strokeStyle='rgba(119,93,57,.18)';c.lineWidth=2;c.beginPath();c.arc(365,423,42,0,Math.PI*2);c.stroke();c.fillStyle='#80554a';c.fillRect(438,27,46,58);c.strokeStyle='#c4b094';c.strokeRect(443,32,36,48);c.fillStyle='#b8a18b';c.font='24px Georgia';c.fillText('1',453,66);
 });
 // 6: twelve-hour clock dial, individually placed minute ticks.
 tile(6,function(){
   c.fillStyle='#cfc09c';c.fillRect(0,0,512,512);ellipse(256,256,244,244,'#d8caab');c.strokeStyle='#514a39';c.lineWidth=4;c.beginPath();c.arc(256,256,233,0,Math.PI*2);c.stroke();
   var roman=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
   for(var i=0;i<60;i++){var a=i/60*Math.PI*2-Math.PI/2;line([[256+Math.cos(a)*214,256+Math.sin(a)*214],[256+Math.cos(a)*(i%5?204:195),256+Math.sin(a)*(i%5?204:195)]],'#4e493b',i%5?2:4);}
   c.fillStyle='#3e3c32';c.font='34px Georgia';c.textAlign='center';c.textBaseline='middle';for(var i=0;i<12;i++){var a=i/12*Math.PI*2-Math.PI/2;c.fillText(roman[i],256+Math.cos(a)*169,256+Math.sin(a)*169);}
   c.font='13px Georgia';c.fillText('WESTMERE',256,204);c.font='10px Georgia';c.fillText('LONDON',256,222);c.textBaseline='alphabetic';
 });
 // 7: three different sepia miniatures, individually framed by the scene.
 tile(7,function(){
   for(var j=0;j<3;j++){c.save();c.translate(j*512/3,0);var w=512/3;c.fillStyle=['#76634c','#5f594e','#89745a'][j];c.fillRect(0,0,w,512);ellipse(w/2,246,w*.46,181,'#a28c6b');
     c.fillStyle=j===1?'#3d3c35':'#4b4539';c.beginPath();c.moveTo(5,490);c.bezierCurveTo(4,367,33,325,65,304);c.lineTo(104,304);c.bezierCurveTo(140,327,163,383,168,490);c.fill();
     ellipse(w/2,241,39,67,'#b49a77');ellipse(w/2-3,218,42,52,j===1?'#4b4438':'#62513e');ellipse(w/2+4,252,33,49,'#b49a77');
     line([[w/2-23,249],[w/2-8,247]],'#655340',2);line([[w/2+8,248],[w/2+22,250]],'#655340',2);line([[w/2,252],[w/2-2,271],[w/2+8,272]],'#8b7053',2);line([[w/2-7,287],[w/2+12,288]],'#795b46',2);
     c.fillStyle='#c1b497';c.beginPath();c.moveTo(w/2-23,311);c.lineTo(w/2,340);c.lineTo(w/2+24,311);c.lineTo(w/2+11,352);c.lineTo(w/2-14,352);c.fill();c.restore();
   }
 });
 // 8: hand-set sheet music, staves, notes, title and small performance marks.
 tile(8,function(){c.fillStyle='#d0bf98';c.fillRect(0,0,512,512);c.fillStyle='#443d30';c.textAlign='center';c.font='italic 28px Georgia';c.fillText('Nocturne',256,44);c.font='13px Georgia';c.fillText('Andante, con espressione',256,69);
   for(var row=0;row<6;row++){var y=105+row*65;for(var k=0;k<5;k++)line([[30,y+k*5],[482,y+k*5]],'#6a5c44',.8);for(var i=0;i<18;i++){var x=49+i*23,ny=y+(i*7+row*3)%7*3;ellipse(x,ny,4,2.7,'#433d31');line([[x+3,ny],[x+3,ny-22]],'#433d31',1);if(i%4===0)line([[x-8,y],[x-8,y+20]],'#6a5c44',1);}}});
 // 9: inlaid chessboard, coordinate labels and worn corner varnish.
 tile(9,function(){c.fillStyle='#8c673e';c.fillRect(0,0,512,512);for(var y=0;y<8;y++)for(var x=0;x<8;x++){c.fillStyle=(x+y)%2?'#524337':'#c4b28b';c.fillRect(16+x*60,16+y*60,60,60);}c.font='10px Georgia';c.fillStyle='#e0cca1';c.textAlign='center';for(var i=0;i<8;i++){c.fillText('abcdefgh'[i],46+i*60,509);c.fillText(String(8-i),8,51+i*60);}});
 // 10: subdued floral weave for the cushion fabric.
 tile(10,function(){c.fillStyle='#c3c0a6';c.fillRect(0,0,512,512);for(var y=0;y<560;y+=80)for(var x=0;x<560;x+=80){var px=x+(y/80%2)*40;line([[px,y-22],[px-4,y+20],[px+12,y+42]],'#899777',2);ellipse(px-10,y+8,13,5,'#8a9674');ellipse(px+9,y+23,11,5,'#8a9674');for(var k=0;k<5;k++)ellipse(px+Math.cos(k*1.256)*10,y-19+Math.sin(k*1.256)*10,9,6,'#ac897e');ellipse(px,y-19,5,5,'#b9a46b');}for(var i=0;i<512;i+=2){line([[i,0],[i,512]],'rgba(80,69,49,.04)',.5);line([[0,i],[512,i]],'rgba(255,255,240,.07)',.5);}});
 // 11: shellac record with narrow grooves and an aged paper label.
 tile(11,function(){c.fillStyle='#161816';c.fillRect(0,0,512,512);for(var r=80;r<250;r+=1.8){c.strokeStyle=r%4<2?'#353732':'#20221f';c.lineWidth=.5;c.beginPath();c.arc(256,256,r,0,Math.PI*2);c.stroke();}ellipse(256,256,77,77,'#7f5a38');c.fillStyle='#cbb68e';c.textAlign='center';c.font='18px Georgia';c.fillText('THE NIGHTINGALE',256,237);c.font='11px Georgia';c.fillText('A SALON RECORDING',256,260);c.fillText('NO. 4216  •  SIDE A',256,285);ellipse(256,256,4,4,'#161816');});
 // 12: botanical study, leaf veins, stems, root hairs and caption.
 tile(12,function(){c.fillStyle='#d4c5a1';c.fillRect(0,0,512,512);line([[246,450],[265,317],[236,182],[260,66]],'#63724d',5);for(var i=0;i<9;i++){var y=112+i*36,side=i%2?1:-1,x=250+side*55;c.save();c.translate(x,y);c.rotate(side*.48);ellipse(0,0,43,16,'#6f8151');line([[-39,0],[39,0]],'#a8b486',1);for(var k=-3;k<=3;k++)line([[k*9,0],[k*9+10,-12]],'#a8b486',.6);c.restore();line([[250,y+13],[x,y]],'#63724d',2);}c.fillStyle='#554e39';c.font='italic 19px Georgia';c.textAlign='center';c.fillText('Laurus nobilis',256,478);c.font='10px Georgia';c.fillText('PLATE XXVII — THE ESTATE HERBARIUM',256,496);});
 // 13: an old estate atlas: contour-like paths, river, parcels and labels.
 tile(13,function(){c.fillStyle='#c8b58c';c.fillRect(0,0,512,512);for(var i=0;i<15;i++){var y=30+i*32;line([[10,y],[120,y+15*Math.sin(i)],[260,y-19],[400,y+13],[500,y-11]],'#8c8864',1);}line([[40,0],[130,150],[95,270],[280,370],[340,512]],'#708f8a',9);for(var i=0;i<18;i++){var x=35+random()*430,y=30+random()*430;c.strokeStyle='#a19068';c.strokeRect(x,y,30+random()*65,23+random()*42);}c.fillStyle='#5f5943';c.font='italic 13px Georgia';c.textAlign='center';c.fillText('WESTMERE ESTATE',314,110);c.font='11px Georgia';c.fillText('South Lawn',267,271);c.fillText('Old Orchard',364,405);c.strokeStyle='#615b45';c.lineWidth=2;c.strokeRect(13,13,486,486);});
 // A fine, bounded paper/canvas tooth across the atlas, fixed random seed.
 for(var i=0;i<42000;i++){c.fillStyle=i%2?'rgba(44,35,21,.025)':'rgba(255,243,211,.035)';c.fillRect(random()*2048,random()*2048,1,1);}
};`;

/** A shot-local triangle query/shading program, using public typed GPU fields.
 * The BVHs and geometry are immutable. Animated poses are functions of time.
 * This is direct lighting with artistic bounce/reflection approximations, not
 * an unbiased path tracer. No claim of fully photoreal GI is made.
 */
export const ROOM_SHADER=String.raw`
const PI:f32=3.14159265359;
const TAU:f32=6.28318530718;
const NONE:u32=0xffffffffu;
fn hash(p:vec3f)->f32{var q=fract(p*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
fn noise(p:vec3f)->f32{let i=floor(p);let f=fract(p);let u=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3f(1,0,0)),u.x),mix(hash(i+vec3f(0,1,0)),hash(i+vec3f(1,1,0)),u.x),u.y),
 mix(mix(hash(i+vec3f(0,0,1)),hash(i+vec3f(1,0,1)),u.x),mix(hash(i+vec3f(0,1,1)),hash(i+vec3f(1)),u.x),u.y),u.z);}
fn rx(p:vec3f,a:f32)->vec3f{return vec3f(p.x,cos(a)*p.y-sin(a)*p.z,sin(a)*p.y+cos(a)*p.z);}
fn ry(p:vec3f,a:f32)->vec3f{return vec3f(cos(a)*p.x+sin(a)*p.z,p.y,-sin(a)*p.x+cos(a)*p.z);}
fn rz(p:vec3f,a:f32)->vec3f{return vec3f(cos(a)*p.x-sin(a)*p.y,sin(a)*p.x+cos(a)*p.y,p.z);}
fn ease(a:f32,b:f32,t:f32)->f32{return smoothstep(a,b,t);}
fn catPose(t:f32)->vec4f{
 let jump=ease(7.,8.7,t);let walk=ease(8.7,16.,t);
 let start=vec3f(-2.58,.77,-.52);let landed=vec3f(-2.05,0.,-1.10);let end=vec3f(-.70,0.,-3.27);
 let p=mix(mix(start,landed,jump),end,walk)+vec3f(0.,sin(jump*PI)*.28,0.);
 return vec4f(p,mix(-.8,-.52,ease(5.,9.,t))+.70*ease(16.,19.,t));
}
fn deform(p:vec3f,tag:u32,t:f32)->vec3f{
 var q=p;
 if(tag==1u){let w=pow(clamp((4.65-p.y)/4.5,0.,1.),1.4);q.x+=sin(t*.79+p.z*2.7+p.y*1.8)*.046*w;q.z+=sin(t*.63+p.y*2.3)*.025*w;}
 if(tag==2u){let pivot=vec3f(.28,2.19,-4.36);q=rz(p-pivot,sin(t*4.1)*.19)+pivot;}
 if(tag==3u){q.y+=sin(p.x*31.+t*6.)*.04;q.x+=sin(p.y*18.+t*5.3)*.015;}
 if(tag==4u){let pivot=vec3f(-.55,.89,-.38);q=rz(p-pivot,.12*ease(9.,11.,t)*(1.-ease(12.,14.,t))+.012*sin(t*1.9))+pivot;}
 if(tag==5u||tag==6u){let pivot=vec3f(.28,2.35,-4.34);q=rz(p-pivot,-t*select(.0001454441,.0017453293,tag==6u))+pivot;}
 if(tag==7u){let pivot=vec3f(-3.93,1.067,2.52);q=ry(p-pivot,t*.18)+pivot;}
 if(tag>=100u){
   let awake=ease(4.8,6.7,t)*(1.-ease(18.5,22.,t));let gait=ease(8.7,9.3,t)*(1.-ease(15.4,16.1,t));
   if(tag==101u){let pivot=vec3f(0.,.43,-.31);q=ry(q-pivot,sin(t*.9)*.18*awake)+pivot;}
   if(tag==110u){q.x+=sin((q.z-.3)*4.7+t*1.6)*max(q.z-.30,0.)*.24*(.15+awake*.85);q.y+=sin(t*1.2)*.03*awake;}
   if(tag>=120u&&tag<=123u){let phase=select(PI,0.,tag==120u||tag==123u);let stride=sin(t*6.3+phase)*gait;
     q.z+=(.32-q.y)*stride*.72;q.y+=max(stride,0.)*.065*(1.-clamp(q.y/.36,0.,1.));}
   q.y=q.y*mix(.63,1.,awake)+sin(t*12.6)*.012*gait;
 }
 return q;
}
fn normalPose(n:vec3f,tag:u32,t:f32)->vec3f{
 if(tag==2u){return rz(n,sin(t*4.1)*.19);}
 if(tag==4u){return rz(n,.12*ease(9.,11.,t)*(1.-ease(12.,14.,t))+.012*sin(t*1.9));}
 if(tag==5u||tag==6u){return rz(n,-t*select(.0001454441,.0017453293,tag==6u));}
 if(tag==7u){return ry(n,t*.18);}
 if(tag==101u){return ry(n,sin(t*.9)*.18*ease(4.8,6.7,t)*(1.-ease(18.5,22.,t)));}
 return n;
}
fn vdata(i:u32)->vec3f{return vec3f(data1(i),data1(i+1u),data1(i+2u));}
struct Hit{distance:f32,triangle:u32,u:f32,v:f32,space:u32}
fn query(ro:vec3f,rd:vec3f,root:u32,limit:f32,occluder:bool,t:f32)->Hit{
 var best=Hit(limit,NONE,0.,0.,0u);var node=root;let stop=u32(data0(root*12u+8u));
 let safe=select(vec3f(.0000001),rd,abs(rd)>vec3f(.0000001));let inv=1./safe;
 loop{
   if(node>=stop){break;}let off=node*12u;
   let lo=vec3f(data0(off),data0(off+1u),data0(off+2u));let hi=vec3f(data0(off+4u),data0(off+5u),data0(off+6u));
   let a=(lo-ro)*inv;let b=(hi-ro)*inv;let near=min(a,b);let far=max(a,b);
   if(max(max(near.x,near.y),max(near.z,.0002))>min(min(far.x,far.y),min(far.z,best.distance))){node=u32(data0(off+8u));continue;}
   let count=u32(data0(off+7u));let first=u32(data0(off+3u));
   for(var j=0u;j<count;j++){
     let index=first+j;let at=index*28u;let mid=u32(data1(at+3u));
     if(occluder&&data2(mid*16u+5u)==9.){continue;}
     let tag=u32(data1(at+7u));let p=vdata(at);
     let p0=deform(p,tag,t);let p1=deform(p+vdata(at+4u),tag,t);let p2=deform(p+vdata(at+8u),tag,t);
     let e1=p1-p0;let e2=p2-p0;let pv=cross(rd,e2);let det=dot(e1,pv);
     if(abs(det)<.00000005){continue;}let tv=ro-p0;let u=dot(tv,pv)/det;
     if(u<0.||u>1.){continue;}let qv=cross(tv,e1);let v=dot(rd,qv)/det;
     if(v<0.||u+v>1.){continue;}let distance=dot(e2,qv)/det;
     if(distance>.0015&&distance<best.distance){best=Hit(distance,index,u,v,0u);if(occluder){return best;}}
   }
   node++;
 }return best;
}
fn closest(ro:vec3f,rd:vec3f,limit:f32,occluder:bool,t:f32)->Hit{
 var hit=query(ro,rd,u32(paramF32(3u)),limit,occluder,t);
 if(occluder&&hit.triangle!=NONE){return hit;}
 let pose=catPose(t);let local=ry(ro-pose.xyz,-pose.w);let direction=ry(rd,-pose.w);
 var animal=query(local,direction,u32(paramF32(4u)),hit.distance,occluder,t);animal.space=1u;
 if(animal.triangle!=NONE){hit=animal;}return hit;
}
fn visibility(p:vec3f,l:vec3f,t:f32)->f32{
 let d=l-p;let far=length(d);let hit=closest(p,d/far,far-.006,true,t);return select(.065,1.,hit.triangle==NONE);
}
struct Paint{base:vec3f,rough:f32,metal:f32,glow:f32,kind:u32}
fn surface(p:vec3f,n:vec3f,uv:vec2f,id:u32,t:f32)->Paint{
 let a=id*16u;var base=vec3f(data2(a),data2(a+1u),data2(a+2u));var rough=data2(a+3u);var metal=data2(a+4u);
 let kind=u32(data2(a+5u));let tile=data2(a+6u);var glow=data2(a+7u);let wear=data2(a+10u);let seed=data2(a+11u);
 let fine=noise(p*170.+seed);let age=noise(p*5.+seed*7.);
 if(tile>=0.){
   let scale=vec2f(data2(a+8u),data2(a+9u));let rect=vec4f(data2(a+12u),data2(a+13u),data2(a+14u),data2(a+15u));
   let q=fract(clamp(uv,vec2f(.00001),vec2f(.99999))*scale);
   let texture=sampleUv0(rect.xy+vec2f(q.x,1.-q.y)*rect.zw,true).rgb;
   if(kind==5u||kind==13u){base=texture*mix(vec3f(1.),base,.15);}else{base*=texture*1.35+.20;}
 }
 if(kind==1u){
   let warp=noise(p*vec3f(2.,1.,.6)+seed)*9.;let rings=sin(p.x*74.+p.z*2.+warp);
   base*=.76+.13*rings+.23*noise(p*vec3f(48.,3.,.7)+seed);
   let scratch=pow(abs(sin(p.x*419.+p.z*5.7+seed)),75.)*smoothstep(.62,.83,noise(p*vec3f(2.,20.,.6)));
   base=mix(base,base*1.8,scratch*.18*wear);rough+=age*.08;
 }
 if(kind==2u){let weave=.5+.5*sin(uv.x*960.)*sin(uv.y*960.);base*=.90+weave*.14;rough=clamp(rough+fine*.04,0.,1.);}
 if(kind==3u){let patina=smoothstep(.40,.72,age)*wear*.64;base=mix(base,vec3f(.021,.065,.050),patina);metal*=1.-patina*.7;rough+=patina*.35;}
 if(kind==4u){let vein=pow(.5+.5*sin(p.x*11.+p.z*7.+noise(p*3.)*8.),19.);base=mix(base,vec3f(.32,.28,.22),vein*.26);base*=.86+fine*.19;}
 if(kind==6u){let border=pow(.5+.5*sin(uv.y*TAU*10.),13.);base=mix(base,vec3f(.025,.07,.13),border*.54*step(.80,uv.x));rough+=fine*.025;}
 if(kind==7u){let stripe=pow(.5+.5*sin(uv.x*53.+sin(uv.y*18.)*2.4),8.);base*=.69+.23*fine;base=mix(base,base*.32,stripe*.62);}
 if(kind==10u){let layers=pow(.5+.5*sin(uv.y*1480.),10.);base*=.85+layers*.13+age*.08;}
 if(kind==11u){let pulse=.80+.20*sin(t*7.2+p.x*33.)*sin(t*5.3+p.z*25.);base=mix(vec3f(1.,.16,.016),vec3f(1.,.77,.25),clamp(uv.y,0.,1.));glow*=pulse;}
 if(kind==12u){base*=.6+age*.55;}
 return Paint(max(base,vec3f(.0001)),clamp(rough,.08,.98),metal,glow,kind);
}
fn environment(d:vec3f,rough:f32)->vec3f{
 var c=mix(vec3f(.045,.046,.033),vec3f(.33,.43,.53),smoothstep(-.1,.9,d.y));
 let window=normalize(vec3f(.9,.35,-.1));c+=vec3f(.60,.76,.96)*pow(max(dot(d,window),0.),mix(70.,3.,rough));
 return c;
}
fn brdf(n:vec3f,v:vec3f,l:vec3f,m:Paint)->vec3f{
 let h=normalize(v+l);let nl=max(dot(n,l),0.);let nv=max(dot(n,v),.001);let nh=max(dot(n,h),0.);let vh=max(dot(v,h),0.);
 let alpha=m.rough*m.rough;let a2=alpha*alpha;let den=nh*nh*(a2-1.)+1.;let D=a2/max(PI*den*den,.00001);
 let k=(m.rough+1.)*(m.rough+1.)*.125;let G=nv/(nv*(1.-k)+k)*nl/max(nl*(1.-k)+k,.001);
 let f0=mix(vec3f(.04),m.base,m.metal);let F=f0+(1.-f0)*pow(1.-vh,5.);
 return (m.base*(1.-m.metal)*(1.-F)/PI+D*G*F/max(4.*nv*nl,.001))*nl;
}
fn shade(ro:vec3f,rd:vec3f,hit:Hit,t:f32,jitter:vec2f)->vec3f{
 if(hit.triangle==NONE){return environment(rd,.7)*.75;}
 let at=hit.triangle*28u;let tag=u32(data1(at+7u));let w=1.-hit.u-hit.v;
 var n=normalize(normalPose(vdata(at+12u)*w+vdata(at+16u)*hit.u+vdata(at+20u)*hit.v,tag,t));
 if(hit.space==1u){n=ry(n,catPose(t).w);}if(dot(n,rd)>0.){n=-n;}
 let uv=vec2f(data1(at+15u),data1(at+19u))*w+vec2f(data1(at+23u),data1(at+24u))*hit.u+vec2f(data1(at+25u),data1(at+26u))*hit.v;
 let p=ro+rd*hit.distance;let m=surface(p,n,uv,u32(data1(at+3u)),t);let v=-rd;
 if(m.glow>0.){return m.base*m.glow;}
 let start=p+n*.004;
 // A large right-hand window, sun, chandelier and the hearth are distinct lights.
 let window=vec3f(5.25,2.85+(jitter.y-.5)*1.7,-2.55+(jitter.x-.5)*1.3);
 let wd=window-p;let wl=normalize(wd);let windowRadiance=vec3f(4.2,4.9,5.6)*paramF32(6u)/(1.+dot(wd,wd)*.095);
 var color=brdf(n,v,wl,m)*windowRadiance*visibility(start,window,t);
 let sunlight=p+normalize(vec3f(.84,.46,.19))*35.;
 color+=brdf(n,v,normalize(sunlight-p),m)*vec3f(3.6,2.90,1.94)*paramF32(6u)*visibility(start,sunlight,t);
 let chandelier=vec3f(.18,4.05,-.14);let cd=chandelier-p;
 color+=brdf(n,v,normalize(cd),m)*vec3f(2.5,1.63,.83)/(1.+dot(cd,cd)*.20)*visibility(start,chandelier,t);
 let fire=vec3f(.35,.68,-4.23);let fd=fire-p;let flicker=.92+.08*sin(t*7.3)*sin(t*11.1);
 color+=brdf(n,v,normalize(fd),m)*vec3f(5.1,1.45,.27)*flicker*paramF32(5u)/(1.+dot(fd,fd)*1.1)*visibility(start,fire,t);
 // Soft room bounce is an explicit approximation, not a full GI solution.
 let hemi=.45+.35*max(n.y,0.)+.18*max(n.x,0.);
 color+=m.base*(1.-m.metal)*vec3f(.22,.225,.195)*hemi;
 let F=mix(vec3f(.04),m.base,m.metal);color+=environment(reflect(rd,n),m.rough)*F*(.40+.35*(1.-m.rough));
 if(m.kind==2u||m.kind==7u){color+=m.base*pow(1.-max(dot(n,v),0.),3.)*.19;}
 // One cheap, actual reflected scene query for the polished metal details.
 if(m.metal>.65&&m.rough<.34){
   let reflected=reflect(rd,n);let other=closest(start,reflected,14.,false,t);
   if(other.triangle!=NONE){let offset=other.triangle*28u;let mi=u32(data1(offset+3u))*16u;let base=vec3f(data2(mi),data2(mi+1u),data2(mi+2u));color+=base*F*.16;}
 }
 return max(color,vec3f(0.));
}
fn atmosphere(ro:vec3f,rd:vec3f,far:f32,t:f32)->vec3f{
 var fog=vec3f(0.);
 // Steam is a sum of world-space Gaussian wisps, occluded by the first surface.
 for(var cup=0;cup<2;cup++){for(var k=0;k<9;k++){
   let h=f32(k)*.044;let center=vec3f(.05+f32(cup)*.42+sin(t*.8+h*13.)*.022,1.02+h,.19-f32(cup)*.19+cos(t*.7+h*10.)*.018);
   let distance=dot(center-ro,rd);let radius=.018+h*.08;let delta=ro+rd*distance-center;
   if(distance>0.&&distance<far){fog+=vec3f(.47,.48,.43)*exp(-dot(delta,delta)/(radius*radius))*.027*(1.-h*2.0);}
 }}
 // Faint particulate shafts from the windows, integrated only in the room.
 for(var i=0;i<10;i++){
   let distance=min(far,16.)*(f32(i)+.5)/10.;let p=ro+rd*distance;
   if(p.x<5.&&p.x> -4.8&&p.y>.1&&p.y<4.7&&p.z<5.&&p.z> -5.){
     let height=p.y+(5.-p.x)*.55;let z=p.z+(5.-p.x)*.23;
     let pane=max(1.-smoothstep(.70,.97,abs(z+2.55)),1.-smoothstep(.70,.97,abs(z-1.45)));
     let beam=pane*smoothstep(1.12,1.35,height)*(1.-smoothstep(4.1,4.4,height));
     fog+=vec3f(.055,.049,.034)*beam*.024*min(far,16.)/10.*paramF32(6u);
   }
 }return fog;
}
fn pixel(p:vec2u)->vec4f{
 let t=paramF32(0u);let size=vec2f(outputSize());let a=ease(0.,8.,t);let b=ease(8.,16.,t);let c=ease(16.,24.,t);
 let eye=mix(mix(mix(vec3f(4.65,2.70,7.85),vec3f(3.85,2.48,6.90),a),vec3f(2.8,1.95,5.90),b),vec3f(3.5,2.55,6.90),c);
 let aim=mix(mix(vec3f(-.35,1.80,-1.50),vec3f(-.70,1.25,-2.0),b),vec3f(-.35,1.80,-2.0),c);
 let forward=normalize(aim-eye);let right=normalize(cross(forward,vec3f(0,1,0)));let up=cross(right,forward);
 let count=u32(paramF32(2u));var color=vec3f(0.);
 for(var sample=0u;sample<8u;sample++){
   if(sample>=count){break;}let j=vec2f(hash(vec3f(vec2f(p),f32(sample)*13.7)),hash(vec3f(vec2f(p)+31.,f32(sample)*39.3)));
   let xy=(2.*(vec2f(p)+j)-size)/size.y;let ray=normalize(forward*2.05+right*xy.x-up*xy.y);
   let offset=(right*(j.x-.5)+up*(j.y-.5))*paramF32(7u);let focus=eye+ray*(length(aim-eye)/dot(ray,forward));
   var ro=eye+offset;let rd=normalize(focus-ro);var glassLight=vec3f(0.);var throughput=vec3f(1.);var hit=closest(ro,rd,65.,false,t);
   for(var pane=0;pane<3;pane++){
     if(hit.triangle==NONE){break;}let mid=u32(data1(hit.triangle*28u+3u));
     if(data2(mid*16u+5u)!=9.){break;}
     glassLight+=vec3f(.026,.035,.040)*throughput;throughput*=vec3f(.93,.96,.95);ro+=rd*(hit.distance+.004);hit=closest(ro,rd,65.,false,t);
   }
   let lightSample=vec2f(select(.28,.72,sample%2u==0u),select(.33,.67,sample%2u==0u));
   color+=(shade(ro,rd,hit,t,lightSample)+atmosphere(ro,rd,hit.distance,t))*throughput+glassLight;
 }
 color=color/f32(max(count,1u))*paramF32(1u);
 color=color/(1.+color*.20);
 let q=(vec2f(p)/size-.5)*vec2f(1.1,1.);color*=1.-.14*dot(q,q);
 return vec4f(max(color,vec3f(0.)),1.);
}`;

export const drawingRoom=defineNativeStage(async init=>{
  const gpu=init.gpu,scene=furnishManor();
  const upload=(values:Float32Array,label:string)=>gpu.createBuffer({type:'f32',length:values.length,label},values);
  const nodes=await upload(scene.nodes,'Manor / immutable triangle BVHs');
  const triangles=await upload(scene.triangles,'Manor / furnished geometry');
  const materials=await upload(scene.materials,'Manor / surface palette');
  const atlas=await createServo(gpu,{profile:'sdr-srgb8',execution:'trusted-local',input:false,width:2048,height:2048,seed:FILM.seed,
    html:'<style>html,body{margin:0;background:#000;overflow:hidden}</style><canvas id="atlas" width="2048" height="2048"></canvas>',javascript:ATLAS_SCRIPT});
  const renderer=await gpu.compile({abiVersion:2,id:'manor/the-still-hours',version:'1.0.0',inputCount:1,
    dataInputs:[{type:'f32'},{type:'f32'},{type:'f32'}],parameterWords:12,code:ROOM_SHADER});
  return {
    async renderAt(context){
      const time=context.time;
      const texture=await atlas.render(undefined,{context,parameters:{}});
      return withGpuResources(gpu,async arena=>{
        const image=arena.image(await gpu.run(renderer,[texture],{data:[nodes,triangles,materials],
          parameters:Float32Array.of(time,FILM.exposure,FILM.samples,scene.roomRoot,scene.catRoot,FILM.fire,FILM.daylight,FILM.aperture,0,0,0,0),
          output:{width:init.width,height:init.height,format:'rgba32float',alpha:'opaque',color:linear709}}));
        const lens=await processPa(image,(input,fx)=>fx.glow(input,{radius:3.1*init.height/1080,intensity:.055,threshold:1.2,boundary:'clamp'}),{context});
        return processImage(lens,async(input,fx)=>{
          const contrast=await fx.brightnessContrast(input,{contrast:1.025,pivot:.13});
          return fx.filmGrain(contrast,{amount:FILM.grain,seed:FILM.seed,animated:false,colored:false});
        },{context});
      });
    },
    async dispose(){await atlas.dispose();for(const buffer of [materials,triangles,nodes])await gpu.releaseBuffer(buffer);},
  };
});

export default <Composition id="the-still-hours-manor" width={FILM.width} height={FILM.height}
 fps={FILM.fps} durationInFrames={FILM.frames} seed={FILM.seed} background="#14140f">
 <Stage id="drawing-room" factory={drawingRoom}/>
 <Layer id="picture" source={ref('drawing-room')}/>
</Composition>;
