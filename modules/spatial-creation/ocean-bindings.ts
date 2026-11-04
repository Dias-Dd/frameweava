import {nativeLibraryBindings} from '../native-gpu/library-bindings.ts';
import * as library from './ocean-entry.ts';import type {NativePluginInit} from '../../src/plugins/sdk.ts';
export function initialize(init:NativePluginInit){return nativeLibraryBindings(init,library);}
