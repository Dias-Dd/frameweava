import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {unicodeLineBreaks} from '../src/text-layout/breaks.ts';
const input=resolve(process.argv[2]??'.frameweave/pa3-text-layout/upstream/LineBreakTest16.txt'),output=resolve(process.argv[3]??'.frameweave/pa3-text-layout/linebreak/result.json'),start=performance.now(),bytes=await readFile(input);
assert.equal(createHash('sha256').update(bytes).digest('hex'),'910759a611a479f37df4f535d2e64d7589be3c5ac5f7491cf1fb4fa4cdb211e9','Exact original Unicode16 official conformance corpus');
let rows=0;const failures:object[]=[];
for(const [index,row] of bytes.toString('utf8').split(/\r?\n/).entries()){
 const code=row.split('#')[0].trim();if(!code)continue;const tokens=code.split(/\s+/);let text='',position=0;const expected:number[]=[];
 for(const token of tokens){if(token==='÷'){if(position>0)expected.push(position);}else if(token!=='×'){const point=parseInt(token,16);assert.ok(Number.isInteger(point)&&point<=0x10ffff);const s=String.fromCodePoint(point);text+=s;position+=s.length;}}
 const actual=unicodeLineBreaks(text).map(b=>b.position);rows++;
 if(JSON.stringify(actual)!==JSON.stringify(expected))failures.push({line:index+1,code,expected,actual});
}
const result={ok:failures.length===0,unicode:'16.0.0',source:'https://www.unicode.org/Public/16.0.0/ucd/auxiliary/LineBreakTest.txt',sha256:createHash('sha256').update(bytes).digest('hex'),rows,failed:failures.length,seconds:(performance.now()-start)/1000};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2));await writeFile(output.replace(/\.json$/,'.failures.jsonl'),failures.map(v=>JSON.stringify(v)).join('\n'));console.log(JSON.stringify(result));assert.equal(failures.length,0,'Original Unicode16 line-break corpus: see complete failure records');
