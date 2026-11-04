import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {userLibraryHome} from './paths.ts';
import type {InstalledPlugin,PluginRegistry,SearchFilter} from './registry.ts';
import {fail} from './schema.ts';

export const embeddingModel={id:'Xenova/paraphrase-multilingual-MiniLM-L12-v2',revision:'2c4055b12046f11709e9df2c122e59ffbdc2f900',dtype:'q8',dimensions:384,license:'Apache-2.0'} as const;
type Extractor=(text:string,options:object)=>Promise<{tolist():unknown}>;
const extractors=new Map<string,Promise<Extractor>>();
async function extractor(offline:boolean):Promise<Extractor>{
  const directory=join(userLibraryHome(),'models'),key=`${directory}:${offline}`;
  if(!extractors.has(key))extractors.set(key,(async()=>{
    const {pipeline}=await import('@huggingface/transformers');
    return await pipeline('feature-extraction',embeddingModel.id,{revision:embeddingModel.revision,dtype:embeddingModel.dtype,device:'cpu',cache_dir:directory,local_files_only:offline,session_options:{intraOpNumThreads:2,interOpNumThreads:1}}) as unknown as Extractor;
  })());
  try{return await extractors.get(key)!;}catch(e){extractors.delete(key);fail('E_SEARCH_MODEL',`Cannot load pinned local embedding model: ${String(e)}. On Windows, use a short FRAMEWEAVE_HOME before provisioning models (native ONNX may reject long paths); run frameweave doctor --json to check. Run effects index online once, or use --mode keyword. No lexical fallback is silently labeled semantic.`);}
}
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
export function documentText({manifest:m}:InstalledPlugin){return [m.name,m.description,...m.tags??[],`Category ${m.kind}; ${m.engine}; inputs ${Object.keys(m.inputs).join(' ')}; outputs ${Object.keys(m.outputs).join(' ')}`].join('\n');}
interface VectorCache {model:typeof embeddingModel;vectors:Record<string,number[]>}
async function readCache():Promise<VectorCache>{try{const c=JSON.parse(await readFile(join(userLibraryHome(),'search-v1.json'),'utf8'));if(JSON.stringify(c.model)===JSON.stringify(embeddingModel)&&c.vectors&&typeof c.vectors==='object')return c;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}return {model:embeddingModel,vectors:{}};}
function valid(v:unknown):v is number[]{return Array.isArray(v)&&v.length===384&&v.every(x=>typeof x==='number'&&Number.isFinite(x));}
async function vectors(texts:string[],offline:boolean){
  const cache=await readCache(),out:number[][]=[];let changed=false;
  for(const text of texts){const key=digest(text);let vector=cache.vectors[key];
    if(!valid(vector)){
      const embed=await extractor(offline),rows=(await embed(text,{pooling:'mean',normalize:true})).tolist();
      vector=(rows as number[][])[0];if(!valid(vector))fail('E_SEARCH_VECTOR','Embedding model returned an invalid vector');cache.vectors[key]=vector;changed=true;
    }out.push(vector);
  }
  if(changed){await mkdir(userLibraryHome(),{recursive:true});const path=join(userLibraryHome(),'search-v1.json'),temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(cache));await rename(temp,path);}
  return out;
}
export async function indexPlugins(registry:PluginRegistry,offline=false,additionalDocuments:string[]=[]){
  const documents=[...registry.list().map(documentText),...additionalDocuments];
  await vectors(documents,offline);
  return {indexed:documents.length,model:embeddingModel,cache:join(userLibraryHome(),'search-v1.json')};
}
function editDistance(a:string,b:string){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){let previous=row[0];row[0]=i+1;for(let j=0;j<b.length;j++){const old=row[j+1];row[j+1]=Math.min(row[j+1]+1,row[j]+1,previous+(a[i]===b[j]?0:1));previous=old;}}return row[b.length];}
export function keywordScore(record:InstalledPlugin,query:string):number {
  return keywordTextScore([record.manifest.id,documentText(record)].join(' '),query);
}
function keywordTextScore(source:string,query:string,wholeShortWords=false):number {
  const text=source.toLocaleLowerCase(),words=text.split(/[^\p{L}\p{N}]+/u),terms=query.toLocaleLowerCase().split(/[\s,]+/).filter(Boolean);
  if(!terms.length)return 1;
  const ascii=wholeShortWords?text.match(/[a-z0-9]+/g)??[]:[];
  const score=terms.reduce((sum,term)=>{
    if(wholeShortWords&&/^[a-z]{2,3}$/.test(term))
      return sum+Number(ascii.some(word=>word===term||word.startsWith(term)&&/^[0-9]/.test(word.slice(term.length))));
    return sum+(text.includes(term)?1:term.length>=4&&words.some(word=>Math.abs(word.length-term.length)<=1&&editDistance(word,term)<=1)?.65:0);
  },0)/terms.length;
  return score;
}
interface RankingOptions {mode?:'keyword'|'semantic'|'hybrid';limit?:number;offset?:number;offline?:boolean;wholeShortWords?:boolean}
export async function rankSearchPage<T>(candidates:{item:T;key:string;text:string;keywordText?:string}[],query:string,options:RankingOptions={}){
  const mode=options.mode??'hybrid',limit=options.limit??10,offset=options.offset??0;
  if(!['keyword','semantic','hybrid'].includes(mode)||!Number.isInteger(limit)||limit<1||limit>100)fail('E_ARGUMENT','Search mode must be keyword/semantic/hybrid; limit must be 1..100');
  if(!Number.isSafeInteger(offset)||offset<0)fail('E_ARGUMENT','Search offset must be a nonnegative safe integer');
  if(!candidates.length)return {total:0,results:[]};
  const embedded=mode==='keyword'||!query.trim()?undefined:await vectors([query,...candidates.map(c=>c.text)],!!options.offline);
  const matches=candidates.map(({item,key,text,keywordText},i)=>{
    const lexical=keywordTextScore(keywordText??text,query,options.wholeShortWords),semantic=embedded?embedded[0].reduce((sum,x,j)=>sum+x*embedded[i+1][j],0):0;
    return {item,key,score:mode==='keyword'?lexical:mode==='semantic'?semantic:semantic+.2*lexical,keywordScore:lexical,semanticScore:embedded?semantic:undefined,searchMode:mode};
  }).filter(r=>mode!=='keyword'||r.keywordScore>0).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
  return {total:matches.length,results:matches.slice(offset,offset+limit).map(({key,...result})=>result)};
}
export async function rankSearch<T>(candidates:{item:T;key:string;text:string;keywordText?:string}[],query:string,options:RankingOptions={}){
  return (await rankSearchPage(candidates,query,options)).results;
}
export async function searchPlugins(registry:PluginRegistry,query:string,filters:SearchFilter={},options:RankingOptions={}){
  const candidates=registry.search('',filters).map(record=>{
    const text=documentText(record),key=record.manifest.id;
    return {item:record,key,text,keywordText:key+' '+text};
  });
  return (await rankSearch(candidates,query,options)).map(({item,...ranking})=>({record:item,...ranking}));
}
