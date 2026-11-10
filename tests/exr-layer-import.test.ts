import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,realpath,rename,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {buildProject} from '../src/compiler/build.ts';
import {exportProject} from '../src/compiler/export.ts';
import {inspectExr,readExr} from '../src/media/ocio.ts';
import {linear709,pixelsFromSurface} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';

const fixture = `
from pathlib import Path
import sys
import numpy as np
import OpenEXR as exr
root = Path(sys.argv[1])
y, x = np.mgrid[:8, :8]
for frame, center in enumerate([2, 4, 2]):
    rim = (y == 4)
    drop = np.where(rim | (y > 5), 0, np.maximum(0, 5 - (x-center)**2 - (y-3)**2)).astype('f') / 2
    tea = np.where(y == 6, 1.25, 0).astype('f')
    one = np.ones_like(drop)
    beauty = dict(R=one*.25+drop+tea, G=one*.5+drop, B=one*.125+tea, A=one)
    selected = {'drop.R':drop, 'drop.G':drop.astype('e'), 'drop.B':drop*0,
                'tea.R':tea, 'tea.G':tea*0, 'tea.B':tea, 'objectId':one.astype('I')}
    with exr.File([exr.Part({},beauty,'beauty'), exr.Part({},selected,'passes')]) as f:
        f.write(str(root / ('shot-%s.exr' % frame)))
window = (np.array([-2,-1], dtype='i'), np.array([0,0], dtype='i'))
display = (np.array([-4,-2], dtype='i'), np.array([2,2], dtype='i'))
with exr.File({'dataWindow': window, 'displayWindow': display},
              {c: np.full((2,3), 2, dtype='f') for c in 'RGB'}) as f:
    f.write(str(root / 'cropped.exr'))
tiles = exr.TileDescription()
tiles.xSize, tiles.ySize = 4, 4
with exr.File({'type': exr.tiledimage, 'tiles': tiles},
              {c: np.full((8,8), -1.5, dtype='e') for c in 'RGB'}) as f:
    f.write(str(root / 'tiled.exr'))
`;

const entry = `
/** @jsxImportSource @frameweave/engine */
import {Composition,Layer,Resource,Stage,ref,linear709} from '@frameweave/engine';
import {exrResource,imageStage} from '@frameweave/engine/image-effects';
import {drop,tea} from './controls.ts';
const frames = [0,1,2];
function contribution(prefix: 'drop'|'tea'|'beauty') {
  const opaque = prefix === 'beauty', channels = opaque
    ? {r:'R',g:'G',b:'B',a:'A'} as const
    : {r:prefix+'.R',g:prefix+'.G',b:prefix+'.B',a:0} as const;
  const sources = frames.map(n => exrResource('shot-'+n,{color:linear709,alpha:opaque?'opaque':'premultiplied',
    selection:{part:opaque?'beauty':'passes',window:'display',channels}}));
  return imageStage(image => image,{source:frame => sources[frame.context?.frame ?? 0](frame)});
}
export const beautyStage=contribution('beauty'), dropStage=contribution('drop'), teaStage=contribution('tea');
export default <Composition width={8} height={8} fps={24} durationInFrames={3} background="transparent">
  {frames.map(n=><Resource key={n} id={'shot-'+n} kind="file" src={'./shot-'+n+'.exr'}/>)}
  <Stage id="beauty" factory={beautyStage}/><Stage id="drop" factory={dropStage}/><Stage id="tea" factory={teaStage}/>
  <Layer id="beauty" source={ref('beauty')}/>
  <Layer id="drop" source={ref('drop')} opacity={drop} blend="lighter"/>
  <Layer id="tea" source={ref('tea')} opacity={tea} blend="lighter"/>
</Composition>;
`;

