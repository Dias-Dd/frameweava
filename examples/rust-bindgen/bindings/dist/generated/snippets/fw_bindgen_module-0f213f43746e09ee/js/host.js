// SPDX-License-Identifier: Apache-2.0
let observations = 0;
export function normalize_label(value) { observations++; return value.trim().toUpperCase(); }
export function report_count() { return observations; }
