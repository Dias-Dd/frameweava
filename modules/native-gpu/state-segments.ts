import {assertNativeMetadata} from './capacity.ts';
import {EngineError} from '../../src/core/errors.ts';
import {linear709} from '../../src/media/surface.ts';
import type {NativeProgram} from './client.ts';
import type {NativeRecordingScope} from './scope.ts';
export type NativeStatePacket=ReturnType<NativeRecordingScope['packet']>;
export interface NativeStateSegment {program:NativeProgram;parameters:number[][];frame:number}
export type ExecuteNativeStateSegment=(segment:NativeStateSegment,signal?:AbortSignal)=>Promise<void>;
