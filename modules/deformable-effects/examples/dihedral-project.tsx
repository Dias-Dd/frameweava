/** @jsxImportSource @frameweave/engine */
import {CLOTH_FPS,CLOTH_SEED} from './dihedral-setup.ts';
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={CLOTH_FPS} durationInFrames={49} seed={CLOTH_SEED} background="#0b1524"><Stage id="dihedral" entry="./dihedral-scene.ts" seek="stateless" outputs={{surface:'surface',state:'json',metrics:'json'}}/><Layer source={ref('dihedral')}/></Composition>;
