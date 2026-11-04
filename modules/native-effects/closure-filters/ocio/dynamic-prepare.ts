import {EngineError} from '../../../../src/core/errors.ts';
import type {OcioUniform,OcioUniformType} from './uniforms.ts';
import {validateUniforms} from './uniforms.ts';
export interface ExtractedUniform{symbol:string;type:OcioUniformType;values:(number|boolean)[]}
/** Fixed official uniform types. No new GLSL parser: declarations are exact
 * OCIO symbols, and the existing Naga compiler still validates every result. */
export function bindUniforms(source:string,uniforms:readonly ExtractedUniform[],aliases:Readonly<Record<string,string>>={}){
 const fail:(message:string)=>never=(message:string):never=>{throw new EngineError('E_NATIVE_OCIO_UNIFORM',message);},layout:OcioUniform[]=[],names=new Set<string>();let code=source,functions='',offset=0;
 if(!aliases||typeof aliases!=='object'||Array.isArray(aliases)||Object.entries(aliases).some(([name,symbol])=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||typeof symbol!=='string'||!uniforms.some(u=>u.symbol===symbol))||new Set(Object.values(aliases)).size!==Object.keys(aliases).length)fail('Aliases must map distinct documented names to exact extracted uniform symbols');
 for(const [j,u]of uniforms.entries()){
  if(!u||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(u.symbol)||!Array.isArray(u.values))fail('Invalid extracted uniform');const symbol=u.symbol,match=code.match(new RegExp('uniform\\s+(float|bool|vec3|int)\\s+'+symbol+'\\s*(?:\\[\\s*(\\d+)\\s*\\])?\\s*;'));
  if(!match)fail('Missing exact uniform declaration: '+symbol);const array=u.type==='float-array'||u.type==='int-array',type=u.type==='float'?'float':u.type==='bool'?'bool':u.type==='float3'?'vec3':u.type==='int-array'?'int':'float',length=u.type==='float3'?3:array?Number(match![2]):1;
  if(match![1]!==type||array!==Boolean(match![2])||!Number.isSafeInteger(length)||length<1||u.values.length>length||!array&&u.values.length!==length)fail('Uniform type/shape differs from official declaration: '+symbol);
  const name=Object.entries(aliases).find(([,value])=>value===symbol)?.[0]??symbol;if(names.has(name))fail('Duplicate uniform public name: '+name);names.add(name);
  const defaults=new Uint32Array(length),floats=new Float32Array(defaults.buffer),ints=new Int32Array(defaults.buffer);for(let k=0;k<u.values.length;k++){const v=u.values[k];if(u.type==='bool'){if(typeof v!=='boolean')fail('Official boolean default changed');defaults[k]=Number(v);}else if(u.type==='int-array'){if(typeof v!=='number'||!Number.isInteger(v)||v< -2147483648||v>2147483647)fail('Official Int32 default changed');ints[k]=v;}else{if(typeof v!=='number'||!Number.isFinite(v)||!Number.isFinite(Math.fround(v)))fail('Official Float32 default changed');floats[k]=v;}}layout.push({name,symbol,type:u.type,length,offset,defaultWords:Array.from(defaults)});
  const fn='ocio_uniform_'+j,at=(index:string)=>`ocio_dynamic_data(${offset}u+${index})`,value=(index:string)=>type==='bool'?`(${at(index)}!=0u)`:type==='int'?`int(${at(index)})`:`uintBitsToFloat(${at(index)})`,body=type==='vec3'?`vec3(${value('0u')},${value('1u')},${value('2u')})`:value(array?'uint(i)':'0u');
  code=code.replace(match![0],'');if(array){const edits:{at:number;length:number;text:string}[]=[];for(const m of code.matchAll(new RegExp('\\b'+symbol+'\\s*\\[','g'))){const start=m.index!,open=start+m[0].length-1;let depth=1,end=open+1;for(;end<code.length;end++){if(code[end]==='[')depth++;else if(code[end]===']'&&--depth===0)break;}if(depth)fail('Unbalanced official array reference: '+symbol);edits.push({at:start,length:m[0].length,text:fn+'('},{at:end,length:1,text:')'});}for(const e of edits.sort((a,b)=>b.at-a.at))code=code.slice(0,e.at)+e.text+code.slice(e.at+e.length);}else code=code.replace(new RegExp('\\b'+symbol+'\\b','g'),fn+'()');
  if(new RegExp('\\b'+symbol+'\\b').test(code))fail('Unsupported uniform reference form: '+symbol);
  functions+=`${type} ${fn}(${array?'int i':''}){return ${body};}\n`;offset+=length;
 }
 if(layout.length)validateUniforms(layout);
 return {glsl:code,functions,layout};
}
