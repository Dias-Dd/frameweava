import * as effects from './index.ts';
/** Functions borrow a caller-owned PixelScope. R1 does not create a second owner. */
export function initialize(){return {exports:effects};}
