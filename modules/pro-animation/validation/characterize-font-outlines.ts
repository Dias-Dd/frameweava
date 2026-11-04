/** Explicit strict experiment, reports every failure and exits nonzero. Not a silent acceptance/tolerance update. */
import {readFile,writeFile} from 'node:fs/promises';
import {directShapingFactory,canonicalOutline} from '../../../tests/helpers/pa3-shaping.ts';
const cases=JSON.parse(await readFile('.frameweave/pa3-shaping/oracle-input.json','utf8')),native=JSON.parse(await readFile('.frameweave/pa3-shaping/native-oracle-raw.json','utf8')),api=await directShapingFactory(),rows:any[]=[];
try{for(const c of cases){
 const bytes=new Uint8Array(await readFile(c.fontPath));await api.begin_font();for(let i=0;i<bytes.length;i+=262144)await api.append_font(bytes.subarray(i,i+262144));const upem=await api.finish_font(0);await api.set_variations(Object.entries(c.variations).map(([k,v])=>`${k}=${v}`).join(','));
 const expected=native.rows.find((r:any)=>r.id===c.id);let maxError=0,scalarCount=0,violations=0,topologyErrors=0;
 for(const [id,reference]of Object.entries(expected.outlines) as [string,number[]][]){const length=await api.outline_glyph(Number(id)),actual=canonicalOutline(await api.read_outline(0,length)),target=canonicalOutline(reference);if(actual.length!==target.length){topologyErrors++;continue;}for(let i=0;i<actual.length;i++){const d=Math.abs(actual[i]-target[i]);maxError=Math.max(maxError,d);scalarCount++;violations+=+(d>1e-4);}}
 rows.push({id:c.id,font:c.font,variations:c.variations,upem,scalarCount,maxError,violations,topologyErrors,pixelErrorAt72:maxError*72/upem,strictPass:violations===0&&topologyErrors===0});
}}finally{await api.dispose();}
const report={budgetFontUnits:1e-4,reference:'Independent C HarfBuzz15; exact close-edge normalization only',rows,failures:rows.filter(r=>!r.strictPass).length,maxError:Math.max(...rows.map(r=>r.maxError)),maxPixelErrorAt72:Math.max(...rows.map(r=>r.pixelErrorAt72)),accepted:rows.every(r=>r.strictPass)};
await writeFile('.frameweave/pa3-shaping/strict-outline-characterization.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.accepted)process.exitCode=1;
