// Private reviewed real-font fixture preparation; not a loader/registry or published capability.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import * as graphics from '../../graphics-contracts/index.ts';
import {createFontShaper} from '../src/font-shaping.ts';
import {prepareGlyphMeshes} from '../src/text-animation/geometry.ts';
import {directShapingFactory} from '../../../tests/helpers/pa3-shaping.ts';
import {operations} from '../../../tests/helpers/pa3-pathops.ts';
const out=resolve('modules/pro-animation/validation/native-text-scene');await mkdir(out,{recursive:true});const logs=resolve('.frameweave/pa3-native-text/preparation');await mkdir(logs,{recursive:true});
const coordinates={spaceId:'native-text',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:600,height:360},sources=JSON.parse(await readFile('modules/pro-animation/validation/shaping-scene/font-sources.json','utf8'));
const specs=[{id:'notosans',text:'AV ffi a\u0301',script:'Latn',language:'en',direction:'ltr' as const,fontSize:64,x:28,baseline:88},{id:'notonaskharabic',text:'سَلام',script:'Arab',language:'ar',direction:'rtl' as const,fontSize:78,x:330,baseline:195},{id:'notosansjp',text:'日本語',script:'Hani',language:'ja',direction:'ltr' as const,fontSize:70,x:35,baseline:295}],prepared=[],proof=[];
const start=performance.now(),ops=await operations();try{for(const spec of specs){
 const entry=sources.find((r:any)=>r.id===spec.id),bytes=new Uint8Array(await readFile(`modules/pro-animation/validation/shaping-scene/fonts/${spec.id}.ttf`)),source={resourceId:spec.id,kind:'font' as const,sha256:entry.font.sha256,bytes:entry.font.bytes},font=await createFontShaper(graphics,directShapingFactory,{coordinates,bytes,source});
 try{const run=await font.shapeRun(spec.text,spec),mesh=await prepareGlyphMeshes(run,{pathOperations:ops,tolerance:.02}),words=Array.from(new Intl.Segmenter(spec.language,{granularity:'word'}).segment(spec.text)).filter(w=>w.isWordLike).map(w=>({start:w.index,end:w.index+w.segment.length}));
  prepared.push({mesh,words});proof.push({font:source,text:spec.text,direction:spec.direction,glyphs:run.layout.glyphs.length,clusters:mesh.units.length,positions:mesh.vertexUnits.length,preparation:mesh.preparation});
 }finally{const cleanup=await font.dispose();if(cleanup.mode!=='cooperative'||cleanup.remainingSessions!==0)throw Error('Font cleanup did not finish');}
}}finally{const cleanup=await ops.dispose();if(cleanup.mode!=='cooperative'||cleanup.remainingSessions!==0)throw Error('Path cleanup did not finish');}
const code=`// Generated from real verified HarfRust/Skrifa + Clipper2 + Earcut. Edit prepare-native-text.ts to change fonts/text.\nimport type {PreparedGlyphGeometry} from '../../src/text-animation/geometry.ts';\nexport const prepared = ${JSON.stringify(prepared)} as unknown as {mesh:PreparedGlyphGeometry;words:{start:number;end:number}[]}[];\n`;
await writeFile(join(out,'prepared.ts'),code);const report={version:1,seconds:(performance.now()-start)/1000,proof,unicodeWordSegmentation:{runtime:process.version,icu:process.versions.icu,unicode:process.versions.unicode,policy:'Explicit captured ranges; not recomputed in native host'},preparedSha256:createHash('sha256').update(code).digest('hex'),fontsDownloaded:false,loader:'Existing direct reviewed Kit fixtures, source/component SHA checked. Formal R1 font factories/permissions remain Main-owned.'};await writeFile(join(logs,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
