/** Fast delimiter preflight only. Actual WGSL parsing, validation and execution
 * remain the existing native owner/Naga path, exercised separately. */
import assert from 'node:assert/strict';

import * as focus from './kernels.ts';

const failures:object[]=[];
for(const s of Object.values(focus)){const code=s.code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,v=>v.replace(/[^\n]/g,' ')),stack:{char:string;offset:number}[]=[];for(let i=0;i<code.length;i++){const ch=code[i];if('({['.includes(ch))stack.push({char:ch,offset:i});else if(')}]'.includes(ch)){const item=stack.pop();if(!item||item.char!=='({['[')}]'.indexOf(ch)]){failures.push({id:s.id,offset:i,line:code.slice(0,i).split('\n').length,opening:item,context:code.slice(Math.max(0,i-100),i+20)});break;}}}if(stack.length)failures.push({id:s.id,unclosed:stack});}
console.log(JSON.stringify({kind:'delimiter-preflight-only',ok:failures.length===0,failures}));assert.equal(failures.length,0,'WGSL delimiter preflight failed');
