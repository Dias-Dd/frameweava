export type {EditingStage} from './runtime.ts';
/** Load visual implementation only when its Native factory is invoked.
 * An Audio Stage may evaluate the same TSX module without initializing Three/GPU helpers. */
export async function createEditingStage(...args:Parameters<typeof import('./runtime.ts').createEditingStage>):ReturnType<typeof import('./runtime.ts').createEditingStage>{
 return (await import('./runtime.ts')).createEditingStage(...args);
}
