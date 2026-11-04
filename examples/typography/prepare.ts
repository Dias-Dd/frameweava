import {writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTypography} from '@frameweave/engine/typography/node';
const path=process.argv[2];if(!path)throw Error('Provide an explicit TTF/OTF file: prepare.ts path/to/font.ttf');
const typography=await createTypography({allowWasm:true,coordinates:{spaceId:'caption',unit:'px',origin:'top-left',x:'right',y:'down',width:640,height:180},fonts:[{id:'caption',path:resolve(path)}]});
try{
 const paragraph=await typography.prepareParagraph(process.argv[3]??'Frameweave — prepared once',{width:580,fontSize:36,x:30,baseline:80,wrap:'word',overflow:'error'});
 await writeFile(join(dirname(fileURLToPath(import.meta.url)),'paragraph.json'),JSON.stringify(paragraph)+'\n');
 console.log(JSON.stringify({ok:true,glyphs:paragraph.layout.glyphs.length,triangles:paragraph.preparation.triangles,fonts:paragraph.fontInstances}));
}finally{await typography.dispose();}
