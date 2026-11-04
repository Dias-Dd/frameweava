// SPDX-License-Identifier: Apache-2.0
// Authored midpoint-displacement tree, Core addressable RNG and existing MIT tube sweep.
import {assertJson,checkSignals} from '../../../src/core/graph.ts';
import {evaluate} from '../../../src/core/animation.ts';
import {seededRandom} from '../../../src/core/time.ts';
import {object,integer,number,localContext,signalVector} from './check.ts';
import {createTrailGeometry} from './trail-geometry.ts';
import type {TrailGeometry} from './trail-types.ts';
import type {Vec3,FrameContext} from './types.ts';
import type {LightningGeometryOptions,LightningGeometry,LightningSampleOptions,LightningSample,LightningBolt} from './lightning-types.ts';

function fail(code:string,message:string):never {throw Object.assign(new Error(message),{code:'E_LIGHTNING_'+code});}
function translate(error:unknown):never {const e=error as {code?:string;message?:string};if(e.code?.startsWith('E_RIG_')||e.code?.startsWith('E_TRAIL_'))throw Object.assign(new Error(e.message,{cause:error}),{code:e.code.replace(/^E_(RIG|TRAIL)_/,'E_LIGHTNING_')});throw error;}
const add=(a:Vec3,b:Vec3):Vec3=>a.map((x,k)=>number(x+b[k],'generated position')) as Vec3;
const mul=(v:Vec3,s:number):Vec3=>v.map(x=>number(x*s,'scaled vector')) as Vec3;
const sub=(a:Vec3,b:Vec3):Vec3=>a.map((x,k)=>number(x-b[k],'chord')) as Vec3;
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function basis(direction:Vec3):[Vec3,Vec3] {const axis:Vec3=[0,0,0];let k=0;for(let i=1;i<3;i++)if(Math.abs(direction[i])<Math.abs(direction[k]))k=i;axis[k]=1;const n=cross(direction,axis),length=Math.hypot(...n),normal=mul(n,1/length);return [normal,cross(direction,normal)];}
function scalar(raw:unknown,fallback:number,name:string,context:FrameContext,min=-Number.MAX_VALUE,max=Number.MAX_VALUE){const data=raw??fallback;assertJson(data);checkSignals(data);return number(evaluate(data,context),name,min,max);}

