import {bindCharacterMesh,characterBones,type MeshData} from '../../native.ts';
/** Ordinary editable triangulation and joints. No image/resource import. */
export function makeCharacter(){
 const restPositions:MeshData['restPositions']=[],indices:number[]=[],weights:{vertexId:string;influences:{boneId:string;weight:number}[]}[]=[],controls:NonNullable<MeshData['controls']>=[];
 function strip(id:string,a:[number,number],b:[number,number],width:number,bone:string){const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/len*width/2,ny=dx/len*width/2,base=restPositions.length;for(const p of [[a[0]+nx,a[1]+ny,0],[a[0]-nx,a[1]-ny,0],[b[0]-nx,b[1]-ny,0],[b[0]+nx,b[1]+ny,0]] as [number,number,number][]){const i=restPositions.push(p)-1;weights.push({vertexId:'v'+i,influences:[{boneId:bone,weight:1}]});}indices.push(base,base+1,base+2,base,base+2,base+3);controls.push({id,vertexId:'v'+base});}
 strip('body',[-.02,-.2],[-.02,.65],.55,'spine');strip('head',[0,.65],[0,1.12],.42,'head');
 strip('upper-arm-r',[.22,.5],[.7,.15],.16,'arm.r');strip('hand-r',[.7,.15],[1.05,-.3],.13,'forearm.r');
 strip('upper-arm-l',[-.22,.5],[-.7,.15],.16,'arm.l');strip('hand-l',[-.7,.15],[-1.05,-.3],.13,'forearm.l');
 strip('upper-leg-r',[.16,-.16],[.25,-.7],.2,'leg.r');strip('foot-r',[.25,-.7],[.35,-1.2],.16,'shin.r');
 strip('upper-leg-l',[-.16,-.16],[-.25,-.7],.2,'leg.l');strip('foot-l',[-.25,-.7],[-.35,-1.2],.16,'shin.l');
 const mesh:MeshData={schema:'frameweave.mesh',version:1,id:'native-character',coordinates:{spaceId:'character-local',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:restPositions.map((_,i)=>'v'+i),restPositions,indices,controls};
 const skeleton=characterBones([
  {id:'spine',parentId:null,position:[0,-.2,0]},{id:'head',parentId:'spine',position:[0,.65,0]},
  {id:'arm.r',parentId:'spine',position:[.22,.5,0]},{id:'forearm.r',parentId:'arm.r',position:[.7,.15,0]},{id:'hand.r',parentId:'forearm.r',position:[1.05,-.3,0]},
  {id:'arm.l',parentId:'spine',position:[-.22,.5,0]},{id:'forearm.l',parentId:'arm.l',position:[-.7,.15,0]},{id:'hand.l',parentId:'forearm.l',position:[-1.05,-.3,0]},
  {id:'leg.r',parentId:'spine',position:[.16,-.16,0]},{id:'shin.r',parentId:'leg.r',position:[.25,-.7,0]},{id:'foot.r',parentId:'shin.r',position:[.35,-1.2,0]},
  {id:'leg.l',parentId:'spine',position:[-.16,-.16,0]},{id:'shin.l',parentId:'leg.l',position:[-.25,-.7,0]},{id:'foot.l',parentId:'shin.l',position:[-.35,-1.2,0]}
 ]);
 // Run the reusable auto-binding path, then explicitly author rigid part weights.
 const asset=bindCharacterMesh(mesh,skeleton,{id:'native-character.rig',influences:2});asset.skeleton.weights=weights;return asset;
}
