import { Fragment as FragmentComponent } from './core/authoring.js';
import type { AuthorElement, AuthorChild } from './core/authoring.js';
import { EngineError } from './core/errors.js';
export const Fragment=FragmentComponent;
export function jsx(type:unknown,props:Record<string,unknown>|null,key?:string):AuthorElement {
  if (typeof type!=='function') throw new EngineError('E_JSX_INTRINSIC',`Video JSX requires engine components, received '${String(type)}'. Native DOM JSX belongs inside a React Web Stage.`);
  return type({...props,...(key===undefined?{}:{key})}) as AuthorElement;
}
export const jsxs=jsx;
export const jsxDEV=jsx;
export namespace JSX {
  export type Element=AuthorElement;
  export interface ElementChildrenAttribute { children:unknown }
  export interface IntrinsicAttributes { key?:string|number }
  export interface IntrinsicElements {}
}
