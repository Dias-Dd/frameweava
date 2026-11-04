import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import tracking from '../../../graphics-contracts/examples/track-mvp.json';
import {imageStage,floatImageResource,trackPoint,magnify,type ImageEffect} from '../index.ts';
const face=trackPoint(tracking,{sourceStartSeconds:0});
const look:ImageEffect=(image,frame)=>{const point=face(frame);return point.visible?magnify({center:[point.x,point.y],radius:25,magnification:1.15,feather:8})(image,frame):image;};
export const tracked=imageStage(look,{source:floatImageResource('photo')});
// The checked-in MVP trajectory is control data; no model is executed here.
export default <Composition width={160} height={90} fps={24} durationInFrames={12}><Resource id="photo" src="./assets/photo.f32" kind="file"/><Stage id="tracked" factory={tracked}/><Layer source={ref('tracked')}/></Composition>;
