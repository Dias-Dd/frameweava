import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createShapeModifiers} from '../modules/pro-animation/src/shape-modifiers.ts';
import type {PathData,PathCommand} from '../modules/graphics-contracts/types.ts';

function originalFunction(source:string,name:string){
 const start=source.indexOf('fn '+name+'(');assert.ok(start>=0,'Missing original '+name);const brace=source.indexOf('{',start);let depth=1,end=brace+1;
 for(;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;assert.ok(end<source.length);}
 return source.slice(start,end);
}
const commands=(values:([string,...number[]])[]):PathCommand[]=>{let n=0;const p=(x:number,y:number)=>({id:'v'+n++,x,y});return values.map(([op,...v]):PathCommand=>op==='Z'?{op:'Z'}:op==='C'?{op:'C',control1:p(v[0],v[1]),control2:p(v[2],v[3]),point:p(v[4],v[5])}:op==='Q'?{op:'Q',control:p(v[0],v[1]),point:p(v[2],v[3])}:{op:op as 'M'|'L',point:p(v[0],v[1])});};
const fixture=(c:PathCommand[]):PathData=>({schema:'frameweave.path',version:1,id:'reference',coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:320,height:192},fillRule:'nonzero',commands:c});
test('PA-3 shapes agree with unchanged pinned EffectCraft Rust functions and real kurbo, not a reimplemented expected array',{timeout:120000},async()=>{
 const base=resolve('.frameweave/pa3');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'rust-')),source=await readFile('modules/pro-animation/vendor/effectcraft/path-ops.rs','utf8');
 assert.equal(createHash('sha256').update(source).digest('hex'),'98679efdf568338fe274c7cfc9719afe525c5ac07c6d5ad47cf06ebbdf6347ac');
 const functions=['degenerate','subs','push_seg','seg_start_tan','seg_end_tan','seg_tan_at','pucker_bloat','round_corners','round_sub'];
 const bridge=`use std::f64::consts::PI;
use kurbo::{BezPath,CubicBez,ParamCurve,ParamCurveArclen,ParamCurveDeriv,PathEl,PathSeg,Point,Vec2};
const ACC:f64=1e-3;
struct Sub {segs:Vec<PathSeg>,closed:bool}
fn unit(v:Vec2)->Option<Vec2>{let n=v.hypot();if n>0.0{Some(v/n)}else{None}}
fn start_tangent(c:&CubicBez)->Vec2{for p in [c.p1,c.p2,c.p3]{if let Some(v)=unit(p-c.p0){return v;}}Vec2::ZERO}
fn end_tangent(c:&CubicBez)->Vec2{for p in [c.p2,c.p1,c.p0]{if let Some(v)=unit(c.p3-p){return v;}}Vec2::ZERO}
`;
 const square=commands([['M',0,0],['L',100,0],['L',100,100],['L',0,100],['Z']]),curved=commands([['M',0,0],['C',25,0,75,25,100,25],['L',100,100],['Q',40,100,0,70]]),open=commands([['M',0,0],['L',100,0],['L',100,100]]),holes=commands([['M',0,0],['L',120,0],['L',120,100],['L',0,100],['Z'],['M',30,30],['L',30,70],['L',80,70],['L',80,30],['Z']]);
 const cases=[...[-75,25,150].map(value=>({kind:'pucker' as const,value,c:square})),{kind:'pucker' as const,value:37,c:curved},{kind:'pucker' as const,value:-30,c:holes},...[3.25,10,49].map(value=>({kind:'round' as const,value,c:square})),{kind:'round' as const,value:12,c:curved},{kind:'round' as const,value:10,c:open},{kind:'round' as const,value:6,c:holes}];
 const number=(v:number)=>Number.isInteger(v)?String(v)+'.0':String(v);
 const rustPath=(c:PathCommand[])=>c.map(c=>c.op==='Z'?'p.close_path();':c.op==='C'?`p.curve_to((${number(c.control1.x)},${number(c.control1.y)}),(${number(c.control2.x)},${number(c.control2.y)}),(${number(c.point.x)},${number(c.point.y)}));`:c.op==='Q'?`p.quad_to((${number(c.control.x)},${number(c.control.y)}),(${number(c.point.x)},${number(c.point.y)}));`:`p.${c.op==='M'?'move_to':'line_to'}((${number(c.point.x)},${number(c.point.y)}));`).join('\n');
 const emit=`fn dump(p:&BezPath){for e in p.elements(){match e{PathEl::MoveTo(p)=>println!("M {:.17} {:.17}",p.x,p.y),PathEl::LineTo(p)=>println!("L {:.17} {:.17}",p.x,p.y),PathEl::QuadTo(a,p)=>println!("Q {:.17} {:.17} {:.17} {:.17}",a.x,a.y,p.x,p.y),PathEl::CurveTo(a,b,p)=>println!("C {:.17} {:.17} {:.17} {:.17} {:.17} {:.17}",a.x,a.y,b.x,b.y,p.x,p.y),PathEl::ClosePath=>println!("Z")}}}`;
 const main='fn main(){'+cases.map((c,i)=>'{let mut p=BezPath::new();'+rustPath(c.c)+`let result=${c.kind==='pucker'?'pucker_bloat':'round_corners'}(&[p],${number(c.value)});println!("CASE ${i}");dump(&result[0]);}`).join('\n')+'}';
 await mkdir(join(dir,'src'));await writeFile(join(dir,'Cargo.toml'),'[package]\nname="pa3-reference"\nversion="0.0.0"\nedition="2021"\n[dependencies]\nkurbo="=0.13.1"\n');await writeFile(join(dir,'src/main.rs'),bridge+functions.map(n=>originalFunction(source,n)).join('\n')+emit+main);
 await writeFile(join(dir,'Cargo.lock'),await readFile('modules/pro-animation/validation/pa3-shapes-reference.Cargo.lock'));
 const exec=promisify(execFile),env:NodeJS.ProcessEnv={...process.env,CARGO_TARGET_DIR:join(dir,'target'),CARGO_NET_OFFLINE:'true'};
 if(process.platform==='win32'){
  await writeFile(join(dir,'host.def'),'LIBRARY WS2_32.dll\nEXPORTS\nGetHostNameW\n');await exec(process.env.FRAMEWEAVE_PA_DLLTOOL??'dlltool',['-d',join(dir,'host.def'),'-l',join(dir,'host.a'),'-m','i386:x86-64'],{windowsHide:true});
  env.CARGO_ENCODED_RUSTFLAGS=[process.env.CARGO_ENCODED_RUSTFLAGS,'-C','link-arg='+join(dir,'host.a')].filter(Boolean).join('\x1f');
 }
 const cargo=process.env.FRAMEWEAVE_PA_CARGO??(process.platform==='win32'?'cargo':'cargo');
 const result=await exec(cargo,['run','--offline','--locked','--quiet','--manifest-path',join(dir,'Cargo.toml')],{env,windowsHide:true,maxBuffer:1024*1024});await writeFile(join(dir,'stdout.txt'),result.stdout);await writeFile(join(dir,'stderr.txt'),result.stderr);
 const rows=result.stdout.trim().split(/CASE \d+\r?\n/).filter(Boolean).map(s=>s.trim().split(/\r?\n/).map(l=>l.split(' '))),shape=createShapeModifiers(graphics),errors={pucker:0,round:0};let scalars=0;
 assert.equal(rows.length,cases.length);
 for(let i=0;i<cases.length;i++){
  const c=cases[i],p=fixture(c.c),out=c.kind==='pucker'?shape.puckerBloat(p,{amount:c.value},{} as any):shape.roundCorners(p,{radius:c.value,tolerance:1e-6},{} as any),rust=rows[i];
  assert.equal(out.commands.length,rust.length,'case '+i+' command count');
  for(let j=0;j<out.commands.length;j++){
   const command=out.commands[j],reference=rust[j];assert.equal(command.op,reference[0]);const values=command.op==='Z'?[]:command.op==='C'?[command.control1.x,command.control1.y,command.control2.x,command.control2.y,command.point.x,command.point.y]:command.op==='Q'?[command.control.x,command.control.y,command.point.x,command.point.y]:[command.point.x,command.point.y];
   for(let k=0;k<values.length;k++){scalars++;const error=Math.abs(values[k]-Number(reference[k+1]));errors[c.kind]=Math.max(errors[c.kind],error);assert.ok(error<=(c.kind==='pucker'?2e-12:2e-3),`case ${i}, command ${j}, scalar ${k}: ${error}`);}
  }
 }
 await writeFile(join(base,'rust-shapes-proof.json'),JSON.stringify({upstreamCommit:'861c51f8187bf56efc77cc7b60fc4a513d2b7198',rawSha256:'98679efdf568338fe274c7cfc9719afe525c5ac07c6d5ad47cf06ebbdf6347ac',functions,kurbo:'0.13.1',actualOriginalFunctions:true,offlineBuild:true,lockedDependencies:true,lockSha256:createHash('sha256').update(await readFile(join(dir,'Cargo.lock'))).digest('hex'),targetDirectory:join(dir,'target'),bridge:'Only local type/tangent adapters; original Pucker/Bloat and Round Corners bodies unchanged. Tiny degenerate policies differ outside these fixtures.',cases:cases.length,scalars,maxAbsoluteError:errors,budgets:{pucker:2e-12,round:2e-3}},null,2));
});
