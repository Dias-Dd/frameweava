// SPDX-License-Identifier: Apache-2.0
import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
export async function initialize(){throw Object.assign(new Error('The browser Rust/WASM templates were retired. Rust source, ABI/glue and build/license utilities remain; a Native/SpiderMonkey template is not implemented.'),{code:'E_WEB_REMOVED'});}
if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url))initialize().catch(e=>{console.error(JSON.stringify({code:e.code,message:e.message}));process.exitCode=1;});
