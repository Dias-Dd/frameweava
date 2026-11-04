import type {GpuComputeBinding} from './compute-types.ts';

/** Shared typed data helpers. Never introduces ColorEncoding or Alpha. */
export function dataShaderHelpers(bindings:readonly GpuComputeBinding[],o:{header:string;metaBase:number;status:string;slot:string;prefix:string;linearPrefix:string;checked?:boolean}){
 const report=(index:string)=>o.checked===false?'':`atomicMin(&${o.status}[${o.slot}],${index});`;
 return bindings.map((b,i)=>{
  const variable=o.prefix+i,t=b.type,zero=t==='f32'?'0.':t==='u32'?'0u':'0',load=b.atomic?`atomicLoad(&${variable}[index])`:`${variable}[index]`,value=b.atomic?load:t==='u32'?load:`bitcast<${t}>(${load})`,store=b.atomic?`atomicStore(&${variable}[index],value);`:`${variable}[index]=${t==='u32'?'value':'bitcast<u32>(value)'};`,base=o.metaBase+3*i;
  return `
 fn fieldDimensions${i}()->vec3u{return ${o.header}[${base}].xyz;}
 fn fieldComponents${i}()->u32{return ${o.header}[${base}].w;}
 fn fieldOrigin${i}()->vec3u{return ${o.header}[${base+1}].xyz;}
 fn fieldDomain${i}()->vec3u{return ${o.header}[${base+2}].xyz;}
 fn dataLength${i}()->u32{let d=fieldDimensions${i}();return d.x*d.y*d.z*fieldComponents${i}();}
 fn ${o.linearPrefix}${i}(index:u32)->${t}{if(index>=dataLength${i}()){${report('0x80000000u|min(index,0x7ffffffeu)')}return ${zero};}return ${value};}
 fn fw_field${i}(p:vec3i,c:u32,edgeClamp:bool)->${t}{
  var q=p;let domain=vec3i(fieldDomain${i}());if(edgeClamp){q=clamp(q,vec3i(0),domain-1);}else if(any(q<vec3i(0))||any(q>=domain)){return ${zero};}
  let local=q-vec3i(fieldOrigin${i}());let d=vec3i(fieldDimensions${i}());
  if(c>=fieldComponents${i}()||any(local<vec3i(0))||any(local>=d)){${report('0x80000000u')}return ${zero};}
  return ${o.linearPrefix}${i}(((u32(local.z)*u32(d.y)+u32(local.y))*u32(d.x)+u32(local.x))*fieldComponents${i}()+c);
 }
 fn field${i}(p:vec3i,c:u32)->${t}{return fw_field${i}(p,c,false);}
 fn fieldClamped${i}(p:vec3i,c:u32)->${t}{return fw_field${i}(p,c,true);}
 ${t==='f32'?`fn sampleField${i}(p:vec3f,c:u32,edgeClamp:bool)->f32{
  let q=vec3i(floor(p));let f=fract(p);var sum=0.;
  for(var z=0;z<2;z++){for(var y=0;y<2;y++){for(var x=0;x<2;x++){
   let w=select(1.-f.x,f.x,x==1)*select(1.-f.y,f.y,y==1)*select(1.-f.z,f.z,z==1);
   sum+=fw_field${i}(q+vec3i(x,y,z),c,edgeClamp)*w;
  }}}return sum;
 }`:''}
 ${b.access==='read_write'?`
 fn store${i}(index:u32,value:${t}){if(index>=dataLength${i}()){${report('0x80000000u|min(index,0x7ffffffeu)')}return;}${t==='f32'&&o.checked!==false?`if((bitcast<u32>(value)&0x7f800000u)==0x7f800000u){atomicMin(&${o.status}[${o.slot}],index);${variable}[index]=0u;return;}`:''}${store}}
 fn storeField${i}(p:vec3i,c:u32,value:${t}){
  let q=p-vec3i(fieldOrigin${i}());let d=vec3i(fieldDimensions${i}());if(c>=fieldComponents${i}()||any(q<vec3i(0))||any(q>=d)){${report('0x80000000u')}return;}
  store${i}(((u32(q.z)*u32(d.y)+u32(q.y))*u32(d.x)+u32(q.x))*fieldComponents${i}()+c,value);
 }
 ${b.atomic?['Add','Min','Max','Exchange'].map(op=>`fn atomic${op}${i}(index:u32,value:${t})->${t}{if(index>=dataLength${i}()){${report('0x80000000u|min(index,0x7ffffffeu)')}return ${zero};}return atomic${op}(&${variable}[index],value);}`).join('\n'):''}
 `:''}`;
 }).join('\n');
}
