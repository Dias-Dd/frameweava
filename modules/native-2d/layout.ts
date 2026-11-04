// SPDX-License-Identifier: Apache-2.0
/** Flexily adapter only: shared Node2D is still the drawing model. */
import * as F from './vendor/flexily/index.mjs';
import type {Signal,Node2D,FrameContext,Services2D,Bounds2D,PreparedText2D,Matrix2D} from './types.ts';
import {number2D,error2D,transform2D,transformBounds2D,identity2D,multiply2D} from './model.ts';
import {geometryKey,type createGeometryCache} from './plan.ts';import type {createTreeStore} from './store.ts';
export type LayoutLength=Signal<number>|`${number}%`|'auto';
export type LayoutEdges=LayoutLength|readonly[LayoutLength,LayoutLength]|readonly[LayoutLength,LayoutLength,LayoutLength,LayoutLength];
export interface LayoutStyle2D {
 display?:'flex'|'none';direction?:'row'|'column'|'row-reverse'|'column-reverse';wrap?:boolean;
 width?:LayoutLength;height?:LayoutLength;minWidth?:LayoutLength;minHeight?:LayoutLength;maxWidth?:LayoutLength;maxHeight?:LayoutLength;
 padding?:LayoutEdges;margin?:LayoutEdges;gap?:Signal<number>;rowGap?:Signal<number>;columnGap?:Signal<number>;
 align?:'start'|'center'|'end'|'stretch'|'baseline';alignSelf?:'auto'|'start'|'center'|'end'|'stretch'|'baseline';justify?:'start'|'center'|'end'|'space-between'|'space-around'|'space-evenly';
 grow?:Signal<number>;shrink?:Signal<number>;basis?:LayoutLength;position?:'relative'|'absolute';left?:LayoutLength;top?:LayoutLength;right?:LayoutLength;bottom?:LayoutLength;
 /** Equal columns, source-order rows; spans/placement/subgrid are outside this profile. */
 gridColumns?:number;
}
type Store=ReturnType<typeof createTreeStore>;type GeometryCache=ReturnType<typeof createGeometryCache>;
type Box={left:number;top:number;width:number;height:number};
const flow=(n:Node2D)=>n.kind==='group'&&Boolean(n.layout?.display==='flex'||n.layout?.direction||n.layout?.gridColumns!==undefined);
const empty=():Bounds2D=>({left:0,top:0,right:0,bottom:0});
const union=(a:Bounds2D,b:Bounds2D):Bounds2D=>({left:Math.min(a.left,b.left),top:Math.min(a.top,b.top),right:Math.max(a.right,b.right),bottom:Math.max(a.bottom,b.bottom)});
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function sample(v:LayoutLength|undefined,c:FrameContext|undefined,name:string):number|string|undefined {if(v===undefined)return;if(typeof v==='string'){if(v==='auto')return v;const n=Number(v.slice(0,-1));if(!v.endsWith('%')||!Number.isFinite(n)||n<0&&/^(width|height|minWidth|minHeight|maxWidth|maxHeight|basis|padding)$/.test(name))error2D('E_NATIVE_2D_LAYOUT',name+' requires a numeric px value, a percentage or auto');return n+'%';}return number2D(v,c,name,/^(width|height|minWidth|minHeight|maxWidth|maxHeight|basis|padding)$/.test(name)?0:-Infinity);}
function edges(v:LayoutEdges|undefined,c:FrameContext|undefined,name:string){if(v===undefined)return[0,0,0,0];const values:readonly LayoutLength[]=Array.isArray(v)?v as readonly LayoutLength[]:[v as LayoutLength];if(![1,2,4].includes(values.length))error2D('E_NATIVE_2D_LAYOUT',name+' requires one, two or four values');const p=values.map(v=>sample(v,c,name)!);return p.length===1?[p[0],p[0],p[0],p[0]]:p.length===2?[p[0],p[1],p[0],p[1]]:p;}
function length(node:F.Node,method:string,value:number|string|undefined){if(value===undefined)return;if(value==='auto'){if(!['setWidth','setHeight','setFlexBasis','setMargin'].includes(method))error2D('E_NATIVE_2D_LAYOUT',method+' does not support auto in this profile');(node as any)[method+'Auto']();}else if(typeof value==='string')(node as any)[method+'Percent'](Number(value.slice(0,-1)));else(node as any)[method](value);}
function edge(node:F.Node,kind:'Padding'|'Margin'|'Position',side:number,value:number|string){if(value==='auto'){if(kind!=='Margin')error2D('E_NATIVE_2D_LAYOUT','auto is supported only for margins');node.setMarginAuto(side);}else if(typeof value==='string')(node as any)['set'+kind+'Percent'](side,Number(value.slice(0,-1)));else(node as any)['set'+kind](side,value);}
const alignment={start:F.ALIGN_FLEX_START,center:F.ALIGN_CENTER,end:F.ALIGN_FLEX_END,stretch:F.ALIGN_STRETCH,baseline:F.ALIGN_BASELINE,auto:F.ALIGN_AUTO};
const justification={start:F.JUSTIFY_FLEX_START,center:F.JUSTIFY_CENTER,end:F.JUSTIFY_FLEX_END,'space-between':F.JUSTIFY_SPACE_BETWEEN,'space-around':F.JUSTIFY_SPACE_AROUND,'space-evenly':F.JUSTIFY_SPACE_EVENLY};
const directions={row:F.FLEX_DIRECTION_ROW,column:F.FLEX_DIRECTION_COLUMN,'row-reverse':F.FLEX_DIRECTION_ROW_REVERSE,'column-reverse':F.FLEX_DIRECTION_COLUMN_REVERSE};
export function canInitializeLayout(root:Node2D){const stack=[root];while(stack.length){const n=stack.pop()!;if(n.layout){const values:unknown[]=[n.layout];while(values.length){const v=values.pop();if(v&&typeof v==='object'){if('$expr'in v||'$keyframes'in v||'$spring'in v)return false;values.push(...Object.values(v));}}}if(n.kind==='group')for(const child of n.children)stack.push(child);}return true;}

