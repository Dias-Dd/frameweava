import {inferenceError} from './schema.ts';
/** Minimal protobuf preflight, not a graph executor. Raw tensor bytes are skipped.
 * Admit embedded standard-ONNX models; never follow external_data locations. */
interface Field{n:number;wire:number;integer?:bigint;data?:Uint8Array}
function* fields(bytes:Uint8Array):Generator<Field>{let at=0;const integer=()=>{let n=0n,shift=0n;for(let i=0;i<10;i++){if(at>=bytes.length)inferenceError('E_INFERENCE_MODEL_FORMAT','Truncated protobuf integer');const b=bytes[at++];n|=BigInt(b&127)<<shift;if(!(b&128))return n;shift+=7n;}return inferenceError('E_INFERENCE_MODEL_FORMAT','Oversized protobuf integer');};
 while(at<bytes.length){const tag=integer(),n=Number(tag>>3n),wire=Number(tag&7n);if(n<1||n>536870911)inferenceError('E_INFERENCE_MODEL_FORMAT','Invalid protobuf tag');if(wire===0){yield{n,wire,integer:integer()};continue;}if(wire===1||wire===5){at+=wire===1?8:4;if(at>bytes.length)inferenceError('E_INFERENCE_MODEL_FORMAT','Truncated fixed field');yield{n,wire};continue;}if(wire!==2)inferenceError('E_INFERENCE_MODEL_FORMAT','Unsupported protobuf wire type');const length=integer();if(length>BigInt(bytes.length-at))inferenceError('E_INFERENCE_MODEL_FORMAT','Truncated length-delimited field');const end=at+Number(length);yield{n,wire,data:bytes.subarray(at,end)};at=end;}}
const text=(v:Field)=>{if(v.wire!==2||!v.data)inferenceError('E_INFERENCE_MODEL_FORMAT','Expected protobuf text');try{return new TextDecoder('utf-8',{fatal:true}).decode(v.data);}catch{return inferenceError('E_INFERENCE_MODEL_FORMAT','Invalid UTF-8 model text');}};
export function inspectEmbeddedOnnx(bytes:Uint8Array,policy:{maxBytes:number;maxNesting?:number}){
 if(!Number.isSafeInteger(policy.maxBytes)||policy.maxBytes<1||bytes.byteLength>policy.maxBytes)inferenceError('E_INFERENCE_MODEL_BUDGET','Model exceeds the caller model-byte budget');
 const nesting=policy.maxNesting??64;if(!Number.isSafeInteger(nesting)||nesting<1)inferenceError('E_INFERENCE_MODEL_BUDGET','Positive model nesting policy required');
 const todo:{kind:'model'|'graph'|'node'|'attribute'|'tensor'|'sparse'|'opset';data:Uint8Array;depth:number}[]=[{kind:'model',data:bytes,depth:0}];let graphs=0,nodes=0,tensors=0,irVersion=0;
 while(todo.length){const {kind,data,depth}=todo.pop()!;if(depth>nesting)inferenceError('E_INFERENCE_MODEL_BUDGET','Model nesting exceeds caller policy');const child=(kind:typeof todo[number]['kind'],f:Field)=>{if(f.wire!==2||!f.data)inferenceError('E_INFERENCE_MODEL_FORMAT','Expected nested model message');todo.push({kind,data:f.data,depth:depth+1});};
  for(const f of fields(data)){
   if(kind==='model'){if(f.n===1)irVersion=Number(f.integer??0n);if(f.n===7){graphs++;child('graph',f);}if(f.n===8)child('opset',f);if(f.n===20||f.n===25)inferenceError('E_INFERENCE_MODEL_PROFILE','Training graphs/local functions need a separately qualified model profile');}
   if(kind==='opset'&&f.n===1&&!['','ai.onnx'].includes(text(f)))inferenceError('E_INFERENCE_MODEL_DOMAIN','Only standard ONNX operators are admitted; custom native code is not loaded');
   if(kind==='graph'){if(f.n===1){nodes++;child('node',f);}if(f.n===5){tensors++;child('tensor',f);}if(f.n===15)child('sparse',f);}
   if(kind==='node'){if(f.n===4&&['RandomNormal','RandomUniform','RandomNormalLike','RandomUniformLike','Multinomial','Bernoulli','Dropout'].includes(text(f)))inferenceError('E_INFERENCE_MODEL_DETERMINISM','Stochastic/training operators require a separate temporal profile');if(f.n===5)child('attribute',f);if(f.n===7&&!['','ai.onnx'].includes(text(f)))inferenceError('E_INFERENCE_MODEL_DOMAIN','Custom ONNX domain is not admitted');}
   if(kind==='attribute'){if(f.n===5||f.n===10)child('tensor',f);if(f.n===6||f.n===11)child('graph',f);if(f.n===22||f.n===23)child('sparse',f);}
   if(kind==='sparse'&&(f.n===1||f.n===2))child('tensor',f);
   if(kind==='tensor'&&(f.n===13||f.n===14&&(f.integer??0n)!==0n))inferenceError('E_INFERENCE_MODEL_EXTERNAL_DATA','External tensor files are not admitted by embedded-model v1');
  }
 }
 if(graphs!==1||irVersion<1||!nodes)inferenceError('E_INFERENCE_MODEL_FORMAT','A standard embedded ONNX ModelProto graph is required');return{version:1 as const,irVersion,nodes,tensors,externalData:false as const};
}
