import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {galleryScene} from './scenes.ts';
export {galleryScene};
export default Composition({id:'native-spatial-recipes',width:320,height:180,fps:24,durationInFrames:24,background:'transparent',children:[Stage({id:'recipes',factory:galleryScene,outputs:{surface:'surface'}}),Layer({source:ref('recipes')})]});
