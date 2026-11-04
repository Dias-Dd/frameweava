import type {Diagnostic} from '../core/types.ts';
import type {SearchFilter} from '../plugins/registry.ts';
import type {PluginManifest} from '../plugins/sdk.ts';

export interface CapabilityQuery {
  project?:string;
  /** Explicit local R1 catalogs only. No global capability registry or remote index. */
  catalogs?:string[];
  platform?:'web'|'node';
  expectedIntegrity?:string;
}
export interface CapabilitySearch extends CapabilityQuery {query:string;mode?:'keyword'|'semantic'|'hybrid';limit?:number;offset?:number;filters?:SearchFilter;includeLowLevel?:boolean}
export interface CapabilityIdentity {
  reference:string;id:string;version:string;
  /** R1 canonical package hash, or legacy P4 plugin hash, never interchangeable. */
  integrity:string;integrityKind:'package'|'plugin';pluginIntegrity:string;
}
export interface CapabilityCommand {executable:'frameweave';args:string[];requiresSourceApproval:boolean}
export interface CapabilityDependency {id:string;range:string;installed:string[];catalog:string[];state:'installed'|'local-candidate'|'missing'}
export interface CapabilitySummary {
  identity:CapabilityIdentity;name:string;description:string;descriptionTruncated:boolean;kind:PluginManifest['kind'];
  source:{kind:'builtin'|'project'|'user'|'package';location:string;authority:string|null;catalog:boolean};
  trust:{system:'r1'|'legacy';state:'approved'|'approval-required'|'not-recorded'|'bundled'};
  availability:{state:'eligible'|'not-installed'|'missing-dependencies'|'requires-lock'|'blocked';installed:boolean;contentVerified:true;runtimeVerified:false};
  locks:{plugin:'verified'|'missing'|'stale'|'not-installed';package:'verified'|'not-applicable'|'not-installed'};
  requirements:{backend:string;platforms:string[];capabilities:string[];hostAuthorization:string[];worker:'unknown'};
  assessment:{platform:'web'|'node';compatible:boolean;execution:'not-verified';diagnostics:Diagnostic[]};
  dependencies:CapabilityDependency[];commands:{install:CapabilityCommand|null;lock:CapabilityCommand|null};
}
export interface CapabilityExample {
  format:'tsx-expression'|'tsx-project';code:string;completeProject:boolean;
  source:{kind:'manifest'|'kit-demo';path:string;index:number|null;integrity:string};
  validation:{reference:'exact';parameters:'p4-static';typescript:'passed';execution:'not-run'};
}
export interface CapabilityApi {
  state:'present'|'missing';path:string|null;integrity:string|null;
  profile?:string;functions?:{name:string;signature:string;documentation:string}[];
  errors?:string[];environment?:Record<string,unknown>;limitations?:string[];
}
