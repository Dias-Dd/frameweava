export const CATALOG_API_INDEX='frameweave.catalog-api.json';

export interface CatalogSignature {
  parameters:{name:string;type:string;optional:boolean}[];
  returns:string;
}
export interface CatalogMethodGroup {
  path:string;
  methods:string[];
  signatures?:Record<string,CatalogSignature[]>;
}
export interface CatalogCallable {
  name:string;
  description?:string;
  signatures?:CatalogSignature[];
  groups?:CatalogMethodGroup[];
}
export interface CatalogPackageApi {
  reference:string;
  integrity:string;
  sdkImport?:string;
  callables:CatalogCallable[];
}
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {packageRef,type PackageRecord} from '../packages/manifest.ts';
import {runtimePin} from '../compiler/runtime-lock.ts';


export async function loadCatalogApi(root:string|undefined,records:PackageRecord[]):Promise<CatalogPackageApi[]>{
  if(!root)return [];
  try{
    const index=JSON.parse(await readFile(join(root,CATALOG_API_INDEX),'utf8')) as {schemaVersion:number;packages:CatalogPackageApi[]};
    if(index.schemaVersion!==1)return [];
    const pins=new Map(records.map(record=>[packageRef(record.manifest),record.integrity]));
    return index.packages.filter(entry=>entry.sdkImport?
      entry.integrity===runtimePin.integrity:pins.get(entry.reference)===entry.integrity);
  }catch(error){
    if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
    return [];
  }
}

const topics=[{terms:['滤镜','filter','filters','图像处理','图像特效','image effects','imagestage','image stage'],packageId:'native-image-effects'}];
const aliases:Record<string,string>={
  '模糊':'blur','辉光':'glow','发光':'glow','调色':'grading','抠像':'key','锐化':'sharpen','暗角':'vignette','纸偶':'puppet','图钉':'pin',
};

export function catalogApiGroups(query:string,api:CatalogPackageApi[]){
  query=query.trim().toLowerCase();
  const term=Object.hasOwn(aliases,query)?aliases[query]:query.replace(/\s+/g,'');
  if(!term)return [];
  const includes=(text:string)=>/^[a-z]{2,3}$/.test(term)?
    (text.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().match(/[a-z0-9]+/g)??[])
      .some(word=>word===term||word.startsWith(term)&&/^[0-9]/.test(word.slice(term.length))):
    text.toLowerCase().includes(term);
  return api.flatMap(pack=>{
    const packageId=pack.sdkImport??pack.reference.split('@')[0];
    const wholeFamily=topics.some(topic=>topic.packageId===packageId&&topic.terms.includes(query));
    const groups=pack.callables.flatMap(entry=>(entry.groups??[]).flatMap(group=>{
      if(wholeFamily&&!group.path.includes(' → '))return [];
      const methods=wholeFamily||includes(entry.name)?group.methods:group.methods.filter(includes);
      const signatures=Object.fromEntries(methods.filter(name=>name.toLowerCase()===term&&group.signatures?.[name])
        .map(name=>[name,group.signatures![name]]));
      return methods.length?[{path:group.path,methods,signatures,entry:entry.name,package:pack.reference,
        import:`import { ${entry.name} } from "${packageId}";`,alternatePaths:[] as string[]}]:[];
    }));
    if(!wholeFamily)return groups;
    const unique=new Map<string,typeof groups[number]>();
    for(const group of groups){
      const key=group.methods.join('\0'),other=unique.get(key);
      if(other)other.alternatePaths.push(group.path);
      else unique.set(key,group);
    }
    return [...unique.values()];
  });
}
