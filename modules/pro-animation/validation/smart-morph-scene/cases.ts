import type {PathData,PathCommand} from '../../../graphics-contracts/types.ts';
import {ellipsePath,roundedRectanglePath,rectanglePath,polystarPath} from '../../src/path-authoring/index.ts';
import {joinPathContours} from '../../src/smart-path/geometry.ts';
const env={width:640,height:400};
export function morphSources(){
 const ring=joinPathContours([ellipsePath({center:[150,135],radius:[86,65]},env)!,ellipsePath({center:[150,135],radius:[30,24]},env)!],{fillRule:'evenodd'}),star=joinPathContours([polystarPath({center:[150,135],points:5,outerRadius:91,innerRadius:55},env)!,roundedRectanglePath({center:[150,135],size:[50,36],radius:8},env)!],{fillRule:'evenodd'}),box=rectanglePath({center:[455,135],size:[120,70]},env)!,turned=rectanglePath({center:[455,135],size:[120,70],rotation:Math.PI/2},env)!;return {ring,star,box,turned};
}
export function placeLegacyPath(path:PathData):PathData{const p=(v:{id:string;x:number;y:number})=>({...v,x:v.x*2.7+320,y:v.y*2.7+310});return {...path,coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:640,height:400},commands:path.commands.map((c):PathCommand=>c.op==='Z'?c:c.op==='C'?{...c,point:p(c.point),control1:p(c.control1),control2:p(c.control2)}:c.op==='Q'?{...c,point:p(c.point),control:p(c.control)}:{...c,point:p(c.point)})};}
