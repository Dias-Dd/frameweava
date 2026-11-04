// Independent C HarfBuzz oracle input; this exporter does not calculate expected answers.
import {mkdir,writeFile} from 'node:fs/promises';
import * as graphics from '../../graphics-contracts/index.ts';
import {createTextItemizer} from '../src/text-itemizer.ts';
import {shapeBidiLine} from '../src/bidi-line.ts';
import {directTextFactory} from '../../../tests/helpers/pa3-bidi.ts';
import {bidiFont} from '../../../tests/helpers/pa3-bidi-fonts.ts';
const base='.frameweave/pa3-bidi';await mkdir(base,{recursive:true});
const texts=['AV אבג 123 (ffi)','אבג AV (123)','ID \u2067سَلَام 42\u2069 end','A (سَلَام) 42 אבג','a\u0327\u0301\u200d Hebrew אב','f\u200ei','abc \u202eDEF\u202c xyz','س\u200dلام 12','س\u200cلام 12','日本語 AV אבג','カタカナー 42','\u2068אבג\u2069 123 AV'];
const itemizer=await createTextItemizer(graphics,directTextFactory),fonts=new Map<string,Awaited<ReturnType<typeof bidiFont>>>(),cases=[];
try{for(const id of ['notosans','notosanshebrew','notonaskharabic','notosansjp'])fonts.set(id,await bidiFont(id));
 for(const [index,text]of texts.entries()){
  const options={fontSize:48,x:20,baseline:90,width:1000,align:index%2?'start' as const:'center' as const,baseDirection:index%3===1?'rtl' as const:'auto' as const,language:'und',features:{kern:1,liga:1}};
  const line=await shapeBidiLine(graphics,itemizer,text,{...options,font:fonts.get('notosans')!,fontForRun:r=>fonts.get(r.script==='Hebr'?'notosanshebrew':r.script==='Arab'?'notonaskharabic':['Hani','Hira','Kana'].includes(r.script??'')?'notosansjp':'notosans')!});cases.push({index,options,line});
 }
}finally{await itemizer.dispose();await Promise.all([...fonts.values()].map(f=>f.dispose()));}
await writeFile(base+'/bidi-oracle-input.json',JSON.stringify({positionBudgetPx:1e-8,outlineBudgetFontUnits:1e-4,cases}));console.log(JSON.stringify({cases:cases.length,output:base+'/bidi-oracle-input.json'}));
