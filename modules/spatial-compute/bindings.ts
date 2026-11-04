import * as effects from './index.ts';
/** Borrow caller-owned Stage scope; no device or time runner allocated here. */
export function initialize(){return {exports:effects};}
