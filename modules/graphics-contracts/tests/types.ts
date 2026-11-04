import type {PathData,MaskData,MeshData,TrackData,TextLayoutData} from '../types.ts';
import {validatePathData,validateMaskData,validateMeshData,validateTextLayoutData} from '../validate.ts';
import {validateTrackData} from '../track.ts';

// Compile-only negative/positive API checks; no ambient any and no assertions substituting validation.
function consume(input:unknown){
  const path:PathData=validatePathData(input),mask:MaskData=validateMaskData(input),mesh:MeshData=validateMeshData(input),track:TrackData=validateTrackData(input),text:TextLayoutData=validateTextLayoutData(input);
  path.commands.forEach(command=>{if(command.op==='C')command.control1.x.toFixed(2);});
  if(mask.kind==='raster')mask.source.sha256.toLowerCase();
  mesh.restPositions[0][2].toFixed(2);track.samples[0].timestampUs.toFixed();text.glyphs[0].cluster.start.toFixed();
  // @ts-expect-error shared Path versions are explicit literals
  path.version=2;
  // @ts-expect-error coordinates cannot be an untyped object or Y-up data
  path.coordinates.y='up';
  // @ts-expect-error Canvas is a live handle, not JSON path geometry
  const invalid:PathData=document.createElement('canvas');
  // @ts-expect-error MVP confidence must remain null
  track.samples[0].confidence=.8;
  // @ts-expect-error raster-specific members require discriminant narrowing
  mask.source.sha256;
  return {path,mask,mesh,track,text,invalid};
}
void consume;
