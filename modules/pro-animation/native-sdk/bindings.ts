import type {NativePluginInit} from '../../../src/plugins/sdk.ts';
import {nativeLibraryBindings} from '../../native-gpu/library-bindings.ts';
import * as library from './public.ts';
export function initialize(init:NativePluginInit){return nativeLibraryBindings(init,library);}
