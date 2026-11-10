import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,open,rename,rm,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {endianness} from 'node:os';
import sharp from 'sharp';
import {EngineError} from '../../src/core/errors.ts';
import {srgb,linear709} from '../../src/media/surface.ts';
import {transformPixels} from '../../src/media/color.ts';
import {characterDocument} from '../spatial-creation/character-animation.ts';
import type {SceneTextureAtlas,SceneTextureRegion} from './scene-textures.ts';

export interface NativeCharacterPreparationOptions {
  resource?:string;
  /** @deprecated No authored atlas byte quota is imposed. */
  maxAtlasBytes?:number;
  /** @deprecated Actual GPU dimensions are admitted by the consuming owner. */
  maxDimension?:number;
  maxDocumentBytes?:number;
  maxDocumentWork?:number;
}
interface Tile {
  id:string;image:string;color:boolean;width:number;height:number;
  bytes:Buffer;depth:string;icc:boolean;
}

/** Explicit Node preparation. Runtime reads only the generated declared files.
 * Color conversion happens once; data maps retain the original 8/16-bit codes. */
export async function prepareNativeCharacterAsset(document:unknown,directory:string,
    options:NativeCharacterPreparationOptions={}) {
  const asset=characterDocument(document,{maxBytes:options.maxDocumentBytes,maxWork:options.maxDocumentWork});
  const resource=options.resource??'character-atlas';
  if(!/^[a-zA-Z0-9_-]+$/.test(resource))
    throw new EngineError('E_NATIVE_CHARACTER_PREPARE','Require a safe Resource ID');
  const fail=(message:string):never=>{throw new EngineError('E_NATIVE_CHARACTER_PREPARE',message);};
  const tiles=new Map<string,Tile>(),regions:Record<string,SceneTextureRegion>={};
  const materialTextures:Record<string,Partial<Record<'color'|'roughness'|'normal'|'emission'|'occlusion'|'transmission',string>>>={};
  const regionTiles=new Map<string,Tile>();
  const names=new Map(asset.images.map(image=>[image.id,image]));
  const sources:Record<string,{sha256:string;color:boolean;width:number;height:number;depth:string;icc:string}>={};
  for(const primitive of asset.primitives) {
    const material=primitive.material;
    const channels=[['color',material.texture],['roughness',material.metallicRoughnessTexture],
      ['normal',material.normalTexture],['emission',material.emissiveTexture],['occlusion',material.occlusionTexture],['transmission',material.transmissionTexture]] as const;
    for(const [channel,texture] of channels) {
      if(!texture)continue;
      const color=channel==='color'||channel==='emission',key=JSON.stringify([texture.image,color]);
      let tile=tiles.get(key);
      if(!tile) {
        const image=names.get(texture.image);
        if(!image?.bytes.length)return fail('Explicit image bytes missing for '+texture.image);
        const bytes=Buffer.from(image.bytes),metadata=await sharp(bytes,{limitInputPixels:false}).metadata();
        if(!['png','jpeg'].includes(metadata.format??'')||!metadata.width||!metadata.height||
            !['uchar','ushort'].includes(metadata.depth??''))
          return fail('Require a complete PNG/JPEG: '+texture.image);
        tile={id:'tile'+tiles.size,image:texture.image,color,width:metadata.width,height:metadata.height,
          bytes,depth:metadata.depth!,icc:!!metadata.icc};
        tiles.set(key,tile);
        sources[tile.id]={sha256:createHash('sha256').update(bytes).digest('hex'),color,width:tile.width,height:tile.height,
          depth:tile.depth,icc:color?tile.icc?'ignored-for-gltf-color':'explicit-srgb':'ignored-for-data'};
      }
      const sampler=JSON.stringify([tile.id,texture.wrapS,texture.wrapT,texture.filter]);
      const name='map_'+createHash('sha256').update(sampler).digest('hex').slice(0,16);
      regions[name]={x:0,y:0,width:tile.width,height:tile.height,addressU:texture.wrapS,addressV:texture.wrapT,filter:texture.filter};
      regionTiles.set(name,tile);
      const bindings=materialTextures[material.id]??={};
      if(bindings[channel]&&bindings[channel]!==name)return fail('Conflicting texture declarations for '+material.id+'.'+channel);
      bindings[channel]=name;
    }
  }
  const list=[...tiles.values()].sort((a,b)=>b.height-a.height||a.id.localeCompare(b.id));
  const minimum=list.reduce((max,t)=>Math.max(max,t.width),1),sum=list.reduce((s,t)=>s+t.width,0);
  const widths=new Set([minimum,Math.max(minimum,sum)]);
  for(let width=minimum;width<sum;width*=2)widths.add(width);
  let layout:{width:number;height:number;positions:Map<string,{x:number;y:number}>}|undefined;
  for(const width of widths) {
    let x=0,y=0,rowHeight=0;
    const positions=new Map<string,{x:number;y:number}>();
    for(const tile of list) {
      if(x+tile.width>width){x=0;y+=rowHeight;rowHeight=0;}
      positions.set(tile.id,{x,y});x+=tile.width;rowHeight=Math.max(rowHeight,tile.height);
    }
    const height=Math.max(1,y+rowHeight);
    if(!layout||width*height<layout.width*layout.height||
        width*height===layout.width*layout.height&&width>layout.width)layout={width,height,positions};
  }
  if(!layout||!Number.isSafeInteger(layout.width*layout.height*16))
    return fail('Atlas byte extent is not safely addressable');
  for(const [name,tile] of regionTiles) {
    Object.assign(regions[name],layout.positions.get(tile.id));
  }
  const textureAtlas:SceneTextureAtlas|undefined=tiles.size?{
    resource,width:layout.width,height:layout.height,decode:'rgba32float-le',regions,
  }:undefined;
  const output=resolve(directory);
  await mkdir(output,{recursive:true});
  const parent=output;
  const temporary=await mkdtemp(join(parent,'.character-prepare-'));
  const atlasFile=join(temporary,'scene-atlas.f32');
  let file:Awaited<ReturnType<typeof open>>|undefined;
  try {
    if(tiles.size) {
      file=await open(atlasFile,'w');
      await file.truncate(layout.width*layout.height*16);
      for(const tile of list) {
        // glTF defines color encoding by material channel and ignores image ICC.
        let pipeline=sharp(tile.bytes,{ignoreIcc:true,limitInputPixels:false}).ensureAlpha();
        const sixteen=tile.depth==='ushort';
        if(sixteen)pipeline=pipeline.toColourspace('rgb16');
        const decoded=await pipeline.raw({depth:sixteen?'ushort':'uchar'}).toBuffer({resolveWithObject:true});
        if(decoded.info.channels!==4||decoded.info.width!==tile.width||decoded.info.height!==tile.height)
          return fail('Decoder returned a different channel/extent layout');
        const values=sixteen?new Uint16Array(decoded.data.buffer,decoded.data.byteOffset,decoded.data.byteLength/2):decoded.data;
        const normalized=Float32Array.from(values,value=>value/(sixteen?65535:255));
        const pixels=tile.color?transformPixels(normalized,srgb,linear709,'straight').pixels:normalized;
        const raw=Buffer.from(pixels.buffer,pixels.byteOffset,pixels.byteLength);
        if(endianness()!=='LE')raw.swap32();
        const position=layout.positions.get(tile.id)!;
        for(let y=0;y<tile.height;y++) {
          const row=raw.subarray(y*tile.width*16,(y+1)*tile.width*16);
          const written=await file.write(row,0,row.length,((position.y+y)*layout.width+position.x)*16);
          if(written.bytesWritten!==row.length)return fail('Incomplete atlas write');
        }
      }
      await file.sync();await file.close();file=undefined;
    }
    for(const image of asset.images)image.bytes=[];
    const description={version:1 as const,textureAtlas,materialTextures,sources,atlasFile:tiles.size?'scene-atlas.f32':undefined,
      bytes:tiles.size?layout.width*layout.height*16:0};
    await writeFile(join(temporary,'model.character.json'),JSON.stringify(asset)+'\n');
    await writeFile(join(temporary,'scene-textures.json'),JSON.stringify(description,null,2)+'\n');
    if(tiles.size)await rename(atlasFile,join(output,'scene-atlas.f32'));
    await rename(join(temporary,'model.character.json'),join(output,'model.character.json'));
    await rename(join(temporary,'scene-textures.json'),join(output,'scene-textures.json'));
    return description;
  } finally {
    await file?.close();
    if(dirname(temporary)!==parent)throw new EngineError('E_NATIVE_CHARACTER_PREPARE','Unexpected preparation cleanup path');
    await rm(temporary,{recursive:true,force:true});
  }
}
