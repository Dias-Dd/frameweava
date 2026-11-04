import test from 'node:test';
import assert from 'node:assert/strict';
import {identityPng} from '../src/render/png-identity.ts';
import {rgbPng,pngSurface,imageLayer,chunk} from './fixtures/identity-png.ts';

test('identity admission is bounded CRC-checked opaque RGBA8, never an Alpha/profile/transform approximation',()=>{
 const png=rgbPng(9,7,{rgba:true,opaque:true}),surface=pngSurface(png),sources={'stage:surface':surface},choose=(layer:any=imageLayer,s=surface,o?:any,bg='transparent')=>identityPng(9,7,bg,[layer],{'stage:surface':s},o);
 assert.deepEqual(choose()?.bytes,png);assert.ok(choose({...imageLayer,x:0,y:-0,opacity:1,scale:1,rotation:0,blend:'source-over'}));assert.ok(choose(imageLayer,surface,undefined,'#123456'));
 for(const patch of [{x:.000001},{y:1},{opacity:.999},{scale:2},{scaleX:.5},{scaleY:2},{rotation:360},{originX:1},{parent:'group'},{mask:{$ref:'mask',port:'surface'}},{isolation:'isolated'},{blend:'screen'},{effects:[{id:'blur'}]},{source:undefined}])assert.equal(choose({...imageLayer,...patch}),undefined,JSON.stringify(patch));
 assert.equal(identityPng(9,7,'transparent',[imageLayer,imageLayer],sources),undefined);
 for(const extra of [chunk('sRGB',Buffer.from([0])),chunk('tRNS',Buffer.alloc(6)),chunk('iCCP',Buffer.from('profile')),chunk('gAMA',Buffer.alloc(4)),chunk('acTL',Buffer.alloc(8)),chunk('tEXt',Buffer.from('unknown'))])assert.equal(choose(imageLayer,pngSurface(rgbPng(9,7,{rgba:true,opaque:true,extra:[extra]}))),undefined);
 assert.equal(choose(imageLayer,pngSurface(rgbPng(9,7,{rgba:true}))),undefined);
 for(const filter of [0,1,2,3,4] as const){assert.ok(choose(imageLayer,pngSurface(rgbPng(9,7,{rgba:true,opaque:true,filter}))));for(const badAlphaAt of [0,8,9,20,62])assert.equal(choose(imageLayer,pngSurface(rgbPng(9,7,{rgba:true,opaque:true,filter,badAlphaAt}))),undefined);}
 assert.equal(choose(imageLayer,pngSurface(rgbPng(9,7,{rgba:true,opaque:true,badDeflate:true}))),undefined);
 const corrupt=Buffer.from(png);corrupt[corrupt.length-1]^=1;assert.equal(choose(imageLayer,pngSurface(corrupt)),undefined);assert.equal(choose(imageLayer,pngSurface(Buffer.concat([png,Buffer.alloc(1)]))),undefined);
 assert.equal(choose(imageLayer,{...surface,width:8}),undefined);assert.equal(choose(imageLayer,{...surface,dataUrl:surface.dataUrl+'?'}),undefined);
 assert.equal(choose(imageLayer,surface,{width:9,height:7,sizes:{},displayPreview:true},'#fff'),undefined);
 assert.ok(choose(imageLayer,surface,{width:9,height:7,sizes:{},displayPreview:true},'transparent'));
});
test('identity admission permits exact power-of-two proxies, not arbitrary resampling',()=>{
 const s=pngSurface(rgbPng(9,7,{rgba:true,opaque:true})),layers=[imageLayer],surfaces={'stage:surface':s};assert.ok(identityPng(18,14,'transparent',layers,surfaces,{width:9,height:7,sizes:{'stage:surface':{width:18,height:14}}}));
 assert.equal(identityPng(27,21,'transparent',layers,surfaces,{width:9,height:7,sizes:{'stage:surface':{width:27,height:21}}}),undefined);
 assert.equal(identityPng(18,14,'transparent',layers,surfaces,{width:9,height:7,sizes:{'stage:surface':{width:9,height:7}}}),undefined);
});
