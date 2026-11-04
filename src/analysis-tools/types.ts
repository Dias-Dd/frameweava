import type {Diagnostic} from '../core/types.ts';
import type {AnalysisSnapshot,AnalysisTaskHandle,AnalysisArtifact} from '../node.ts';

export interface AnalysisRunRequest {capabilityId:string;input:string;parameters?:Record<string,unknown>}
export interface AnalysisQuery {time?:number;from?:number;to?:number;limit?:number;offset?:number;mode?:'linear'|'nearest';maxGapSeconds?:number}
export interface AnalysisBatchQuery {times:number[];mode?:'linear'|'nearest';maxGapSeconds?:number}
export interface AnalysisPreviewOptions {mode?:'linear'|'nearest';maxGapSeconds?:number;backend?:'node'|'renderer'}
export interface AnalysisJobView {
  jobId:string;capabilityId:string;state:AnalysisSnapshot['state'];phase:string;completed:number;total?:number;progress?:number;
  executionFinished:boolean;cleanupFinished:boolean;cleanup?:AnalysisSnapshot['cleanup'];error?:Diagnostic;
  scope:'live-service'|'terminal-receipt';controllable:boolean;artifactId?:string;
}
export interface AnalysisToolEvent {schemaVersion:1;event:'analysis.progress';job:AnalysisJobView}
export interface CapabilityDescription {
  id:string;name:string;aliases:string[];version:string;description:string;
  source:{kind:'engine-bundled';algorithmId:string;entrySha256:string};
  availability:{ready:boolean;runtimeVerified?:false;diagnostics:Diagnostic[]};
  parameters:Record<string,{default:number;minimum:number;maximum:number;integer?:boolean}>;
  outputType:string;operations:string[];limitations:string[];
}
export interface AnalysisCapability {
  description:CapabilityDescription;
  module:string;exportName:string;
  prepare(input:string,parameters:Record<string,unknown>):Promise<unknown>;
}
export type ToolArtifact={directory:string;manifest:AnalysisArtifact<any>};
export type LiveAnalysisHandle=AnalysisTaskHandle<any,any>;
