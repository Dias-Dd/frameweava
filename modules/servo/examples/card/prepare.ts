import {dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';
import {prepareServo,writeServoDocument} from '../../node.ts';
const root=dirname(fileURLToPath(import.meta.url));
const document=await prepareServo({root,entry:'page',resources:{page:'page.html',style:'style.css',script:'animate.js',logo:'logo.svg'}});
await writeServoDocument(join(root,'generated/document.ts'),document);
console.log(JSON.stringify({ok:true,output:join(root,'generated/document.ts'),resources:document.resources}));
