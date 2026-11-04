import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {orbitalScene} from './scenes.ts';
export {orbitalScene};
export default Composition({id:'native-orbital-observatory',width:640,height:360,fps:24,durationInFrames:24,background:'#010207',children:[Stage({id:'observatory',factory:orbitalScene,outputs:{surface:'surface'}}),Layer({source:ref('observatory')})]});
