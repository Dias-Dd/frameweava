/// <reference types="@webgpu/types" />
/** Headless Node API. Kept separate so native browser Stages never import Node modules. */
export { buildProject, type BuildOptions } from './compiler/build.ts';
export { Renderer, MockAdapter, type AdapterFactory, type AdapterEnvironment, type RenderPosition } from './render/renderer.ts';
export type {RendererOptions} from './render/renderer.ts';
export type {NativeFrameTicket} from '../modules/native-gpu/client.ts';
export {exportedPositions,type NativeBufferValue} from '../modules/native-gpu/data-export.ts';
export type {NativePixelDescription} from '../modules/native-gpu/program.ts';
export { VideoEncoder, probeVideo, ffmpegPath } from './encoding/ffmpeg.ts';
export type { BuiltProject, RenderOptions, RenderedFrame, StageAdapter } from './core/types.ts';
export {EngineError,diagnostic} from './core/errors.ts';
export {PluginRegistry,discoverPlugins,projectPlugins,writeLock} from './plugins/registry.ts';
export {exportProject,type ExportOptions} from './compiler/export.ts';
export {installUserPlugins,createPlugin} from './plugins/library.ts';
export {userLibraryHome} from './plugins/paths.ts';
export {searchPlugins,indexPlugins,embeddingModel} from './plugins/search.ts';
export {workflowInfo,agentWorkflow,initProject} from './workflow.ts';
export {startPreview,type PreviewOptions} from './preview/server.ts';
export type {PreviewFrame} from './core/types.ts';
export {installPackages,restorePackages,uninstallPackage,installedPackages,verifyPackages,resolvePackages} from './packages/manager.ts';
export type {PackageConfig,PackageLock,PackagePin} from './packages/manager.ts';
export {readPackage,discoverPackages,validatePackage} from './packages/manifest.ts';
export type {PackageManifest,PackageModule,PackageRecord,ModuleFormat,PackageBindings} from './packages/manifest.ts';
export {createAnalysisTask,AnalysisTaskHandle} from './analysis/task.ts';
export {createNodeAnalysisExecutor,type NodeAnalysisOptions} from './analysis/node-executor.ts';
export {AnalysisArtifactStore,analysisHash,analysisCacheKey,hashAnalysisFile,defineAnalysisTask} from './analysis/index.ts';
export type * from './analysis/types.ts';
export {createAnalysisService,AnalysisService,executeAnalysisTool,analysisToolDefinitions} from './analysis-tools/index.ts';
export type {AnalysisRunRequest,AnalysisQuery,AnalysisJobView,AnalysisToolEvent,CapabilityDescription,AnalysisToolName} from './analysis-tools/index.ts';

export {inspectProject,compareInspections,compareImageBuffers,compareImageFiles,readInspectionImage,serveInspectionImages,inspectIteration} from '../modules/render-inspection/index.ts';
export type {InspectOptions,InspectionReport,ComparisonReport,CompareOptions,ImageReference,InspectionDiagnostic} from '../modules/render-inspection/types.ts';
export {openRenderSession,RenderSession} from '../modules/render-session/index.ts';
export type {RenderSessionOptions,SessionInspection} from '../modules/render-session/index.ts';
export type {SessionFrameOptions,SessionFrame,SharedCommit} from '../modules/render-session/index.ts';
export type {FrameExecution} from './render/frame-execution.ts';
export * from './authoring-tools/index.ts';
export * from './audio/node.ts';
export {stageRef,type Ports,type StageRef,type RunOptions,type RunResult} from '../modules/stage-orchestration/types.ts';
export {ANALYSIS_BATCH_LIMITS} from './analysis-tools/index.ts';
export type {AnalysisBatchQuery,AnalysisPreviewOptions} from './analysis-tools/index.ts';

export * from './media/surface.ts';
export * from './media/color.ts';
export * from './media/compositor.ts';
export * from './media/node.ts';
export {ocioInfo,ocioTransform,writeExr,readExr,type OcioTransform} from './media/ocio.ts';
export * from './media/encoding.ts';

export * from './media/input.ts';
export * from './media/service.ts';
export * from './media/stage.ts';
