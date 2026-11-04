import type {MeshData,Vec2,Vec3} from '../../graphics-contracts/types.ts';
export type {MeshData,Vec2,Vec3};
export interface PuppetOptions {
  /** Existing Kit Worker is the default; direct runs cannot preempt synchronous WASM. */
  worker?:boolean;signal?:AbortSignal;initializationTimeoutMs?:number;
  /** Worst-case sparse multiply-add envelope, not a timing guarantee. Configurable. */
  maxSolveWork?:number;
}
export interface PuppetConstraints {
  pins:{vertexId:string;position:Vec2}[];
  /** Per triangle Starch weights, default1. Positive, at most1e9. */
  triangleWeights?:number[];
  /** Soft oriented edge-vector targets (Bend/scale). Same mesh XY meter space. */
  edges?:{from:string;to:string;vector:Vec2;weight:number}[];
  /** Extra rigid-fit iterations. Never adapted to render speed. Default2. */
  refine?:number;
  /** ARAP does not prevent triangle foldovers. Default reject; allow reports them. */
  foldovers?:'reject'|'allow';
}
export interface PuppetResult {
  /** Owned output, aligned to the original MeshData vertexIds; not a new wire schema. */
  positions:Vec3[];
  diagnostics:{backend:'rust-wasm';cgIterations:number;maxRelativeResidual:number;foldedTriangles:number;collapsedTriangles:number;estimatedWork:number};
}
export interface Puppet {
  solve(constraints:PuppetConstraints):Promise<PuppetResult>;
  diagnostics():Promise<{disposed:boolean;buffers:number}>;
  dispose():Promise<{remainingBuffers:number}>;
}

export interface PuppetMeshOptions {
  id:string;spaceId?:string;
  /** Explicit source-pixel to meter mapping; top-left UV, XY up. */
  world:{left:number;right:number;bottom:number;top:number;z?:number};
  /** Mask includes alpha>0 AND alpha>=threshold. No RGB/luma test. */
  threshold?:number;edgeLengthPx?:number;simplifyPx?:number;expansionPx?:number;
  holes?:'preserve'|'fill'|'reject';
  budget?:{maxVertices?:number;maxTriangles?:number;maxContours?:number;maxProcessedPixels?:number;maxWorkingBytes?:number;maxWork?:number;maxReplyBytes?:number};
}
export interface PuppetMeshResult {
  mesh:MeshData|null;
  components:{id:number;vertexIds:string[];anchorVertexId:string}[];
  contours:{kind:'outer'|'hole';component:number;pointsPx:Vec2[];includedBoundary:boolean}[];
  diagnostics:{backend:'rust-wasm';algorithm:'effectcraft-alpha-constrained-delaunay';sourceWidth:number;sourceHeight:number;selectedPixels:number;expandedPixels:number;processedPixels:number;areaPixels:number;work:number;vertices:number;triangles:number;holePolicy:string;edgeLengthPx:number;simplifyPx:number;expansionPx:number;threshold:number};
}
export interface PuppetProcessor {
  generateMesh(source:import('../../../src/media/surface.ts').ProfessionalSurface,options:PuppetMeshOptions):Promise<PuppetMeshResult>;
  solve(mesh:MeshData,constraints:PuppetConstraints):Promise<PuppetResult>;
  diagnostics():Promise<{disposed:boolean;buffers:number}>;
  dispose():Promise<{remainingBuffers:number}>;
}
