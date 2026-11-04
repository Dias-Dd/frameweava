// Build-time data reduction only; no network or executable Unicode dependencies.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=new URL('../provenance/font-execution/vertical/',import.meta.url),bytes=await readFile(new URL('VerticalOrientation-16.0.0.txt',base));
if(createHash('sha256').update(bytes).digest('hex')!=='24ac1474554eb55c85ace5c16d551535a8c52cdc2f4c13cf68c3839214339bbe')throw Error('Pinned Unicode16 orientation source changed');
const rows=[];for(const line of bytes.toString('utf8').split('\n')){const m=/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(U|R|Tu|Tr)\b/.exec(line);if(!m)continue;const start=parseInt(m[1],16),end=parseInt(m[2]??m[1],16),value=['R','U','Tu','Tr'].indexOf(m[3]);if(rows.length&&start<=rows.at(-1)[1])throw Error('Unordered Unicode input');const last=rows.at(-1);if(last&&last[1]+1===start&&last[2]===value)last[1]=end;else rows.push([start,end,value]);}
await writeFile(new URL('../src/font-execution/vertical/orientation-data.ts',import.meta.url),'// SPDX-License-Identifier: Unicode-3.0\n// Generated from original pinned Unicode16 VerticalOrientation.txt; default R.\n// Original data, SHA256 and license: provenance/font-execution/vertical.\nexport const verticalOrientationRanges:readonly number[] = '+JSON.stringify(rows.flat())+';\n');
console.log(JSON.stringify({unicode:'16.0.0',ranges:rows.length}));
