import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {creationGallery,ribbonScene,sculptureScene,cloneScene,energyScene} from 'spatial-creation-candidate';
// A complete moving four-card composition. Change columns, gap, card color or
// a source scene; the same Native owner manages every intermediate image.
export const shot=defineNativeStage(()=>creationGallery([
 ribbonScene({ribbon:{strands:2,segments:32,ink:'#e8a26f'}}),
 sculptureScene({camera:{orbit:{azimuth:18,elevation:14,speed:10},viewHeight:3.2}}),
 cloneScene({shape:'box',geometry:{size:[.8,.8,.8]},size:.3,layout:{kind:'wave',grid:[5,3,1],spacing:[.45,.45,.45],amplitude:.2,speed:3}}),
 energyScene({energy:{initialCount:65,rate:15}}),
],{layout:{kind:'grid',columns:2},gap:keyframes([{frame:0,value:6},{frame:23,value:16}]),padding:12,cards:{size:[600,338],padding:10,color:'#e2ded6',shadow:{radius:3,offset:[0,4],opacity:.45}}}));
export default Composition({id:'layout-shot',width:640,height:360,fps:24,durationInFrames:24,seed:37,children:[Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')})]});
