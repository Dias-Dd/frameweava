// Isolated real-font preparation; borrowed original Rust/Kit factories, no OS fallback or CPU pixels.
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {paragraphServices,paragraphText} from '../../../tests/helpers/pa3-paragraph.ts';
import {operations} from '../../../tests/helpers/pa3-pathops.ts';
import {layoutParagraph,createParagraphIndex,prepareParagraphMeshes,paragraphMetrics} from '../src/text-layout/index.ts';
const start=performance.now(),out=resolve('modules/pro-animation/validation/text-layout-scene'),logs=resolve('.frameweave/pa3-text-layout/preparation');await mkdir(out,{recursive:true});await mkdir(logs,{recursive:true});const services=await paragraphServices(),ops=await operations();
try{
 const paragraph=await layoutParagraph(paragraphText,{...services.options,width:500,fontSize:32,x:40,baseline:52,lineHeight:58,align:'start'}),index=createParagraphIndex(paragraph),prepared=await prepareParagraphMeshes(index,{pathOperations:ops,tolerance:.02});
 const code="// Generated from the exact real paragraph/font sources in prepare-text-layout.ts; no raster pixels.\nimport type {PreparedParagraphMeshes} from '../../src/text-layout/native.ts';\nexport const prepared="+JSON.stringify(prepared)+" as unknown as PreparedParagraphMeshes;\n";
 await writeFile(join(out,'prepared.ts'),code);const proof={version:1,seconds:(performance.now()-start)/1000,metrics:paragraphMetrics(index),flow:paragraph.flow,fonts:paragraph.fontInstances,preparation:prepared.preparation,vertices:prepared.vertexUnits.length,preparedSha256:createHash('sha256').update(code).digest('hex'),loader:'Original reviewed private Kit carriers; Main owns formal factory/version/permissions. Borrowed services disposed before exit.',oldContextualSource:'Adopted existing own multiline experiment; new wrapping/index/native integration is this checkpoint.'};await writeFile(join(logs,'result.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{const cleanup={paths:await ops.dispose(),...await services.dispose()};await writeFile(join(logs,'cleanup.json'),JSON.stringify(cleanup,null,2));}
