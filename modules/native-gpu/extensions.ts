import type {NativeProgram} from './client.ts';
/** Include in the existing Renderer's layout key. No renderer/scheduler here. */
export function nativeExtensionLayout(program:NativeProgram){return {frameContinuation:program.frameContinuation??null,rayScenes:program.passes.map(p=>p.rayBuild??null),version:1,resourceLease:program.resourceLease??null,imports:program.imports??[],inferences:program.inferences??[],bufferOutputs:program.bufferOutputs??[],dataExport:program.dataExport??null};}
