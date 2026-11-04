import {open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {wavHeader} from '../../src/audio/wav.ts';
const rate=48000,count=90*rate,file=fileURLToPath(new URL('./source.wav',import.meta.url));
const output=await open(file,'wx');
try{await output.write(wavHeader({sampleRate:rate,layout:'stereo',sampleCount:count,format:'float32'}));
  for(let start=0;start<count;start+=4096){const n=Math.min(4096,count-start),bytes=Buffer.alloc(n*8);
    for(let i=0;i<n;i++){const t=(start+i)/rate;bytes.writeFloatLE(Math.sin(t*2*Math.PI*220)*.2,i*8);bytes.writeFloatLE(Math.sin(t*2*Math.PI*330)*.2,i*8+4);}
    await output.write(bytes);
  }
}finally{await output.close();}
console.log(file);
