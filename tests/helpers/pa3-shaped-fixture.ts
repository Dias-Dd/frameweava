import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as graphics from '../../modules/graphics-contracts/index.ts';
import {createFontShaper} from '../../modules/pro-animation/src/font-shaping.ts';
import {directShapingFactory} from './pa3-shaping.ts';
export async function shapedFixture(text:string,options:{id?:string;script?:string;direction?:'ltr'|'rtl';fontSize?:number;x?:number;baseline?:number}={}){
 const id=options.id??'notosans',sources=JSON.parse(await readFile('modules/pro-animation/validation/shaping-scene/font-sources.json','utf8')),source=sources.find((s:any)=>s.id===id),font=await createFontShaper(graphics,directShapingFactory,{coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:640,height:240},bytes:new Uint8Array(await readFile(`modules/pro-animation/validation/shaping-scene/fonts/${id}.ttf`)),source:{resourceId:id,kind:'font',sha256:source.font.sha256,bytes:source.font.bytes}});
 try{return await font.shapeRun(text,{script:options.script??'Latn',direction:options.direction??'ltr',fontSize:options.fontSize??40,x:options.x??20,baseline:options.baseline??70});}finally{assert.deepEqual(await font.dispose(),{mode:'cooperative',remainingSessions:0});}
}
