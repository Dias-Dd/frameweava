/** Explicit fixed official corpus through the actual public TS/managed-WASM data adapter. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import * as graphics from '../../graphics-contracts/index.ts';
import {createTextItemizer} from '../src/text-itemizer.ts';
import {directTextFactory} from '../../../tests/helpers/pa3-bidi.ts';
const base=resolve('.frameweave/pa3-bidi'),file=resolve(base,'upstream/unicode16/BidiCharacterTest.txt');
assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),'d04a51a90052dcd71c4e91ee5b3a9d973ee35c12406b5a99875ac8163c8f2804','Fetch/review the fixed official16 corpus first');
await mkdir(resolve(base,'conformance'),{recursive:true});const failures=await open(resolve(base,'conformance/wasm-character-failures.jsonl'),'w'),client=await createTextItemizer(graphics,directTextFactory),start=performance.now();let total=0,failed=0,lineNumber=0,cleanup:unknown;
try{for await(const line of createInterface({input:createReadStream(file),crlfDelay:Infinity})){
 lineNumber++;const source=line.split('#')[0].trim();if(!source)continue;const fields=source.split(';'),points=fields[0].split(/\s+/).map(p=>Number.parseInt(p,16)),text=points.map(p=>String.fromCodePoint(p)).join(''),starts:number[]=[];let at=0;for(const ch of text){starts.push(at);at+=ch.length;}
 const baseDirection=({'0':'ltr','1':'rtl','2':'auto'} as const)[fields[1] as '0'|'1'|'2'],levels=fields[3].split(/\s+/).map(p=>p==='x'?null:Number(p)),order=fields[4].trim()?fields[4].trim().split(/\s+/).map(p=>starts[Number(p)]):[];total++;
 try{const result=await client.analyze(text,{baseDirection});assert.equal(result.paragraphs[0].level,Number(fields[2]));assert.equal(levels.length,starts.length);for(let i=0;i<levels.length;i++)if(levels[i]!==null)assert.equal(result.lineLevels[starts[i]],levels[i]);assert.deepEqual(result.visualOrder,order);}
 catch(error){failed++;const e=error as Error&{code?:string};await failures.write(JSON.stringify({line:lineNumber,source,code:e.code??null,error:e.message})+'\n');}
 if(total%10000===0)console.log(JSON.stringify({processed:total,failed,ms:performance.now()-start}));
 }}finally{cleanup=await client.dispose();await failures.close();}
const report={corpus:'Official BidiCharacterTest16',scope:'Full91,707 cases through public TypeScript + actual managed WASM; Unicode UAX9 through rule L2, not Frameweave media L2 or glyph rules L3/L4',node:process.version,total,passed:total-failed,failed,skipped:0,ms:performance.now()-start,cleanup};
await writeFile(resolve(base,'conformance/wasm-character-conformance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.equal(total,91707);assert.equal(failed,0);assert.deepEqual(cleanup,{mode:'cooperative',remainingSessions:0});
