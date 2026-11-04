/** @jsxImportSource @frameweave/engine */
import {CLOTH_FPS,CLOTH_SEED} from './dihedral-setup.ts';
import {Composition,Stage} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={CLOTH_FPS} durationInFrames={101} seed={CLOTH_SEED}><Stage id="dihedral" entry="./dihedral-numeric.ts" seek="stateless" outputs={{state:'json',metrics:'json'}}/></Composition>;
