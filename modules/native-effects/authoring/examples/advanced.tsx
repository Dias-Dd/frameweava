import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {keyframes} from '../../../../src/core/animation.ts';
import {imageStage,floatImageResource,compose,twirl,guidedDenoise,lensDirt,foregroundGrade,spatialDeblur} from '../index.ts';
// The source and auxiliary dirt plate are declared assets, not filesystem access.
// imageStage prepares both once; ordinary effects never manage GPU textures.
const photo=floatImageResource('photo'),dirt=floatImageResource('dirt');
const psf={kind:'frameweave.psf-grid',schemaVersion:1,columns:1,rows:1,kernelWidth:3,kernelHeight:1,kernels:[[.1,.8,.1]]} as const;
export const finished=imageStage(compose(
  twirl({angle:keyframes([{frame:0,value:0},{frame:6,value:12},{frame:11,value:4}]),boundary:'clamp'}),
  guidedDenoise({radius:1,epsilon:.004}),
  spatialDeblur(psf,{iterations:2}),
  lensDirt(dirt,{radius:2,threshold:1,intensity:.04,dirtGain:.5}),
  foregroundGrade({exposure:.1,saturation:.9}),
),{source:photo});
export default <Composition width={160} height={90} fps={24} durationInFrames={12} background="transparent"><Resource id="photo" src="./assets/input.f32" kind="file"/><Resource id="dirt" src="./assets/photo.f32" kind="file"/><Stage id="finish" factory={finished}/><Layer source={ref('finish')}/></Composition>;
