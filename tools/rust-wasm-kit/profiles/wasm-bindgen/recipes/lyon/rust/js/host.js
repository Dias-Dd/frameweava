// SPDX-License-Identifier: Apache-2.0
let observations = 0;
export function report_measure(value) { observations++; return value; }
export function report_count() { return observations; }
