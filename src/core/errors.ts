import type { Diagnostic } from './types.js';
import {cleanupFailures} from './failure-cleanup.js';

export interface ErrorContext { stageId?: string; frame?: number; hint?: string; details?: unknown }
export class EngineError extends Error {
  readonly code: string;
  readonly stageId?: string;
  readonly frame?: number;
  readonly hint?: string;
  readonly details?: unknown;
  constructor(code: string, message: string, context: ErrorContext = {}) {
    super(message); this.name = 'EngineError'; this.code = code;
    Object.assign(this, context);
  }
}
export function diagnostic(error: unknown, context: ErrorContext = {}): Diagnostic {
  const cleanup=cleanupFailures(error);
  const secondary=cleanup.length?{cleanupErrors:cleanup.map(e=>({code:e instanceof EngineError?e.code:'E_INTERNAL',message:e instanceof Error?e.message:String(e)}))}:undefined;
  if (error instanceof EngineError) {
    return { code: error.code, severity: 'error', message: error.message,
      ...(error.stageId === undefined ? {} : { stageId: error.stageId }),
      ...(error.frame === undefined ? {} : { frame: error.frame }),
      ...(error.hint === undefined ? {} : { hint: error.hint }),
      ...(error.details === undefined ? {} : { details: error.details }), ...context,
      ...secondary?{details:{primary:Object.hasOwn(context,'details')?context.details:error.details,...secondary}}:{} };
  }
  return { code: 'E_INTERNAL', severity: 'error', message: error instanceof Error ? error.message : String(error), ...context,
    ...secondary?{details:{primary:context.details,...secondary}}:{} };
}
