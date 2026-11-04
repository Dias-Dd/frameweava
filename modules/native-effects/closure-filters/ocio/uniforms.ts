import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import {fail} from '../control.ts';
export type OcioUniformType='float'|'bool'|'float3'|'float-array'|'int-array';
export interface OcioUniform {readonly name:string;readonly symbol:string;readonly type:OcioUniformType;readonly length:number;readonly offset:number;readonly defaultWords:readonly number[]}
export type OcioUniformValue=Signal<number>|boolean|readonly(Signal<number>|boolean)[];
export type OcioUniformValues=Readonly<Record<string,OcioUniformValue>>;
const identifier=/^[A-Za-z_][A-Za-z0-9_]*$/;
export function validateUniforms(value:readonly OcioUniform[]){
 if(!Array.isArray(value)||!value.length)fail('ocio','uniforms','nonempty typed uniform layout');
 const names=new Set<string>(),symbols=new Set<string>();let offset=0;
 for(const [i,u]of Array.from(value).entries()){
  if(!u||typeof u!=='object'||Array.isArray(u)||Object.keys(u).some(k=>!['name','symbol','type','length','offset','defaultWords'].includes(k))||typeof u.name!=='string'||!identifier.test(u.name)||typeof u.symbol!=='string'||!identifier.test(u.symbol)||names.has(u.name)||symbols.has(u.symbol)||!['float','bool','float3','float-array','int-array'].includes(u.type)||!Number.isSafeInteger(u.length)||u.length<1||!Number.isSafeInteger(offset+u.length)||u.offset!==offset||!Array.isArray(u.defaultWords)||u.defaultWords.length!==u.length)fail('ocio','uniforms['+i+']','strict unique typed symbols, contiguous exact slots and default words');
  if(['float','bool'].includes(u.type)&&u.length!==1||u.type==='float3'&&u.length!==3)fail('ocio','uniforms['+i+'].length','one scalar / three vector components');
  if(Array.from(u.defaultWords).some(v=>typeof v!=='number'||!Number.isInteger(v)||v<0||v>0xffffffff))fail('ocio','uniforms['+i+'].defaultWords','exact UInt32 encoding words');
  if(u.type==='bool'&&u.defaultWords[0]>1||u.type!=='bool'&&u.type!=='int-array'&&new Float32Array(Uint32Array.from(u.defaultWords).buffer).some(v=>!Number.isFinite(v)))fail('ocio','uniforms['+i+'].defaultWords','bool 0/1 or finite Float32 bits');
  names.add(u.name);symbols.add(u.symbol);offset+=u.length;
 }
 return offset;
}
/** Exact word transfer, not float reinterpretation of integer values. The
 * prepared shader bitcasts float words and reads integer/bool words directly. */
export function uniformWords(layout:readonly OcioUniform[],values:OcioUniformValues|undefined,context:FrameContext|undefined){
 const length=validateUniforms(layout),words=new Uint32Array(length),floats=new Float32Array(words.buffer),integers=new Int32Array(words.buffer);
 if(values!==undefined&&(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(k=>!layout.some(u=>u.name===k))))fail('ocio','uniforms','known exact prepared names only');
 const resolve=(v:unknown,path:string):unknown=>{if(v&&typeof v==='object'&&!Array.isArray(v)){if(!context)fail('ocio',path,'Signal with explicit FrameContext');return evaluate(v,context!);}return v;};
 for(const u of layout){const supplied=values&&Object.hasOwn(values,u.name)?values[u.name]:undefined,scalar=u.type==='float'||u.type==='bool';let input:readonly unknown[];
  if(supplied===undefined){words.set(u.defaultWords,u.offset);continue;}else if(scalar){if(Array.isArray(supplied))fail('ocio','uniforms.'+u.name,'a scalar');input=[supplied];}else{if(!Array.isArray(supplied)||supplied.length!==u.length)fail('ocio','uniforms.'+u.name,'exact '+u.length+' components');input=supplied as readonly unknown[];}
  for(let j=0;j<u.length;j++){const path='uniforms.'+u.name+'['+j+']',v=resolve(input[j],path),at=u.offset+j;if(u.type==='bool'){if(typeof v!=='boolean')fail('ocio',path,'boolean');words[at]=Number(v);}else if(u.type==='int-array'){if(typeof v!=='number'||!Number.isInteger(v)||v< -2147483648||v>2147483647)fail('ocio',path,'exact Int32');integers[at]=v;}else{if(typeof v!=='number'||!Number.isFinite(v)||!Number.isFinite(Math.fround(v)))fail('ocio',path,'finite Float32-representable number');floats[at]=v;}}
 }
 // OCIO's RGB-curve integer arrays describe variable loop ranges and offsets.
 // Validate their relationship to the sealed table capacities before recording
 // work, rather than trusting robust GPU reads to repair malformed controls.
 const bySymbol=(suffix:string)=>layout.find(u=>u.symbol==='ocio_grading_rgbcurve_'+suffix),ko=bySymbol('knotsOffsets'),co=bySymbol('coefsOffsets'),kn=bySymbol('knots'),cf=bySymbol('coefs');
 if(ko||co||kn||cf){if(!ko||!co||!kn||!cf||ko.type!=='int-array'||co.type!=='int-array'||kn.type!=='float-array'||cf.type!=='float-array'||ko.length!==8||co.length!==8)fail('ocio','uniforms.rgbcurve','complete official four-channel curve layout');
  for(let j=0;j<4;j++){const off=integers[ko.offset+j*2],count=integers[ko.offset+j*2+1],base=integers[co.offset+j*2],size=integers[co.offset+j*2+1],empty=count===0&&size===0;if(empty?(off< -1||off>kn.length||base< -1||base>cf.length):(off<0||count<2||off+count>kn.length||base<0||base+size>cf.length||size!==3*(count-1)))fail('ocio','uniforms.rgbcurve['+j+']','bounded consistent knots/coefficient intervals, or official -1/zero identity sentinel');for(let k=1;k<count;k++)if(floats[kn.offset+off+k]<=floats[kn.offset+off+k-1])fail('ocio','uniforms.rgbcurve['+j+'].knots','strictly increasing curve knots');}
 }
 return words;
}
