import sharp from 'sharp';
import type {OverlayOptions} from 'sharp';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=fileURLToPath(new URL('../../../artifacts/graphics-contracts/',import.meta.url));
const panels=[['path-mask-evenodd.png','A / EVENODD / alpha hole'],['path-mask-nonzero.png','A / NONZERO / filled center'],['track-frame-0.png','B / t = 0.000 s / observed'],['track-frame-2.png','B / t = 0.125 s / missing'],['track-frame-5.png','B / t = 0.3125 s / interpolated'],['track-frame-127.png','B / t = 7.9375 s / no bracket']] as const;
const width=840,height=550,items:OverlayOptions[]=[];
for(let i=0;i<panels.length;i++){
  const x=16+(i%3)*276,y=48+Math.floor(i/3)*250;
  const input=await sharp(join(directory,panels[i][0])).resize(256,192,{kernel:'nearest'}).flatten({background:'#173447'}).png().toBuffer();items.push({input,left:x,top:y+25});
  const label=Buffer.from(`<svg width="270" height="24"><text x="0" y="17" fill="#d4eee9" font-family="Arial" font-size="13">${panels[i][1]}</text></svg>`);items.push({input:label,left:x,top:y});
}
items.push({input:Buffer.from('<svg width="800" height="32"><text x="0" y="23" fill="#ffffff" font-family="Arial" font-size="20">FrameWeave / Shared Graphics Contracts v1 / verified renders</text></svg>'),left:16,top:8});
await sharp({create:{width,height,channels:4,background:'#0b1a27'}}).composite(items).png().toFile(join(directory,'storyboard.png'));
