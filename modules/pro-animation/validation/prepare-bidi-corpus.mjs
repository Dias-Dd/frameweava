// SPDX-License-Identifier: Apache-2.0
// Explicit validation fixtures only. Never invoked by the library, renderer or package install.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const files=[
 ['BidiCharacterTest.txt','https://www.unicode.org/Public/16.0.0/ucd/BidiCharacterTest.txt','d04a51a90052dcd71c4e91ee5b3a9d973ee35c12406b5a99875ac8163c8f2804'],
 ['BidiTest.txt','https://www.unicode.org/Public/16.0.0/ucd/BidiTest.txt','93e5eb9d88ca89dcf895f5576486a3363762ad2aa8f2db2fa56fe60cb82b9520'],
 ['PropList.txt','https://www.unicode.org/Public/16.0.0/ucd/PropList.txt','53d614508e2a0b2305a8aa21cd60d993de9326cdf65993660dfcce4503548583'],
 ['LICENSE.txt','https://www.unicode.org/license.txt','e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96'],
];
if(process.argv.slice(2).some(a=>a!=='--fetch'))throw Error('Only --fetch permits explicit fixture downloads');
const dir=resolve('.frameweave/pa3-bidi/upstream/unicode16');await mkdir(dir,{recursive:true});
for(const [file,url,sha256]of files){const path=join(dir,file);let bytes;try{bytes=await readFile(path);}catch(e){if(e.code!=='ENOENT')throw e;if(!process.argv.includes('--fetch'))throw Error('Missing reviewed fixture: '+file+'; explicit --fetch or offline hash-verified copy required');const response=await fetch(url);if(!response.ok)throw Error('Fixture fetch HTTP '+response.status);bytes=new Uint8Array(await response.arrayBuffer());}
 const actual=createHash('sha256').update(bytes).digest('hex');if(actual!==sha256)throw Error('Immutable fixture mismatch: '+file);if(process.argv.includes('--fetch'))await writeFile(path,bytes);console.log(JSON.stringify({file,sha256,bytes:bytes.length,source:url}));
}
