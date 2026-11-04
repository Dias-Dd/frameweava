import{createHash}from'node:crypto';import type{InferenceSource}from'../types.ts';
// Tiny deterministic ONNX ModelProto: two F32 vectors -> Add -> one F32 vector.
// Test fixture only, no downloaded model, custom operator, external data or weights.
const varint=(n:number)=>{const out:number[]=[];do{out.push((n&127)|(n>127?128:0));n=Math.floor(n/128);}while(n);return Buffer.from(out);};
const int=(field:number,n:number)=>Buffer.concat([varint(field*8),varint(n)]);
const bytes=(field:number,value:Uint8Array|string)=>{const b=Buffer.from(value);return Buffer.concat([varint(field*8+2),varint(b.length),b]);};
const value=(name:string)=>bytes(1,name);
const tensor=(name:string)=>Buffer.concat([value(name),bytes(2,bytes(1,Buffer.concat([int(1,1),bytes(2,bytes(1,int(1,4)))])))]);
const node=Buffer.concat([bytes(1,'history'),bytes(1,'delta'),bytes(2,'next'),bytes(4,'Add')]);
const graph=Buffer.concat([bytes(1,node),bytes(2,'frameweave-output-fixture'),bytes(11,tensor('history')),bytes(11,tensor('delta')),bytes(12,tensor('next'))]);
export const modelBytes=Buffer.concat([int(1,8),bytes(7,graph),bytes(8,int(2,13))]);
const description=(name:string)=>({name,dtype:'float32' as const,shape:[4],layout:'linear' as const});
export const outputModel:InferenceSource={version:1,id:'test/preallocated-feedback',model:{resource:'feedback-model',bytes:modelBytes.length,sha256:createHash('sha256').update(modelBytes).digest('hex')},inputs:[description('history'),description('delta')],outputs:[description('next')],execution:{provider:'directml',allowCpuFallback:false,precision:'float32',temporal:'stateless'}};
