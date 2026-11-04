import {EngineError} from '../core/errors.ts';
/** Retired browser overlay entry. Node inspection remains in preview-node.ts. */
export async function previewArtifact(..._args:unknown[]):Promise<never>{throw new EngineError('E_WEB_REMOVED','The browser analysis preview was removed. Use the Node inspection backend; new Web content belongs in Servo.');}
