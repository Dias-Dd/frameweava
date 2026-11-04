// SPDX-License-Identifier: Apache-2.0
// Explicit parameter opt-in only; no permission, pixel capability, runtime or module registry.
import type {GlyphSelector} from '../text-animation/common.ts';
const extended=new WeakSet<GlyphSelector>();
export function extendedInfluence<T extends GlyphSelector>(input:T):T{extended.add(input);return input;}
export function hasExtendedInfluence(input:GlyphSelector){return extended.has(input);}
