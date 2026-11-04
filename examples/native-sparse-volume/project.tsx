import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createSparseVolume} from '../../modules/sparse-volume/index.ts';import {createSparseSlice} from './effect.ts';
export const slice=defineNativeStage(async init=>{const volume=await createSparseVolume(init.gpu,{version:1,resource:'volume',bytes:2452256,gridClass:'level-set',maxRootTiles:128,worldSpace:'world',worldUnits:'meter',valueUnits:'meter'}),effect=await createSparseSlice(init.gpu,volume,init.width,init.height);return {renderAt(c){return effect.render(c.frame,true);},dispose(){return volume.dispose();}};});
export default <Composition width={160} height={90} fps={24} durationInFrames={8} background="transparent"><Resource id="volume" src="./sdf.raw" kind="file"/><Stage id="slice" factory={slice}/><Layer source={ref('slice')}/></Composition>;
