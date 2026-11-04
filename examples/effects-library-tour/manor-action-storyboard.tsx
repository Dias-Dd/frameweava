/** Explicit 1 FPS animated storyboard of the entire 24-second choreography.
 * This is a pose review, not the full-resolution final or a real-time claim.
 */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {drawingRoom} from './manor-drawing-room.tsx';
export {drawingRoom};
export default <Composition id="manor-action-storyboard" width={640} height={360} fps={1} durationInFrames={24} seed={1896}>
 <Stage id="drawing-room" factory={drawingRoom}/><Layer source={ref('drawing-room')}/>
</Composition>;
