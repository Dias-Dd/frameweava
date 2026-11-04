import type {Diagnostic,Rational} from '../../src/core/types.ts';

export type InspectionSource='request'|'compiler'|'resource'|'module'|'renderer'|'comparison'|'inspection';
export interface InspectionDiagnostic extends Diagnostic {
  source:InspectionSource;path?:string;location?:{file:string;line?:number;column?:number};
}
export interface ImageReference {
  id:string;uri:string;file:string;mime:'image/png';sha256:string;rgbaSha256:string;
  bytes:number;width:number;height:number;
}
export interface InspectionPolicy {
  media?:import('../../src/media/compositor.ts').MediaPolicy;
  mode:'accurate'|'preview';capture:'png';gpuPolicy:'swiftshader'|'auto';cache:boolean;allowWasm:boolean;
  environment:{platform:string;arch:string;node:string;engineVersion:string;sdkIntegrity:string;browserExecutable?:string;browserVersion:string;gpuDevice:'not-probed'};
}
export interface FrameInspection {
  shared?:import('../shared-state/coordinator.ts').SharedCommit;
  index:number;frame:number;time:number;stageId?:string;ok:boolean;image?:ImageReference;
  diagnostics:InspectionDiagnostic[];
  backend:{renderer:'FrameWeave.Renderer';capture:'composition'|'stage-surface';gpuPolicy:'swiftshader'|'auto';stageEngines:string[]};
  cache:{enabled:boolean;stageHits:number;stageResultsReused:boolean;finalImageReused:false};
  stageReportedBackends:Record<string,string>;
}
export interface ProjectSummary {
  hash:string;tvgSchemaVersion:string;composition:{id:string;width:number;height:number;fps:Rational;durationInFrames:number};
  stageCount:number;stages:{id:string;engine:string;dependencies:string[];outputs:Record<string,string>;entry?:string}[];
  sourceFileCount:number;resourceCount:number;resources:{id:string;kind:string;source:string;sha256:string;bytes:number}[];
  modules:{reference:string;integrity:string;source:{kind:string;authority:string}}[];
  pluginReferences:string[];requirements:{capability:string;evidence:string;certainty:'declared'|'possible'}[];
  omitted:{stages:number;resources:number;modules:number;plugins:number};
}
export interface InspectionReport {
  schemaVersion:1;kind:'frameweave.render-inspection';ok:boolean;project:string;
  diagnostics:InspectionDiagnostic[];suggestedActions:string[];summary?:ProjectSummary;
  policy:InspectionPolicy;frames:FrameInspection[];images:ImageReference[];storyboard?:ImageReference;
  anomalies:{frame?:number;code:string;reason:string}[];
  reportFile:string;rendered:boolean;
  session?:{id:string;generation:number;builds:number;hostStarts:number;hostReused:boolean;invalidations:number};
}
export interface InspectOptions {
  project:string;output?:string;frames?:number[];times?:number[];storyboard?:boolean;stageId?:string;
  width?:number;height?:number;mode?:'accurate'|'preview';cache?:boolean;allowWasm?:boolean;
  timeoutMs?:number;executablePath?:string;media?:import('../../src/media/compositor.ts').MediaPolicy;
}
export interface PixelTolerance {maxChannelDifference:number;mae:number;maxAlphaDifference:number}
export interface PixelMetrics {
  exact:boolean;changedPixels:number;outsideTolerancePixels:number;maxChannelDifference:number;mae:number;
  alpha:{changedPixels:number;maxDifference:number;mae:number};
  black:{maxDifference:number;mae:number};white:{maxDifference:number;mae:number};
}
export interface PixelComparison {
  kind:'frameweave.image-comparison';schemaVersion:1;ok:boolean;status:'match'|'different'|'dimension-mismatch';
  dimensions:{before:{width:number;height:number};after:{width:number;height:number}};
  sourceFormats:{before:string;after:string};strategy:'decoded-rgba8-srgb'|'lossy-decoded-rgba8-srgb';
  tolerance:PixelTolerance;metrics?:PixelMetrics;
}
export interface CompareOptions {output?:string;tolerance?:Partial<PixelTolerance>;allowLossy?:boolean;allowPolicyDifference?:boolean}
export interface InspectionIterationReport {
  schemaVersion:1;kind:'frameweave.inspection-iteration';ok:boolean;project?:string;iteration?:number;remaining?:number;
  inspection?:InspectionReport;comparison?:ComparisonReport;diagnostics:InspectionDiagnostic[];suggestedActions:string[];
}
export interface ComparisonReport {
  schemaVersion:1;kind:'frameweave.inspection-comparison';ok:boolean;status:'match'|'different'|'needs-review'|'invalid';
  before:string;after:string;diagnostics:InspectionDiagnostic[];suggestedActions:string[];
  pairs:{key:string;frame:number;status:'compared'|'missing-before'|'missing-after'|'render-failed';comparison?:PixelComparison;images:ImageReference[]}[];
  images:ImageReference[];anomalies:{frame:number;code:string;reason:string}[];reportFile:string;
}
