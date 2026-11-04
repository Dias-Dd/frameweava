import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';

// Same sRGB/XYZ/Lab D65 oracle as the previously frozen OCIO experiment.
// This is post-run reference analysis, never part of the display execution.
const white=[.3127/.329,1,(1-.3127-.329)/.329],matrix=[[506752/1228815,87881/245763,12673/70218],[87098/409605,175762/245763,12673/175545],[7918/409605,87881/737289,1001167/1053270]];
function lab(encoded:number[]){const rgb=encoded.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4),f=matrix.map((row,i)=>{const t=row.reduce((v,m,c)=>v+m*rgb[c],0)/white[i];return t>216/24389?Math.cbrt(t):((24389/27)*t+16)/116;});return [116*f[1]-16,500*(f[0]-f[1]),200*(f[1]-f[2])];}
function delta(a:number[],b:number[]){const x=lab(a),y=lab(b);return Math.hypot(...x.map((v,i)=>v-y[i]));}
assert.ok(Math.abs(lab([1,1,1])[0]-100)<1e-10);assert.deepEqual(lab([0,0,0]),[0,0,0]);
const directory=resolve(process.argv[2]??''),reference=JSON.parse(await readFile(join(directory,'report.json'),'utf8'));assert.equal(reference.allPassed,true);
const rows=[];for(const alpha of ['opaque','straight','premultiplied']){const row=reference.rows.find((r:any)=>r.alpha===alpha);assert.ok(row);const cpu=await sharp(join(directory,alpha+'-cpu.png')).ensureAlpha().raw().toBuffer(),gpu=await sharp(join(directory,alpha+'-gpu.png')).ensureAlpha().raw().toBuffer();assert.equal(cpu.length,gpu.length);const black=[],whiteBackground=[],opaque=[];
 for(let n=0;n<row.samples;n++){const i=n*4,a=cpu[i+3]/255,b=gpu[i+3]/255,c=[0,1,2].map(k=>cpu[i+k]/255*a),g=[0,1,2].map(k=>gpu[i+k]/255*b);black.push(delta(c,g));whiteBackground.push(delta(c.map(v=>v+1-a),g.map(v=>v+1-b)));if(a===1&&b===1)opaque.push(delta(c,g));}
 const stats=(v:number[])=>{const s=v.sort((a,b)=>a-b);return {n:s.length,max:s.at(-1)??null,p95:s.length?s[Math.ceil(s.length*.95)-1]:null,mean:s.length?s.reduce((a,b)=>a+b,0)/s.length:null};};rows.push({alpha,blackComposite:stats(black),whiteComposite:stats(whiteBackground),opaque:stats(opaque)});
}
const report={version:1,metric:'CIE76 Lab D65',scope:'All actual fixed sample pixels after RGBA8 Canvas quantization; black/white sRGB contribution composition; padding excluded. Descriptive extra metric, not a relaxed replacement for frozen byte/Alpha gates.',rows};await writeFile(join(directory,'delta-e.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