const python = process.env.FRAMEWEAVE_MEDIA_PYTHON;
test('direct multipart EXR with independent HDR adjustments survives a detached, editable handoff',
  {skip:!python&&'Requires the reviewed OpenEXR media Python',timeout:150000},async(t)=>{
  const parent=await realpath(tmpdir()),root=await mkdtemp(join(parent,'fw-exr-'));
  const original=join(root,'source'),carried=join(root,'handoff'),offline=join(root,'offline');
  t.after(async()=>{assert.equal(dirname(await realpath(root)),parent);await rm(root,{recursive:true});});
  await mkdir(original);
  execFileSync(resolve(python!),['-c',fixture,original],{windowsHide:true,timeout:15000});
  const file = join(original,'shot-0.exr');
  const metadata = await inspectExr(file);
  assert.deepEqual(metadata.parts.map(p=>p.name),['beauty','passes']);
  assert.ok(metadata.parts[1].channels.some(c=>c.name==='drop.G'));
  const selection = {part:1,window:'data',channels:{r:'drop.R',g:'drop.G',b:'drop.B',a:0}} as const;
  const options = {selection,color:linear709,alpha:'premultiplied'} as const;
  await assert.rejects(readExr(file,{...options,maxDecodedBytes:1}),/decode needs/);
  await assert.rejects(readExr(file,{...options,selection:{...selection,part:'absent'}}),/part must exist/);
  await assert.rejects(readExr(file,{...options,selection:{...selection,channels:{...selection.channels,r:'absent'}}}),/Missing EXR channel/);
  await assert.rejects(readExr(file,{...options,selection:{...selection,channels:{...selection.channels,r:'objectId'}}}),/HALF\/FLOAT/);
  const cropped = await readExr(join(original,'cropped.exr'),{...options,
    selection:{part:0,window:'display',channels:{r:'R',g:'G',b:'B',a:1}}});
  assert.equal(cropped.surface.width,7);
  assert.equal(cropped.surface.height,5);
  const padded = pixelsFromSurface(cropped.surface);
  assert.deepEqual([...padded.subarray(0,4)],[0,0,0,0]);
  assert.deepEqual([...padded.subarray(36,40)],[2,2,2,1]);
  const tiled=await readExr(join(original,'tiled.exr'),{...options,
    selection:{part:0,window:'data',channels:{r:'R',g:'G',b:'B',a:1}}});
  assert.deepEqual([...pixelsFromSurface(tiled.surface).subarray(0,4)],[-1.5,-1.5,-1.5,1]);
  await writeFile(join(original,'project.tsx'),entry);
  const controls = (dir:string,drop:number,tea:number) =>
    writeFile(join(dir,'controls.ts'),['export const drop = '+drop,'export const tea = '+tea].join('\n'));
  const executable = await nativeExecutable();
  async function render(dir:string, order:number[]){
    const build = await buildProject(join(dir,'project.tsx'));
    const renderer = await Renderer.create(build,{nativeGpu:{executable,slots:1,maxBytes:64*1024**2,readback:'final-surface'}});
    try{
      const rows:Float32Array[]=[];
      for(const frame of order)rows.push(pixelsFromSurface(await renderer.renderNativeSurface(frame)));
      return rows;
    }finally{await renderer.close();}
  }
  const beauty = pixelsFromSurface((await readExr(file,{color:linear709,alpha:'opaque'})).surface);
  await controls(original,0,0);
  assert.deepEqual((await render(original,[0]))[0],beauty);
  await controls(original,.5,.25);
  const before = await render(original,[0,1,2]);
  assert.deepEqual(before[0],before[2]);
  const sample = (x:number,y:number)=>4*(y*8+x);
  assert.equal(before[0][sample(2,3)],.25+2.5*1.5);
  assert.equal(before[0][sample(2,4)],beauty[sample(2,4)]);
  assert.equal(before[0][sample(2,6)+2],.125+1.25*1.25);
  await exportProject(join(original,'project.tsx'),{output:carried});
  for(const i of [0,1,2])assert.deepEqual(await readFile(join(original,'shot-'+i+'.exr')),await readFile(join(carried,'shot-'+i+'.exr')));
  assert.equal(dirname(await realpath(original)),await realpath(root));
  await rename(original,offline);
  try{
    assert.deepEqual(await render(carried,[2,0,1,0]),[before[2],before[0],before[1],before[0]]);
    await controls(carried,.75,.25);
    const [edited]=await render(carried,[0]);
    assert.equal(edited[sample(2,3)],.25+2.5*1.75);
    assert.equal(edited[sample(2,4)],beauty[sample(2,4)]);
    assert.equal(edited[sample(2,6)+2],before[0][sample(2,6)+2]);
    await controls(carried,.75,.5);
    const [teaEdited]=await render(carried,[0]);
    assert.equal(teaEdited[sample(2,3)],edited[sample(2,3)]);
    assert.equal(teaEdited[sample(2,6)+2],.125+1.25*1.5);
    for(let i=0;i<teaEdited.length;i++){
      if(i%4===3 || Math.floor(i/(8*4))===4)assert.equal(teaEdited[i],beauty[i]);
    }
  }finally{await rename(offline,original);}
});
