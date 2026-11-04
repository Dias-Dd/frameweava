/** Editable source capsule. Inner modules keep their original TS/TSX and ESM boundaries.
 * FrameWeave materializes these declared files before its normal typecheck/esbuild pipeline.
 * This is not a general JavaScript loader and importing it in a browser does not render it.
 */
export interface RuntimeIdentity {apiVersion:1;engineVersion:string;integrity:string}
export interface RuntimeRequirement {schemaVersion:1;runtime:RuntimeIdentity;packages:Record<string,string>}
export interface PortableProject {
  schemaVersion:1;
  entry:string;
  sources:Record<string,string>;
  blobs:Record<string,{base64:string; text?:never}|{text:string;base64?:never}>;
  files:Record<string,string>;
  /** Carried siblings, or explicit environment-dependent absolute file references. */
  siblings?:Record<string,string>;
  runtime?:RuntimeRequirement;
}
