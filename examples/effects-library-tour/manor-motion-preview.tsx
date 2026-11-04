/** Explicit lightweight motion proof; the main artwork remains 1080p/29.97.
 * Same furniture, shaders, textures, two samples and absolute-time choreography.
 * Only this preview's dimensions and output frame rate are reduced.
 */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {drawingRoom} from './manor-drawing-room.tsx';
export {drawingRoom};
export default <Composition id="manor-motion-proof" width={640} height={360} fps={8} durationInFrames={192} seed={1896}>
 <Stage id="drawing-room" factory={drawingRoom}/>
 <Layer source={ref('drawing-room')}/>
</Composition>;
