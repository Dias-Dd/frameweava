/** Explicit offline fixture preparation. Does not rewrite the sealed v1 set. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {linear709} from '../../../../src/media/surface.ts';
import {prepareOcio,type OcioRequest} from './prepare.ts';
import type {ExtractedUniform} from './dynamic-prepare.ts';
import type {OcioDefinition} from '../types.ts';
const root=resolve('.'),directory=resolve('modules/native-effects/closure-filters/fixtures-v2'),out=resolve(process.env.FRAMEWEAVE_OCIO_RUN!),python=process.env.FRAMEWEAVE_MEDIA_PYTHON!,compiler=resolve('.frameweave/ocio-target/release/frameweave-ocio-wgsl.exe');await mkdir(directory,{recursive:true});
const result=await promisify(execFile)(python,[fileURLToPath(new URL('./dynamic-fixtures.py',import.meta.url)),directory],{windowsHide:true});await writeFile(join(out,'official-uniforms.json'),result.stdout);
const raw=JSON.parse(await readFile(join(directory,'variants-raw.json'),'utf8')) as {kind:string;variants:{request:Omit<OcioRequest,'inputColor'|'outputColor'>;uniforms:ExtractedUniform[]}[]}[],definitions:OcioDefinition[]=[],profiles:{kind:string;requests:OcioRequest[];values:Record<string,number|boolean|(number|boolean)[]>[]}[]=[];
for(const p of raw){const variants=p.variants.map(v=>({request:{...v.request,config:relative(root,v.request.config).replaceAll('\\','/'),inputColor:linear709,outputColor:linear709} satisfies OcioRequest,uniforms:v.uniforms})),aliases:Readonly<Record<string,string>>=p.kind==='exposure'?{exposure:'ocio_exposure_contrast_exposureVal',contrast:'ocio_exposure_contrast_contrastVal',gamma:'ocio_exposure_contrast_gammaVal'}:{};
 const d=await prepareOcio({...variants[0].request,uniformAliases:aliases},{projectRoot:root,outputDirectory:join(out,p.kind),python,compiler});definitions.push(d);
 const values=variants.map(v=>Object.fromEntries(d.uniforms!.map(u=>{const from=v.uniforms.find(x=>x.symbol===u.symbol);if(!from||from.type!==u.type||from.values.length>u.length)throw Error('Official dynamic layout changed between variants');const values=[...from.values,...Array.from({length:u.length-from.values.length},()=>0)];return [u.name,u.type==='float'||u.type==='bool'?values[0]:values];})));
 profiles.push({kind:p.kind,requests:variants.map(v=>v.request),values});
}
const displayRequests=profiles[0].requests.map(r=>({...r,operation:'display' as const,display:'linear-709',view:'graded',linearDisplaySpace:'linear-709',outputColor:{...linear709,reference:'display' as const}}));definitions.push(await prepareOcio({...displayRequests[0],uniformAliases:{exposure:'ocio_exposure_contrast_exposureVal',contrast:'ocio_exposure_contrast_contrastVal',gamma:'ocio_exposure_contrast_gammaVal'}},{projectRoot:root,outputDirectory:join(out,'dynamic-display'),python,compiler}));profiles.push({kind:'display',requests:displayRequests,values:profiles[0].values});
profiles.push({kind:'legacy-look',requests:[{operation:'look',config:'modules/native-effects/closure-filters/fixtures/look.ocio',source:'linear-709',destination:'linear-709',look:'warm',inputColor:linear709,outputColor:linear709}],values:[{}]});
await writeFile(join(directory,'processors.json'),JSON.stringify(definitions));await writeFile(join(directory,'profiles.json'),JSON.stringify(profiles));
console.log(JSON.stringify({ok:true,processors:definitions.map(d=>({id:d.kernel.id,uniforms:d.uniforms?.map(u=>({name:u.name,type:u.type,length:u.length}))}))}));
