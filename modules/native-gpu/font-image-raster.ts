import sharp from 'sharp';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {gunzipSync} from 'node:zlib';
import {EngineError} from '../../src/core/errors.ts';

export interface GlyphRasterOptions {
 format:'png'|'jpeg'|'tiff'|'svg';glyphId:number;width:number;height:number;
 maxBytes:number;maxNodes?:number;maxDepth?:number;
 svg?:{unitsPerEm:number;viewBox:readonly [number,number,number,number];foreground?:readonly [number,number,number,number]};
}
const ns='http://www.w3.org/2000/svg',xlink='http://www.w3.org/1999/xlink';
function fail(code:string,message:string):never{throw new EngineError('E_NATIVE_FONT_IMAGE_'+code,message);}
/** Static OpenType SVG profile. No path/URL/network, scripts, HTML, external
 * fonts or runtime animation. Select glyphN with the specified OpenType use semantics. */
export function glyphSvg(input:Uint8Array,options:GlyphRasterOptions):Buffer{
 const {maxBytes,svg}=options;if(!svg)fail('SVG','An explicit font-unit SVG viewport is required');
 let data=Buffer.from(input.buffer,input.byteOffset,input.byteLength);
 if(data.length>=2&&data[0]===0x1f&&data[1]===0x8b){try{data=gunzipSync(data,{maxOutputLength:maxBytes});}catch{fail('BUDGET','Invalid gzip SVG or inflated SVG exceeds its admission budget');}}
 if(data.length>maxBytes)fail('BUDGET','SVG source exceeds its admission budget');
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{fail('SVG','SVG must be valid UTF-8');}
 if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text))fail('SVG_UNSUPPORTED','DTD and entity declarations are not admitted');
 const errors:string[]=[],doc=new DOMParser({errorHandler:{warning:m=>errors.push(m),error:m=>errors.push(m),fatalError:m=>errors.push(m)}}).parseFromString(text,'image/svg+xml');
 const root=doc?.documentElement;if(errors.length||!root||root.localName!=='svg'||root.namespaceURI!==ns||doc.doctype)fail('SVG','Malformed SVG document');
 const maxNodes=options.maxNodes??Math.max(1,Math.floor(maxBytes/32)),maxDepth=options.maxDepth??Math.max(1,Math.floor(Math.sqrt(maxBytes)));
 const ids=new Map<string,typeof root>(),refs:{from:string;to:string}[]=[];let count=0;
 function css(value:string,from:string){
  const clean=value.replace(/\/\*[\s\S]*?\*\//g,'');
  if(/\\|@import|@font-face|(?:var|image-set|image|expression)\s*\(/i.test(clean))fail('SVG_UNSUPPORTED','External/escaped/variable/executable SVG CSS is not admitted');
  for(const match of clean.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi)){const target=match[2].trim();if(!/^#[^\s]+$/.test(target))fail('SVG_UNSUPPORTED','Only document-local SVG CSS references are admitted');refs.push({from:from||'@document',to:target.slice(1)});}
 }
 const stack:{node:Node;depth:number;parentId:string}[]=[];
 for(let n=doc.firstChild;n;n=n.nextSibling)stack.push({node:n as unknown as Node,depth:0,parentId:''});
 while(stack.length){const {node,depth,parentId}=stack.pop()!;if(++count>maxNodes||depth>maxDepth)fail('BUDGET','SVG node/depth budget exceeded');
  if(node.nodeType===7&&node.nodeName!=='xml')fail('SVG_UNSUPPORTED','SVG processing instructions are not admitted');
  let current=parentId;
  if(node.nodeType===1){const element=node as unknown as typeof root,name=element.localName;
   if(element.namespaceURI!==ns||['script','foreignObject','animate','animateMotion','animateTransform','set','discard','text','tspan','textPath'].some(n=>n.toLowerCase()===name.toLowerCase()))fail('SVG_UNSUPPORTED','Unsupported active/HTML/text/animation SVG element: '+name);
   if(element.hasAttribute('id')){current=element.getAttribute('id')!;if(!current||ids.has(current))fail('SVG','SVG IDs must be unique');ids.set(current,element);if(parentId)refs.push({from:parentId,to:current});}
   if(name==='style')css(element.textContent??'',current);
   for(const a of Array.from(element.attributes)){
    if(/^on/i.test(a.name)||a.name==='xml:base')fail('SVG_UNSUPPORTED','SVG event handlers/base URLs are not admitted');
    css(a.value,current);
    if(a.localName==='href'){
     const ref=a.value.trim();if(!ref.startsWith('#'))fail('SVG_UNSUPPORTED','Only document-local SVG href references are admitted');
     if(current)refs.push({from:current,to:ref.slice(1)});
    }
   }
  }
  for(let child=node.firstChild;child;child=child.nextSibling)stack.push({node:child,depth:depth+1,parentId:current});
 }
 const adjacency=new Map<string,string[]>();for(const r of refs){if(!ids.has(r.to))fail('SVG','Missing SVG reference '+r.to);const row=adjacency.get(r.from)??[];row.push(r.to);adjacency.set(r.from,row);}
 const visiting=new Set<string>(),done=new Set<string>();
 for(const start of adjacency.keys()){
  const work:{id:string;leave:boolean}[]=[{id:start,leave:false}];
  while(work.length){const item=work.pop()!;if(item.leave){visiting.delete(item.id);done.add(item.id);continue;}if(done.has(item.id))continue;if(visiting.has(item.id))fail('SVG','Cyclic SVG use reference');visiting.add(item.id);work.push({id:item.id,leave:true});for(const id of adjacency.get(item.id)??[])work.push({id,leave:false});}
 }
 const target='glyph'+options.glyphId;if(!ids.has(target))fail('SVG','The SVG document does not define '+target);
 const [x,y,w,h]=svg.viewBox;if(![x,y,w,h,svg.unitsPerEm].every(Number.isFinite)||w<=0||h<=0||svg.unitsPerEm<=0)fail('SVG','Finite positive viewport/unitsPerEm required');
 const foreground=svg.foreground??[0,0,0,1];if(foreground.length!==4||foreground.some(n=>!Number.isFinite(n)||n<0||n>1))fail('SVG','Foreground must be straight sRGB RGBA in [0,1]');
 const foregroundCss=`rgba(${foreground.slice(0,3).map(v=>v*255).join(',')},${foreground[3]})`;
 // Preserve authored SVG viewport transforms inside the font-unit crop.
 const outer=doc.createElementNS(ns,'svg');outer.setAttribute('xmlns',ns);outer.setAttribute('xmlns:xlink',xlink);outer.setAttribute('width',String(options.width));outer.setAttribute('height',String(options.height));outer.setAttribute('viewBox',[x,y,w,h].join(' '));outer.setAttribute('preserveAspectRatio','none');outer.setAttribute('color',foregroundCss);
 const inner=root;inner.setAttribute('overflow','visible');inner.setAttribute('clip','auto');if(!inner.hasAttribute('width'))inner.setAttribute('width',String(svg.unitsPerEm));if(!inner.hasAttribute('height'))inner.setAttribute('height',String(svg.unitsPerEm));
 if(inner.getAttribute('id')===target){inner.removeAttribute('id');const glyph=doc.createElementNS(ns,'g');glyph.setAttribute('id',target);while(inner.firstChild)glyph.appendChild(inner.firstChild);inner.appendChild(glyph);}
 const defs=doc.createElementNS(ns,'defs');while(inner.firstChild)defs.appendChild(inner.firstChild);inner.appendChild(defs);
 const use=doc.createElementNS(ns,'use');use.setAttributeNS(xlink,'xlink:href','#'+target);inner.appendChild(use);outer.appendChild(inner);
 const result=Buffer.from(new XMLSerializer().serializeToString(outer));if(result.length>maxBytes)fail('BUDGET','Prepared SVG exceeds admission budget');return result;
}

/** Rasterize a verified embedded payload, never a caller filename or URL.
 * Input artwork is explicitly SDR/sRGB; float color conversion happens afterward. */
export async function rasterGlyph(input:Uint8Array,options:GlyphRasterOptions){
 if(!Number.isSafeInteger(options.maxBytes)||options.maxBytes<1||!Number.isSafeInteger(options.width)||!Number.isSafeInteger(options.height)||options.width<1||options.height<1||options.width*options.height*4>options.maxBytes)fail('BUDGET','Glyph raster exceeds the configured byte budget');
 const payload=options.format==='svg'?glyphSvg(input,options):Buffer.from(input.buffer,input.byteOffset,input.byteLength);
 if(payload.length>options.maxBytes)fail('BUDGET','Embedded image exceeds the byte budget');
 const image=sharp(payload,{limitInputPixels:Math.floor(options.maxBytes/4),animated:false});const meta=await image.metadata();
 if(options.format!=='svg'&&(meta.format!==(options.format==='jpeg'?'jpeg':options.format)||meta.width!==options.width||meta.height!==options.height))fail('SIZE','Bitmap format/dimensions must match the selected strike; resize explicitly in the GPU graph');
 if(meta.pages&&meta.pages!==1)fail('UNSUPPORTED','Multi-page embedded bitmaps are unsupported');
 const decoded=await image.toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(decoded.info.width!==options.width||decoded.info.height!==options.height||decoded.info.channels!==4)fail('SIZE','Raster output differs from the requested viewport');
 return decoded.data;
}
