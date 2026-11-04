import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {readFile,realpath} from 'node:fs/promises';
import {dirname,extname,isAbsolute,relative,resolve} from 'node:path';
import {EngineError} from '../core/errors.ts';
import {assetMime,decodeDataResource} from './assets.ts';

interface SvgOptions {file?:string;owner?:string;maxBytes?:number}
/** SVG image documents cannot reliably fetch sibling assets in Chromium. Embed
 * supported image edges before rendering/export; reject unhandled external edges.
 * XML is parsed without executing scripts, fetching URLs, or resolving entities.
 */
export async function embedSvg(bytes:Buffer,options:SvgOptions={}):Promise<{bytes:Buffer;dependencies:string[]}>{
  const limit=options.maxBytes??32*1024*1024,dependencies=new Set<string>(),active=new Set<string>(),cache=new Map<string,Buffer>();let used=0,count=0;
  function fail(message:string):never{throw new EngineError('E_SVG_RESOURCE',`${options.file??'Embedded SVG'}: ${message}`);}
  const within=(owner:string,path:string)=>{const r=relative(owner,path);return r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!isAbsolute(r);};
  async function rewrite(input:Buffer,file:string|undefined,owner:string|undefined,depth:number):Promise<Buffer>{
    used+=input.length;if(used>limit||depth>8)fail('SVG dependency budget exceeded (bytes/depth)');
    const errors:string[]=[];
    const doc=new DOMParser({errorHandler:{warning:m=>errors.push(m),error:m=>errors.push(m),fatalError:m=>errors.push(m)}}).parseFromString(input.toString('utf8'),'image/svg+xml');
    if(errors.length||!doc?.documentElement||doc.documentElement.localName!=='svg')fail(`Malformed SVG: ${errors.join('; ')}`);
    if(doc.doctype)fail('DOCTYPE/entity declarations are unsupported');
    for(let node=doc.firstChild;node;node=node.nextSibling)if(node.nodeType===7&&node.nodeName!=='xml')fail('SVG processing instructions are unsupported');
    let changed=false;
    const elements=Array.from(doc.getElementsByTagName('*'));
    if(elements.length>20000)fail('SVG node budget exceeded');
    function css(text:string){
      const clean=text.replace(/\/\*[\s\S]*?\*\//g,'');
      if(clean.includes('\\')||/@import\b|(?:image-set|image)\s*\(/i.test(clean))fail('SVG CSS escapes/imports/image functions are unsupported for dependency collection');
      for(const match of clean.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi))if(!/^#[^\s]+$/.test(match[2].trim()))fail(`SVG CSS external url() is unsupported: ${match[2]}`);
    }
    for(const element of elements){
      const name=element.localName;
      if(['script','foreignObject','animate','animateMotion','animateTransform','set','discard'].includes(name))fail(`Unsupported SVG executable/HTML/animation element: ${name}`);
      if(element.hasAttribute('xml:base'))fail('xml:base is unsupported');
      for(let node=element.firstChild;node;node=node.nextSibling)if(node.nodeType===7)fail('SVG processing instructions are unsupported');
      if(name==='style')css(element.textContent??'');
      for(const attribute of Array.from(element.attributes)){
        if(attribute.namespaceURI==='http://www.w3.org/XML/1998/namespace'&&attribute.localName==='base')fail('xml:base is unsupported');
        if(/^on/i.test(attribute.name))fail('SVG event handlers are unsupported');
        if(/url\s*\(|@import|\\/i.test(attribute.value))css(attribute.value);
        if(attribute.localName!=='href'&&attribute.name!=='href')continue;
        const reference=attribute.value.trim();if(!reference||reference.startsWith('#'))continue;
        if(!['image','feImage'].includes(name))fail(`External ${name} href is unsupported: ${reference}`);
        if(++count>256)fail('SVG dependency count exceeds 256');
        let content:Buffer,extension:string;
        if(reference.startsWith('data:')){
          let data:ReturnType<typeof decodeDataResource>;try{data=decodeDataResource(reference);}catch{fail('Invalid embedded SVG image data URL');}
          content=data.bytes;extension=data.extension;
          if(extension==='.svg'){const embedded=await rewrite(content,undefined,undefined,depth+1);if(!embedded.equals(content)){attribute.value=`data:image/svg+xml;base64,${embedded.toString('base64')}`;changed=true;}}
          else {if(!['.png','.jpg','.jpeg','.webp'].includes(extension))fail(`Unsupported embedded SVG image format: ${extension}`);used+=content.length;if(used>limit)fail('SVG byte budget exceeded');}
          continue;
        }
        if(/^[a-z][a-z0-9+.-]*:/i.test(reference)||reference.startsWith('//')||isAbsolute(reference)||/[?#]/.test(reference))fail(`SVG image must be a local file without query/fragment: ${reference}`);
        if(!file||!owner)fail(`Relative dependency has no filesystem base: ${reference}`);
        let path:string,base:string;try{path=await realpath(resolve(dirname(file),decodeURIComponent(reference)));base=await realpath(owner);}catch{fail(`Missing or invalid SVG image dependency: ${reference}`);}
        if(!within(base,path))fail(`SVG dependency escapes its project/plugin root: ${reference}`);
        if(active.has(path))fail(`SVG dependency cycle: ${reference}`);
        dependencies.add(path);extension=extname(path).toLowerCase();
        if(!['.svg','.png','.jpg','.jpeg','.webp'].includes(extension))fail(`Unsupported SVG image format: ${extension}`);
        content=cache.get(path)??await readFile(path);
        if(!cache.has(path)){if(extension==='.svg'){active.add(path);try{content=await rewrite(content,path,base,depth+1);}finally{active.delete(path);}}else{used+=content.length;if(used>limit)fail('SVG byte budget exceeded');}cache.set(path,content);}
        attribute.value=`data:${assetMime[extension]};base64,${content.toString('base64')}`;changed=true;
      }
    }
    if(!changed)return input;
    const result=Buffer.from(new XMLSerializer().serializeToString(doc));if(result.length>limit)fail('Embedded SVG exceeds byte budget');return result;
  }
  if(options.file)active.add(await realpath(options.file));
  const result=await rewrite(bytes,options.file,options.owner,0);return {bytes:result,dependencies:[...dependencies]};
}
