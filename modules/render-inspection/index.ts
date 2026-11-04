/** Node-side service shared by CLI and future MCP adapters. No implicit code editing or registry. */
export {inspectProject} from './inspect.ts';
export {compareInspections,compareImageBuffers,compareImageFiles} from './compare.ts';
export {readInspectionImage,serveInspectionImages} from './images.ts';
export {inspectIteration} from './session.ts';
export type * from './types.ts';
