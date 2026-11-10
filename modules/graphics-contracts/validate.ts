import * as c from './check.ts';
import type {Coordinates2D,Coordinates3D,ResourceReference,Color,PathPoint,PathCommand,PathData,MaskData,MeshData,SkeletonData,Matrix4,TextLayoutData,Vec2,Vec3} from './types.ts';

const base=['schema','version','id'];
export function coordinates2D(v:unknown,p='$.coordinates'):Coordinates2D {
  const o=c.object(v,p,['spaceId','unit','origin','x','y','width','height']);
  return {spaceId:c.id(o.spaceId,p+'.spaceId'),unit:c.literal(o.unit,['px','normalized'],p+'.unit'),origin:c.literal(o.origin,['top-left'],p+'.origin'),x:c.literal(o.x,['right'],p+'.x'),y:c.literal(o.y,['down'],p+'.y'),width:c.integer(o.width,p+'.width',1),height:c.integer(o.height,p+'.height',1)};
}
function coordinates3D(v:unknown,p:string):Coordinates3D {
  const o=c.object(v,p,['spaceId','unit','origin','x','y','z','handedness']);
  return {spaceId:c.id(o.spaceId,p+'.spaceId'),unit:c.literal(o.unit,['meter'],p+'.unit'),origin:c.literal(o.origin,['local'],p+'.origin'),x:c.literal(o.x,['right'],p+'.x'),y:c.literal(o.y,['up'],p+'.y'),z:c.literal(o.z,['toward-viewer'],p+'.z'),handedness:c.literal(o.handedness,['right'],p+'.handedness')};
}
export function sameCoordinates(a:Coordinates2D|Coordinates3D,b:Coordinates2D|Coordinates3D,p:string):void {
  for(const key of Object.keys(a))if(Reflect.get(a,key)!==Reflect.get(b,key))c.fail(p,`coordinate mismatch at ${key}`,'E_GRAPHICS_SPACE');
}
export function resourceReference(v:unknown,p='$.source'):ResourceReference {
  const o=c.object(v,p,['resourceId','kind','sha256','bytes']);
  const resourceId=c.id(o.resourceId,p+'.resourceId');if(!/^[A-Za-z0-9_-]+$/.test(resourceId))c.fail(p+'.resourceId','must match an existing TVG Resource ID (letters, digits, underscore, hyphen)');
  return {resourceId,kind:c.literal(o.kind,['file','image','font'],p+'.kind'),sha256:c.sha(o.sha256,p+'.sha256'),bytes:c.integer(o.bytes,p+'.bytes',1,c.LIMITS.resourceBytes)};
}
function color(v:unknown,p:string):Color {
  const o=c.object(v,p,['space','alpha','rgba']),rgba=c.array(o.rgba,p+'.rgba',4,(x,q)=>c.number(x,q,0,1),4) as Color['rgba'];
  return {space:c.literal(o.space,['srgb'],p+'.space'),alpha:c.literal(o.alpha,['straight'],p+'.alpha'),rgba};
}
function point(v:unknown,p:string):PathPoint {
  const o=c.object(v,p,['id','x','y']);return {id:c.id(o.id,p+'.id'),x:c.number(o.x,p+'.x'),y:c.number(o.y,p+'.y')};
}
function path(v:unknown,p:string):PathData {
  const o=c.object(v,p,[...base,'coordinates','fillRule','commands'],['label']);c.header(o,'frameweave.path',p);
  let active=false;const ids:string[]=[];
  const commands=c.array(o.commands,p+'.commands',c.LIMITS.commands,(v,q):PathCommand=>{
    const raw=c.object(v,q,['op'],['point','control','control1','control2']);
    const op=c.literal(raw.op,['M','L','Q','C','Z'],q+'.op');
    c.object(raw,q,op==='Z'?['op']:op==='Q'?['op','control','point']:op==='C'?['op','control1','control2','point']:['op','point']);
    if(op!=='M'&&!active)c.fail(q,'subpath must start with M; after Z use a new M');
    if(op==='Z'){active=false;return {op};}active=true;
    const take=(key:string)=>{const x=point(raw[key],q+'.'+key);ids.push(x.id);return x;};
    if(op==='Q')return {op,control:take('control'),point:take('point')};
    if(op==='C')return {op,control1:take('control1'),control2:take('control2'),point:take('point')};
    return {op,point:take('point')};
  },1);c.unique(ids,p+'.commands.points');
  return {schema:'frameweave.path',version:1,id:c.id(o.id,p+'.id'),coordinates:coordinates2D(o.coordinates,p+'.coordinates'),fillRule:c.literal(o.fillRule,['nonzero','evenodd'],p+'.fillRule'),commands,...(Object.hasOwn(o,'label')?{label:c.string(o.label,p+'.label',true)}:{})};
}
export function validatePathData(v:unknown):PathData {c.bounded(v);return path(v,'$');}
export function validateMaskData(v:unknown):MaskData {
  c.bounded(v);const o=c.object(v,'$',[...base,'coordinates','sampling','boundary','feather','kind'],['path','source','format','channel','colorSpace','alpha']);c.header(o,'frameweave.mask');
  const kind=c.literal(o.kind,['vector','raster'],'$.kind');
  c.object(o,'$',[...base,'coordinates','sampling','boundary','feather','kind',...(kind==='vector'?['path']:['source','format','channel','colorSpace','alpha'])]);
  const coordinates=coordinates2D(o.coordinates);
  const f=c.object(o.feather,'$.feather',['radius','unit']);c.literal(f.radius,[0],'$.feather.radius');c.literal(f.unit,['px'],'$.feather.unit');
  const common={schema:'frameweave.mask' as const,version:1 as const,id:c.id(o.id,'$.id'),coordinates,sampling:c.literal(o.sampling,['nearest','linear'],'$.sampling'),boundary:c.literal(o.boundary,['zero','clamp'],'$.boundary'),feather:{radius:0 as const,unit:'px' as const}};
  if(kind==='vector'){const data=path(o.path,'$.path');sameCoordinates(coordinates,data.coordinates,'$.path.coordinates');return {...common,kind,path:data};}
  const source=resourceReference(o.source);if(source.kind!=='file')c.fail('$.source.kind','raw rgba8 requires a file Resource');
  if(source.bytes!==coordinates.width*coordinates.height*4)c.fail('$.source.bytes','rgba8 byte length must equal width × height × 4');
  return {...common,kind,source,format:c.literal(o.format,['rgba8'],'$.format'),channel:c.literal(o.channel,['alpha','luma'],'$.channel'),colorSpace:c.literal(o.colorSpace,['srgb'],'$.colorSpace'),alpha:c.literal(o.alpha,['straight'],'$.alpha')};
}
export function validateMeshData(v:unknown):MeshData {
  c.bounded(v);const o=c.object(v,'$',[...base,'coordinates','topology','vertexIds','restPositions','indices'],['uv','uvOrigin','controls','material']);c.header(o,'frameweave.mesh');
  const vertexIds=c.array(o.vertexIds,'$.vertexIds',c.LIMITS.vertices,c.id,3);c.unique(vertexIds,'$.vertexIds');const ids=new Set(vertexIds);
  const restPositions=c.array(o.restPositions,'$.restPositions',vertexIds.length,(x,p)=>c.array(x,p,3,(v,q)=>c.number(v,q),3) as Vec3,vertexIds.length);
  const indices=c.array(o.indices,'$.indices',c.LIMITS.array,(x,p)=>c.integer(x,p,0,vertexIds.length-1),3);if(indices.length%3)c.fail('$.indices','triangles require triples');
  for(let i=0;i<indices.length;i+=3)if(new Set(indices.slice(i,i+3)).size!==3)c.fail(`$.indices[${i}]`,'triangle repeats a vertex');
  let uv:Vec2[]|undefined;if(Object.hasOwn(o,'uv')){uv=c.array(o.uv,'$.uv',vertexIds.length,(x,p)=>c.array(x,p,2,(v,q)=>c.number(v,q),2) as Vec2,vertexIds.length);c.literal(o.uvOrigin,['top-left'],'$.uvOrigin');}else if(Object.hasOwn(o,'uvOrigin'))c.fail('$.uvOrigin','requires uv');
  const controls=Object.hasOwn(o,'controls')?c.array(o.controls,'$.controls',c.LIMITS.vertices,(v,p)=>{const x=c.object(v,p,['id','vertexId']);const vertexId=c.id(x.vertexId,p+'.vertexId');if(!ids.has(vertexId))c.fail(p+'.vertexId','unknown vertex');return {id:c.id(x.id,p+'.id'),vertexId};}):undefined;
  if(controls)c.unique(controls.map(x=>x.id),'$.controls');
  let material:MeshData['material'];if(Object.hasOwn(o,'material')){const m=c.object(o.material,'$.material',[],['baseColor','texture']);if(!Object.keys(m).length)c.fail('$.material','empty material');material={...(Object.hasOwn(m,'baseColor')?{baseColor:color(m.baseColor,'$.material.baseColor')}:{}),...(Object.hasOwn(m,'texture')?{texture:resourceReference(m.texture,'$.material.texture')}:{})};if(material.texture&&material.texture.kind!=='image')c.fail('$.material.texture.kind','expected image Resource');}
  return {schema:'frameweave.mesh',version:1,id:c.id(o.id,'$.id'),coordinates:coordinates3D(o.coordinates,'$.coordinates'),topology:c.literal(o.topology,['triangles'],'$.topology'),vertexIds,restPositions,indices,...(uv?{uv,uvOrigin:'top-left' as const}:{}),...(controls?{controls}:{}),...(material?{material}:{})};
}
function matrix(v:unknown,p:string):Matrix4 {
  const m=c.array(v,p,16,(v,q)=>c.number(v,q),16) as Matrix4;
  if(m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)c.fail(p,'expected affine column-major matrix');return m;
}
/** Mesh is explicit: vertex weights cannot be validated against an implicit scene/global registry. */
export function validateSkeletonData(v:unknown,meshInput:MeshData):SkeletonData {
  const mesh=validateMeshData(meshInput);c.bounded(v);
  const o=c.object(v,'$',[...base,'coordinates','meshId','bones','weights']);c.header(o,'frameweave.skeleton');
  const coordinates=coordinates3D(o.coordinates,'$.coordinates');sameCoordinates(coordinates,mesh.coordinates,'$.coordinates');
  const meshId=c.id(o.meshId,'$.meshId');if(meshId!==mesh.id)c.fail('$.meshId','does not match explicit mesh');
  const bones=c.array(o.bones,'$.bones',Infinity,(v,p)=>{
    const b=c.object(v,p,['id','parentId','bindMatrix','inverseBindMatrix']);const bindMatrix=matrix(b.bindMatrix,p+'.bindMatrix'),inverseBindMatrix=matrix(b.inverseBindMatrix,p+'.inverseBindMatrix');
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){let n=0;for(let k=0;k<4;k++)n+=bindMatrix[k*4+row]*inverseBindMatrix[col*4+k];if(Math.abs(n-(row===col?1:0))>1e-6)c.fail(p+'.inverseBindMatrix','does not invert bindMatrix within 1e-6');}
    return {id:c.id(b.id,p+'.id'),parentId:b.parentId===null?null:c.id(b.parentId,p+'.parentId'),bindMatrix,inverseBindMatrix};
  },1);c.unique(bones.map(b=>b.id),'$.bones');const byId=new Map(bones.map(b=>[b.id,b]));
  for(const [i,b]of bones.entries()){const seen=new Set<string>();let at:typeof b|undefined=b;while(at){if(seen.has(at.id))c.fail(`$.bones[${i}].parentId`,'bone cycle');seen.add(at.id);if(at.parentId===null)break;const parent=byId.get(at.parentId);if(!parent)c.fail(`$.bones[${i}].parentId`,'unknown parent');at=parent;}}
  const vertices=new Set(mesh.vertexIds),weights=c.array(o.weights,'$.weights',mesh.vertexIds.length,(v,p)=>{
    const w=c.object(v,p,['vertexId','influences']),vertexId=c.id(w.vertexId,p+'.vertexId');if(!vertices.has(vertexId))c.fail(p+'.vertexId','unknown mesh vertex');
    const influences=c.array(w.influences,p+'.influences',Infinity,(v,q)=>{const i=c.object(v,q,['boneId','weight']),boneId=c.id(i.boneId,q+'.boneId');if(!byId.has(boneId))c.fail(q+'.boneId','unknown bone');return {boneId,weight:c.number(i.weight,q+'.weight',Number.MIN_VALUE,1)};},1);c.unique(influences.map(i=>i.boneId),p+'.influences');
    if(Math.abs(influences.reduce((a,b)=>a+b.weight,0)-1)>1e-6)c.fail(p+'.influences','weights must sum to 1 within 1e-6');return {vertexId,influences};
  },mesh.vertexIds.length);c.unique(weights.map(w=>w.vertexId),'$.weights');
  return {schema:'frameweave.skeleton',version:1,id:c.id(o.id,'$.id'),coordinates,meshId,bones,weights};
}
export function validateTextLayoutData(v:unknown):TextLayoutData {
  c.bounded(v);const o=c.object(v,'$',[...base,'coordinates','text','layout','fonts','styles','paragraphs','lines','glyphs']);c.header(o,'frameweave.text-layout');
  const text=c.string(o.text,'$.text',true),layout=c.object(o.layout,'$.layout',['engine','version','clusterUnit']);
  function range(v:Record<string,unknown>,p:string){const start=c.integer(v.start,p+'.start',0,text.length),end=c.integer(v.end,p+'.end',start,text.length);for(const n of [start,end])if(n>0&&n<text.length&&/[\uD800-\uDBFF]/.test(text[n-1])&&/[\uDC00-\uDFFF]/.test(text[n]))c.fail(p,'range splits a UTF-16 surrogate pair');return {start,end};}
  const fonts=c.array(o.fonts,'$.fonts',Infinity,(v,p)=>{const f=c.object(v,p,['id','source','faceIndex']),source=resourceReference(f.source,p+'.source');if(source.kind!=='font')c.fail(p+'.source.kind','expected font Resource');return {id:c.id(f.id,p+'.id'),source,faceIndex:c.integer(f.faceIndex,p+'.faceIndex',0)};},1);c.unique(fonts.map(f=>f.id),'$.fonts');
  const styles=c.array(o.styles,'$.styles',Infinity,(v,p)=>{const s=c.object(v,p,['id','fontId','fontSize','fill']),fontId=c.id(s.fontId,p+'.fontId');if(!fonts.some(f=>f.id===fontId))c.fail(p+'.fontId','unknown font');return {id:c.id(s.id,p+'.id'),fontId,fontSize:c.number(s.fontSize,p+'.fontSize',Number.MIN_VALUE),fill:color(s.fill,p+'.fill')};},1);c.unique(styles.map(s=>s.id),'$.styles');
  const paragraphs=c.array(o.paragraphs,'$.paragraphs',Infinity,(v,p)=>{const a=c.object(v,p,['id','start','end','direction'],['writingMode']);return {id:c.id(a.id,p+'.id'),...range(a,p),direction:c.literal(a.direction,['ltr','rtl'],p+'.direction'),...(Object.hasOwn(a,'writingMode')?{writingMode:c.literal(a.writingMode,['horizontal-tb','vertical-rl','vertical-lr'],p+'.writingMode')}:{})};});c.unique(paragraphs.map(a=>a.id),'$.paragraphs');
  for(let i=1;i<paragraphs.length;i++)if(paragraphs[i].start<paragraphs[i-1].end)c.fail(`$.paragraphs[${i}]`,'paragraphs must be ordered and nonoverlapping');
  const lines=c.array(o.lines,'$.lines',Infinity,(v,p)=>{const a=c.object(v,p,['id','paragraphId','start','end','baseline'],['baselineAxis']),r=range(a,p),paragraphId=c.id(a.paragraphId,p+'.paragraphId'),parent=paragraphs.find(a=>a.id===paragraphId);if(!parent||r.start<parent.start||r.end>parent.end)c.fail(p+'.paragraphId','unknown paragraph or range outside it');const expected=parent.writingMode&&parent.writingMode!=='horizontal-tb'?'x':'y';const axis=Object.hasOwn(a,'baselineAxis')?c.literal(a.baselineAxis,['x','y'],p+'.baselineAxis'):undefined;if(axis!==undefined&&axis!==expected)c.fail(p+'.baselineAxis','must match paragraph writingMode ('+expected+')');return {id:c.id(a.id,p+'.id'),paragraphId,...r,baseline:c.number(a.baseline,p+'.baseline'),...(axis===undefined?{}:{baselineAxis:axis})};});c.unique(lines.map(a=>a.id),'$.lines');
  const glyphs=c.array(o.glyphs,'$.glyphs',c.LIMITS.glyphs,(v,p)=>{const g=c.object(v,p,['id','lineId','styleId','glyphId','cluster','x','y','advanceX','advanceY'],['orientation']),lineId=c.id(g.lineId,p+'.lineId'),line=lines.find(l=>l.id===lineId),styleId=c.id(g.styleId,p+'.styleId');if(!styles.some(s=>s.id===styleId))c.fail(p+'.styleId','unknown style');const r=range(c.object(g.cluster,p+'.cluster',['start','end']),p+'.cluster');if(!line||r.start<line.start||r.end>line.end||r.start===r.end)c.fail(p+'.cluster','nonempty cluster must lie within line');const orientation=Object.hasOwn(g,'orientation')?c.literal(g.orientation,['upright','sideways-right','sideways-left'],p+'.orientation'):undefined;const mode=paragraphs.find(a=>a.id===line.paragraphId)!.writingMode??'horizontal-tb';if(orientation&&orientation!=='upright'&&mode==='horizontal-tb')c.fail(p+'.orientation','sideways glyphs require a vertical paragraph');return {id:c.id(g.id,p+'.id'),lineId,styleId,glyphId:c.integer(g.glyphId,p+'.glyphId',0,4294967295),cluster:r,x:c.number(g.x,p+'.x'),y:c.number(g.y,p+'.y'),advanceX:c.number(g.advanceX,p+'.advanceX'),advanceY:c.number(g.advanceY,p+'.advanceY'),...(orientation===undefined?{}:{orientation})};});c.unique(glyphs.map(g=>g.id),'$.glyphs');
  return {schema:'frameweave.text-layout',version:1,id:c.id(o.id,'$.id'),coordinates:coordinates2D(o.coordinates),text,layout:{engine:c.string(layout.engine,'$.layout.engine'),version:c.string(layout.version,'$.layout.version'),clusterUnit:c.literal(layout.clusterUnit,['utf16'],'$.layout.clusterUnit')},fonts,styles,paragraphs,lines,glyphs};
}