/** Stateless 3D geometry, not plasma physics or a CPU pixel effect. GPU rendering remains explicit. */
export function createLightningGeometry(options:LightningGeometryOptions):LightningGeometry {try{
  const o=object(options,'lightning geometry',['id','subdivisions','branchGenerations','branchesPerBolt','seed','roughness','branchLength','branchAngle','branchRadius','tipScale','radialSegments','coordinates','maxVerticesPerMesh','maxBytes','maxWork']);
  if(typeof o.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(o.id))fail('PARAMETER','A stable ID of 1..96 Graphics-safe characters is required (suffix space reserved)');
  const subdivisions=integer(o.subdivisions??5,'subdivisions',0),generations=integer(o.branchGenerations??2,'branchGenerations',0),branching=integer(o.branchesPerBolt??2,'branchesPerBolt',0),seed=integer(o.seed??0,'seed',0,0xffffffff),roughness=number(o.roughness??.55,'roughness',0,1),branchLength=number(o.branchLength??.4,'branchLength',0),branchAngle=number(o.branchAngle??.8,'branchAngle',0,Math.PI),branchRadius=number(o.branchRadius??.55,'branchRadius',0),tipScale=number(o.tipScale??.1,'tipScale',0,1),radial=integer(o.radialSegments??6,'radialSegments',3),maxBytes=integer(o.maxBytes??128*1024*1024,'maxBytes'),maxWork=integer(o.maxWork??100000000,'maxWork'),maxVertices=integer(o.maxVerticesPerMesh??16384,'maxVerticesPerMesh',1,16384);
  const segments=2**subdivisions,stations=segments+1,ring=radial+1,chunkRings=Math.min(Math.floor(maxVertices/ring),Math.floor(100000/(radial*6))+1);
  if(!Number.isSafeInteger(stations)||chunkRings<2)fail('BUDGET','Station/cross-section plan exceeds the numeric or existing Graphics domain');
  if(generations>0&&branching>0&&subdivisions===0)fail('PARAMETER','Branches need at least one interior attachment station');
  const chunks=Math.ceil(segments/(chunkRings-1)),vertices=(stations+chunks-1)*ring,triangles=segments*radial*2,bytesPerBolt=vertices*160+triangles*24+stations*384,workPerBolt=vertices*64+stations*384;
  let count=1,layer=1;
  function budget(){if(![count,chunks,vertices,triangles,bytesPerBolt,workPerBolt,count*bytesPerBolt,count*workPerBolt].every(Number.isSafeInteger)||count*bytesPerBolt>maxBytes||count*workPerBolt>maxWork)fail('BUDGET','Complete lightning tree exceeds explicit bytes/work plan; increase the budget or choose authoring resolution');}
  budget();
  // Zero branching cannot cause a huge generation-only loop; no arrays before the plan passes.
  if(branching===1){count=generations+1;budget();}
  else if(branching>1)for(let g=0;g<generations;g++){layer*=branching;count+=layer;budget();}
  const trails:TrailGeometry[]=[],parents:(number|null)[]=[],depths:number[]=[];
  try{for(let i=0;i<count;i++){const parent=i===0?null:Math.floor((i-1)/branching),depth=parent===null?0:depths[parent]+1;parents.push(parent);depths.push(depth);trails.push(createTrailGeometry({id:o.id+'.b'+i,pointCount:stations,radialSegments:radial,coordinates:o.coordinates,maxVerticesPerMesh:maxVertices,maxBytes,maxWork}));}}catch(e){for(const trail of trails)trail.dispose();throw e;}
  let disposed=false;function check(){if(disposed)fail('DISPOSED','Lightning geometry disposed');}
  function sample(input:LightningSampleOptions):LightningSample {try{
    check();const s=object(input,'lightning sample',['start','end','context','radius','amplitude','phase']),context=localContext(s.context),start=signalVector(s.start,'start',context),end=signalVector(s.end,'end',context),radius=scalar(s.radius,.02,'radius',context,0),amplitude=scalar(s.amplitude,.12,'amplitude',context,0),phase=scalar(s.phase,context.time*3,'phase',context,-Number.MAX_SAFE_INTEGER+1,Number.MAX_SAFE_INTEGER-1),knot=Math.floor(phase),fraction=phase-knot,fade=fraction*fraction*fraction*(fraction*(fraction*6-15)+10),localSeed=(seed^context.seed)>>>0;
    const random=(salt:string)=>seededRandom(localSeed,0,salt);
    const noise=(salt:string)=>{const a=seededRandom(localSeed,knot,salt)*2-1,b=seededRandom(localSeed,knot+1,salt)*2-1;return a+(b-a)*fade;};
    const bolts:LightningBolt[]=[],draws:LightningSample['draws']=[];
    for(let i=0;i<count;i++){
      const parent=parents[i],attachment=parent===null?null:1+Math.floor(random(i+':attach')*(segments-1));
      let a=start,b=end,rootRadius=radius;
      if(parent!==null){const p=bolts[parent],chord=sub(p.points.at(-1)!,p.points[0]),length=number(Math.hypot(...chord),'parent length'),direction=length>0?mul(chord,1/length):[1,0,0] as Vec3,[n,v]=basis(direction),azimuth=random(i+':azimuth')*2*Math.PI;
        a=p.points[attachment!];const forward=mul(direction,Math.cos(branchAngle)),side=mul(add(mul(n,Math.cos(azimuth)),mul(v,Math.sin(azimuth))),Math.sin(branchAngle));b=add(a,mul(add(forward,side),number(length*branchLength,'branch length')));rootRadius=number(p.radii[attachment!]*branchRadius,'branch radius');
      }
      const chord=sub(b,a),length=number(Math.hypot(...chord),'bolt length'),direction=length>0?mul(chord,1/length):[1,0,0] as Vec3,[n,v]=basis(direction),points:Vec3[]=Array(stations);points[0]=[...a];points[segments]=[...b];
      let scale=number(length*amplitude,'displacement scale');
      for(let step=segments;step>1;step/=2){for(let lo=0;lo<segments;lo+=step){const mid=lo+step/2,center=add(points[lo],mul(sub(points[lo+step],points[lo]),.5)),offset=add(mul(n,noise(i+':'+mid+':x')*scale),mul(v,noise(i+':'+mid+':y')*scale));points[mid]=add(center,offset);}scale=number(scale*roughness,'displacement scale');}
      const radii=Array.from({length:stations},(_,j)=>number(rootRadius*(1+(tipScale-1)*j/segments),'station radius',0));
      const bolt={id:o.id+'.b'+i,generation:depths[i],parent,attachment,points,radii};bolts.push(bolt);draws.push(...trails[i].sample({points,radius:radii}).draws);
    }
    return {draws,bolts,active:draws.some(d=>d.visible),phase};
  }catch(e){translate(e);}}
  return {meshes:trails.flatMap(t=>t.meshes),sample,describe(){check();return {bolts:count,stationsPerBolt:stations,chunks:chunks*count,vertices:vertices*count,triangles:triangles*count,plannedBytes:bytesPerBolt*count,plannedWork:workPerBolt*count,maxBytes,maxWork};},dispose(){if(disposed)return;disposed=true;for(const trail of trails)trail.dispose();}};
}catch(e){translate(e);}}
