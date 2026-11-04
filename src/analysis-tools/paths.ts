import {lstat,realpath,mkdir,readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname,join} from 'node:path';
import {EngineError} from '../core/errors.ts';

export function toolError(code:string,message:string,details?:unknown):never {throw new EngineError(code,message,{details});}
export const inside=(root:string,path:string)=>{const r=relative(root,path);return r!== '..'&&!r.startsWith('..\\')&&!r.startsWith('../')&&!isAbsolute(r);};
/** An explicit project root is the filesystem grant. Descendant links never widen it. */
export class AnalysisPaths {
  constructor(readonly root:string){}
  static async create(root:string){root=await realpath(resolve(root));if(!(await lstat(root)).isDirectory())toolError('E_ANALYSIS_PROJECT','Expected a project directory');return new AnalysisPaths(root);}
  async check(path:string,createParents=false):Promise<string> {
    path=resolve(this.root,path);if(!inside(this.root,path)||path===this.root)toolError('E_ANALYSIS_PATH','Path must stay below the selected project');
    const parts=relative(this.root,path).split(/[\\/]/);let cursor=this.root;
    for(let i=0;i<parts.length;i++){
      cursor=join(cursor,parts[i]);
      try{const info=await lstat(cursor);if(info.isSymbolicLink()||!inside(this.root,await realpath(cursor)))toolError('E_ANALYSIS_PATH','Links cannot extend analysis filesystem access');if(i<parts.length-1&&!info.isDirectory())toolError('E_ANALYSIS_PATH','Expected ordinary parent directory');}
      catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;if(createParents&&i<parts.length-1)await mkdir(cursor);}
    }
    return path;
  }
  async input(path:string,maxBytes=1024*1024*1024) {
    path=await this.check(path);const info=await lstat(path);if(!info.isFile()||info.size>maxBytes)toolError('E_ANALYSIS_INPUT','Expected an ordinary input file within its byte budget');return path;
  }
  async json(path:string,maxBytes=128*1024):Promise<any> {path=await this.input(path,maxBytes);try{return JSON.parse(await readFile(path,'utf8'));}catch(e){return toolError('E_ANALYSIS_JSON','Invalid analysis metadata JSON',String(e));}}
  async managed(name:string) {const path=await this.check(`.frameweave/analysis-tools/${name}/.boundary`,true);return dirname(path);}
}