/** One cached layout tree per scene. Style/geometry changes invalidate layout;
 * plain paint and animation transforms do not. Real text measurement is awaited
 * until constraints settle; provisional sizes never escape this async boundary. */
export function createLayoutResolver(services:Services2D,viewport:readonly[number,number],geometry:GeometryCache,options:{maxBytes:number;maxPasses:number}){
 let lastKey='',boxes=new Map<string,Box>(),intrinsic=new Map<string,Bounds2D>(),root:F.Node|undefined,layouts=0,hits=0,textPreparations=0;
 const textCache=new Map<string,PreparedText2D>();
 const textKey=(n:Extract<Node2D,{kind:'text'}>,c:FrameContext,w?:number)=>geometryKey(n,c,0)+':'+w;
 const prepareText=async(n:Extract<Node2D,{kind:'text'}>,c:FrameContext|undefined,w?:number)=>{if(!c||!services.text)error2D('E_NATIVE_2D_SERVICE','Layout text needs an admitted real font/layout service and actual FrameContext',n.id);const key=textKey(n,c,w),cached=textCache.get(key);if(cached)return cached;const result=await services.text.prepare({...n,width:w??n.width},c,viewport);textPreparations++;textCache.set(key,result);return result;};
 return {async resolve(store:Store,c:FrameContext|undefined):Promise<Store&{layoutOffset?:(id:string)=>readonly[number,number]|undefined}>{
  const authored=store.index();if(![...authored.byId.values()].some(n=>n.layout))return store;
  const styles=new Map<string,any>();for(const n of authored.byId.values()){
   const style=n.layout??{},allowed=['display','direction','wrap','width','height','minWidth','minHeight','maxWidth','maxHeight','padding','margin','gap','rowGap','columnGap','align','alignSelf','justify','grow','shrink','basis','position','left','top','right','bottom','gridColumns'];for(const key of Object.keys(style))if(!allowed.includes(key))error2D('E_NATIVE_2D_LAYOUT','Unknown layout property '+key,n.id);
   const out:any={...style};for(const key of ['width','height','minWidth','minHeight','maxWidth','maxHeight','basis','left','top','right','bottom'] as const)out[key]=sample(style[key],c,key);for(const key of ['gap','rowGap','columnGap','grow','shrink'] as const)if(style[key]!==undefined)out[key]=number2D(style[key]!,c,key,0);out.padding=edges(style.padding,c,'padding');out.margin=edges(style.margin,c,'margin');
   if(style.direction&&!Object.hasOwn(directions,style.direction)||style.align&&!Object.hasOwn(alignment,style.align)||style.alignSelf&&!Object.hasOwn(alignment,style.alignSelf)||style.justify&&!Object.hasOwn(justification,style.justify)||style.position&&!['relative','absolute'].includes(style.position)||style.display&&!['flex','none'].includes(style.display)||style.wrap!==undefined&&typeof style.wrap!=='boolean')error2D('E_NATIVE_2D_LAYOUT','Known layout enum required',n.id);
   if(n.kind!=='group'&&(style.direction!==undefined||style.wrap!==undefined||style.display==='flex'||style.gridColumns!==undefined||style.padding!==undefined))error2D('E_NATIVE_2D_LAYOUT','Container flow/grid/padding apply to Group nodes',n.id);
   if(style.gridColumns!==undefined&&(!Number.isSafeInteger(style.gridColumns)||style.gridColumns<1))error2D('E_NATIVE_2D_LAYOUT','Positive representable equal-column count required',n.id);styles.set(n.id,out);
  }
  const key=JSON.stringify([...authored.byId.values()].map(n=>[n.id,authored.parent.get(n.id),store.revision(n.id).layout,geometryKey(n,c,store.revision(n.id).geometry),styles.get(n.id)]));
  if(lastKey===key){hits++;}else{
   lastKey='';root?.freeRecursive();root=undefined;boxes.clear();intrinsic.clear();textCache.clear();
   let planned=authored.descriptorBytes;for(const n of [...authored.byId.values()].reverse()){
    let bounds:Bounds2D=empty();if(n.kind==='group'){let first=true;for(const child of n.children){const b=intrinsic.get(child.id)??empty();bounds=first?b:union(bounds,b);first=false;}}
    else if(n.kind==='image'){const size='resource'in n.source?n.source.resource.size:n.source.size;bounds={left:0,top:0,right:number2D(n.width??size[0],c,'image width',0),bottom:number2D(n.height??size[1],c,'image height',0)};}
    else if(n.kind==='text'){const p=await prepareText(n,c);bounds=p.bounds;planned+=p.mesh.positions.length*8;}
    else {const result=await geometry.get(n,c,store.revision(n.id).geometry);let first=true;for(const p of result.parts){bounds=first?p.bounds:union(bounds,p.bounds);first=false;}}
    planned+=1024;if(planned>options.maxBytes)error2D('E_NATIVE_2D_BUDGET','Layout tree exceeds configured byte plan');intrinsic.set(n.id,bounds);
   }
   const engine=new Map<string,F.Node>(),pending=new Map<string,{node:Extract<Node2D,{kind:'text'}>;width:number}>();
   for(const n of authored.byId.values()){
    const e=F.Node.create({defaults:'css'}),s=styles.get(n.id),b=intrinsic.get(n.id)!;engine.set(n.id,e);const parent=authored.parent.get(n.id),inFlow=parent&&flow(authored.byId.get(parent)!);
    e.setPositionType(s.position==='absolute'||parent&&!inFlow?F.POSITION_TYPE_ABSOLUTE:F.POSITION_TYPE_RELATIVE);
    if(s.display==='none')e.setDisplay(F.DISPLAY_NONE);
    if(n.kind==='group'){e.setFlexDirection(directions[s.direction as keyof typeof directions]??F.FLEX_DIRECTION_ROW);e.setFlexWrap(s.wrap||s.gridColumns?F.WRAP_WRAP:F.WRAP_NO_WRAP);e.setGap(F.GUTTER_ROW,s.rowGap??s.gap??0);e.setGap(F.GUTTER_COLUMN,s.columnGap??s.gap??0);}
    if(s.align)e.setAlignItems(alignment[s.align as keyof typeof alignment]);if(s.alignSelf)e.setAlignSelf(alignment[s.alignSelf as keyof typeof alignment]);if(s.justify)e.setJustifyContent(justification[s.justify as keyof typeof justification]);if(s.grow!==undefined)e.setFlexGrow(s.grow);if(s.shrink!==undefined)e.setFlexShrink(s.shrink);
    for(const [property,method]of [['width','setWidth'],['height','setHeight'],['minWidth','setMinWidth'],['minHeight','setMinHeight'],['maxWidth','setMaxWidth'],['maxHeight','setMaxHeight'],['basis','setFlexBasis']])length(e,method,s[property]);
    const natural=n.kind!=='group'||!flow(n);if(s.width===undefined&&(natural||!parent))e.setWidth(!parent?viewport[0]:Math.max(0,b.right-b.left));if(s.height===undefined&&(natural||!parent))e.setHeight(!parent?viewport[1]:Math.max(0,b.bottom-b.top));
    for(const [index,side]of [F.EDGE_TOP,F.EDGE_RIGHT,F.EDGE_BOTTOM,F.EDGE_LEFT].entries()){edge(e,'Padding',side,s.padding[index]);edge(e,'Margin',side,s.margin[index]);}for(const [name,side]of [['left',F.EDGE_LEFT],['top',F.EDGE_TOP],['right',F.EDGE_RIGHT],['bottom',F.EDGE_BOTTOM]] as const)if(s[name]!==undefined)edge(e,'Position',side,s[name]);
    if(n.kind==='text'){
     const naturalText=await prepareText(n,c);if(s.width===undefined)e.setWidthAuto();if(s.height===undefined)e.setHeightAuto();
     e.setMeasureFunc((w,wm)=>{const width=wm===F.MEASURE_MODE_UNDEFINED?undefined:w,k=textKey(n,c!,width),prepared=textCache.get(k);if(!prepared&&width!==undefined)pending.set(k,{node:n,width});const actual=prepared??naturalText,ink=actual.bounds.right-actual.bounds.left;return{width:wm===F.MEASURE_MODE_EXACTLY?w:width===undefined?ink:Math.min(width,ink),height:actual.bounds.bottom-actual.bounds.top};});e.setBaselineFunc(()=>naturalText.baseline);
    }
    if(parent)engine.get(parent)!.insertChild(e,engine.get(parent)!.getChildCount());else root=e;
   }
   let settled=false;for(let pass=0;pass<options.maxPasses;pass++){
    pending.clear();root!.calculateLayout(viewport[0],viewport[1],F.DIRECTION_LTR);let gridChanged=false;
    for(const n of authored.byId.values())if(n.kind==='group'&&n.layout?.gridColumns){const e=engine.get(n.id)!,s=styles.get(n.id),columns=s.gridColumns,width=e.getComputedWidth()-e.getComputedPadding(F.EDGE_LEFT)-e.getComputedPadding(F.EDGE_RIGHT),cell=(width-(columns-1)*(s.columnGap??s.gap??0))/columns;if(!Number.isFinite(cell)||cell<0)error2D('E_NATIVE_2D_LAYOUT','Grid columns/gap exceed its definite content width',n.id);for(const child of n.children)if(child.layout?.position!=='absolute'){const ce=engine.get(child.id)!;if(!same(ce.getWidth(),{value:cell,unit:F.UNIT_POINT})){ce.setWidth(cell);ce.setFlexShrink(0);gridChanged=true;}}}
    if(!pending.size&&!gridChanged){settled=true;break;}for(const request of pending.values()){await prepareText(request.node,c,request.width);engine.get(request.node.id)!.markDirty();}
   }
   if(!settled)error2D('E_NATIVE_2D_LAYOUT','Layout/text constraints did not settle within configured maxLayoutPasses');
   for(const [id,e]of engine){const b={left:e.getComputedLeft(),top:e.getComputedTop(),width:e.getComputedWidth(),height:e.getComputedHeight()};if(Object.values(b).some(v=>!Number.isFinite(v))||b.width<0||b.height<0)error2D('E_NATIVE_2D_LAYOUT','Nonfinite/negative resolved box',id);boxes.set(id,b);}lastKey=key;layouts++;
  }
  const effective=new Map<string,Node2D>(),offsets=new Map<string,readonly[number,number]>();for(const n of authored.byId.values()){
   const parent=authored.parent.get(n.id),participates=Boolean(n.layout||parent&&flow(authored.byId.get(parent)!)),b=boxes.get(n.id)!;if(!participates){effective.set(n.id,n);continue;}
   offsets.set(n.id,[b.left,b.top]);const out={...n,visible:n.visible!==false&&n.layout?.display!=='none'} as Node2D;
   if(out.kind==='shape'&&out.shape.kind==='rect')out.shape={...out.shape,width:b.width,height:b.height};else if(out.kind==='shape'&&out.shape.kind==='ellipse'){out.shape={kind:'ellipse',radius:[b.width/2,b.height/2]};offsets.set(n.id,[b.left+b.width/2,b.top+b.height/2]);}else if(out.kind==='shape'){const ink=intrinsic.get(n.id)!,w=ink.right-ink.left,h=ink.bottom-ink.top,fit:Matrix2D=[w?b.width/w:1,0,0,h?b.height/h:1,w?-ink.left*b.width/w:0,h?-ink.top*b.height/h:0];out.matrix=multiply2D(n.matrix??identity2D,fit);}else if(out.kind==='image'){out.width=b.width;out.height=b.height;}else if(out.kind==='text')out.width=b.width;
   effective.set(n.id,out);
  }
  // Shared identities/children still define painter order; only local frame layout is overlaid.
  return{...store,index:()=>({...authored,byId:effective}),root:()=>effective.get(store.root().id)!,layoutOffset:(id:string)=>offsets.get(id)};
 },inspect:()=>({layouts,hits,textPreparations,boxes:Object.fromEntries(boxes),algorithm:'fixed flexily0.8.3 Node, no synthetic text measurer'}),dispose(){root?.freeRecursive();root=undefined;lastKey='';boxes.clear();intrinsic.clear();textCache.clear();}};
}
