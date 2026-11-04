import { Composition, Stage, Layer, Rect, ref, keyframes } from '@frameweave/engine';
export default <Composition id="E2E pixels" width={320} height={180} fps={12} durationInFrames={12} background="#000000" seed={42}>
  <Stage id="background" entry="./background.ts" outputs={{ surface: 'surface', frameValue: 'number', clock: 'number', random: 'number' }} />
  <Stage id="foreground"><Rect x={keyframes([{ frame: 0, value: 10 }, { frame: 6, value: 70 }])} y={10} width={20} height={20} fill="#ff0000" /></Stage>
  <Stage id="consumer" entry="./consumer.ts" outputs={{ received: 'number', imageWidth: 'number' }} inputs={{ frameValue: ref('background', 'frameValue'), image: ref('background', 'surface') }} inputTypes={{frameValue:'number',image:'surface'}} />
  <Layer id="bg" source={ref('background')} />
  <Layer id="parent" x={10} y={10} opacity={0.5}><Layer id="fg" source={ref('foreground')} x={10} y={10} /></Layer>
</Composition>;
