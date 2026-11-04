import type {NativeProgram} from './client.ts';

type Kernel=NativeProgram['kernels'][number];
type Pass=NativeProgram['passes'][number];

const f32Store='  if(half){value=vec4f(fw_half(value.r),fw_half(value.g),fw_half(value.b),fw_half(value.a));}\n  fw_output[index]=value;';
const packedStore=`  fw_output[index]=vec2u(fw_half_bits(value.r)|(fw_half_bits(value.g)<<16u),
                         fw_half_bits(value.b)|(fw_half_bits(value.a)<<16u));`;
// Same binary16 RNE, overflow and canonical NaN rules as the wide pixel wrapper.
// Integer packing preserves binary16 subnormals without a second quantization.
const halfBits=`fn fw_half_bits(v:f32)->u32{
 let bits=bitcast<u32>(v);let sign=(bits>>16u)&0x8000u;
 let e=i32((bits>>23u)&255u)-127;let m=bits&0x7fffffu;
 if(e==128){return sign|0x7c00u|select(0u,0x0200u,m!=0u);}
 if(e>15){return sign|0x7c00u;}
 var h=0u;
 if(e>=-25){
  if(e < -14){let shift=u32(-e-1);let x=m|0x800000u;h=x>>shift;let r=x&((1u<<shift)-1u);let tie=1u<<(shift-1u);h+=select(0u,1u,r>tie||(r==tie&&(h&1u)!=0u));}
  else{h=(u32(e+15)<<10u)|(m>>13u);let r=m&8191u;h+=select(0u,1u,r>4096u||(r==4096u&&(h&1u)!=0u));}
 }
 return sign|h;
}
`;

function canPack(pass:Pass,kernel:Kernel){
 return !pass.buffers&&!pass.draw&&pass.module===undefined&&pass.inference===undefined&&!pass.state&&!pass.rayBuild&&pass.rayQuery===undefined&&
  (kernel.kind===undefined||kernel.kind==='color')&&kernel.inputCount<=4&&!kernel.code.includes("fw_errors")&&kernel.code.includes(f32Store)&&
  pass.inputs.every((_,i)=>kernel.code.includes(`fw_input${i}:array<vec4f>;`)&&
    kernel.code.includes(`return fw_input${i}[u32(p.y)*d.x+u32(p.x)];`));
}

function specialize(kernel:Kernel,mask:number):Kernel {
 let code=kernel.code;
 for(let i=0;i<kernel.inputCount;i++){
  if(!(mask&(2<<i)))continue;
  code=code.replace(`fw_input${i}:array<vec4f>;`,`fw_input${i}:array<vec2u>;`)
   .replace(`return fw_input${i}[u32(p.y)*d.x+u32(p.x)];`,
            `let bits=fw_input${i}[u32(p.y)*d.x+u32(p.x)];return vec4f(unpack2x16float(bits.x),unpack2x16float(bits.y));`);
 }
 if(mask&1)code=halfBits+code.replace('fw_output:array<vec4f>;','fw_output:array<vec2u>;').replace(f32Store,packedStore);
 return {...kernel,code,packedMask:mask};
}

/** Physical layout lowering on a private GPU plan. Logical Surface metadata
 * and the author's F32 arithmetic stay intact. Only compatible consumers may
 * read packed images. Wide buffers are kept at every external boundary. */
export function packNativeF16Intermediates(program:NativeProgram,final:number){
 if(program.frameContinuation||program.stateContinuation||program.images.some(i=>i.storage))return false;
 const candidates=new Set<number>(),wide=new Set<number>([final]);
 const last=[...program.passes].reverse().find(p=>!p.buffers);
 if(last)wide.add(last.output);
 if(program.display)wide.add(program.display.image);
 if(program.export)wide.add(program.export.image);
 if(program.mediaExport)wide.add(program.mediaExport.image);
 for(const d of program.data??[])if(d.sourceImage!==undefined)wide.add(d.sourceImage);
 for(const i of program.imports??[])wide.add(i.image);
 for(const pass of program.passes){
  if(canPack(pass,program.kernels[pass.kernel])){
   if(program.images[pass.output].format==='rgba16float')candidates.add(pass.output);
  }else for(const input of pass.inputs)wide.add(input);
 }
 for(const image of wide)candidates.delete(image);
 if(!candidates.size)return false;
 program.images=program.images.map((image,i)=>candidates.has(i)?{...image,storage:'packed-f16-v1'}:image);
 const kernels:Kernel[]=[],indices=new Map<string,number>();
 program.passes=program.passes.map(pass=>{
  const mask=pass.buffers?0:pass.inputs.reduce((n,input,i)=>candidates.has(input)?n|(2<<i):n,Number(candidates.has(pass.output)));
  const key=pass.kernel+':'+mask;
  let index=indices.get(key);
  if(index===undefined){
   const kernel=program.kernels[pass.kernel];
   index=kernels.push(mask?specialize(kernel,mask):kernel)-1;
   indices.set(key,index);
  }
  return {...pass,kernel:index};
 });
 program.kernels=kernels;
 return true;
}
