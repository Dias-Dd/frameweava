import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';import {resolve,join} from 'node:path';
import {hdrMetadataBytes,injectHdrMetadata} from '../src/media/hdr-metadata.ts';
const metadata={masteringDisplay:{red:[.708,.292] as [number,number],green:[.17,.797] as [number,number],blue:[.131,.046] as [number,number],white:[.3127,.329] as [number,number],minNits:.005,maxNits:1000},maxCLL:1000,maxFALL:400};
test('HDR bitstream adapter rejects truncated IVF/HEVC and preserves IVF timestamps and picture bytes',async()=>{
 const parent=resolve('.frameweave/hdr-metadata-tests');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'p-'));
 for(const codec of ['av1','hevc'] as const){const input=join(dir,codec),out=input+'.out';await writeFile(input,Buffer.of(1,2,3));await assert.rejects(injectHdrMetadata(input,out,codec,metadata),{code:'E_MEDIA_HDR_BITSTREAM'});}
 const header=Buffer.alloc(32);header.write('DKIF');header.writeUInt16LE(32,6);header.write('AV01',8);
 const picture=Buffer.of(0x32,1,0x80),packet=Buffer.alloc(12);packet.writeUInt32LE(picture.length);packet.writeBigUInt64LE(12345n,4);
 const input=join(dir,'valid.ivf'),output=input+'.tagged';await writeFile(input,Buffer.concat([header,packet,picture]));await injectHdrMetadata(input,output,'av1',metadata);const bytes=await readFile(output),extra=hdrMetadataBytes(metadata,'av1');
 assert.deepEqual(bytes.subarray(0,32),header);assert.equal(bytes.readBigUInt64LE(36),12345n);assert.equal(bytes.readUInt32LE(32),picture.length+extra.length);assert.deepEqual(bytes.subarray(-picture.length),picture);
});
