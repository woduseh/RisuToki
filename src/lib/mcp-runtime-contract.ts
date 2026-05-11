export type RuntimeMode = 'app-backed' | 'standalone';

export interface RuntimeSkew {
  detected: boolean;
  warnings: string[];
}

export interface RuntimeMetadataInput {
  serverVersion: string;
  appVersion: string;
  packageVersion: string;
  buildTime: string | null;
  commit: string | null;
  runtimeMode: RuntimeMode;
  allowWrites?: boolean;
  userDataPath?: string | null;
}

export interface RuntimeMetadata extends RuntimeMetadataInput {
  skew: RuntimeSkew;
}

export interface ToolCatalogHealthTool {
  name: string;
  recommendation?: string;
  surfaceKind?: string;
  workflowStages?: readonly string[];
}

export interface ToolCatalogHealthInput {
  tools: readonly ToolCatalogHealthTool[];
  facadeTools: number;
  readonlyTools: number;
  advancedTools: number;
  allTools: number;
  validRecommendations: readonly string[];
  validSurfaceKinds: readonly string[];
}

export interface ToolCatalogHealthSummary {
  facadeTools: number;
  readonlyTools: number;
  advancedTools: number;
  allTools: number;
  missingWorkflowStages: string[];
  unknownRecommendation: string[];
  unknownSurfaceKind: string[];
}

function describeMismatch(field: string, value: string, expectedField: string, expectedValue: string): string {
  return `${field} (${value}) differs from ${expectedField} (${expectedValue})`;
}

export function buildRuntimeMetadata(input: RuntimeMetadataInput): RuntimeMetadata {
  const warnings: string[] = [];
  if (input.serverVersion !== input.appVersion) {
    warnings.push(describeMismatch('serverVersion', input.serverVersion, 'appVersion', input.appVersion));
  }
  if (input.appVersion !== input.packageVersion) {
    warnings.push(describeMismatch('appVersion', input.appVersion, 'packageVersion', input.packageVersion));
  }
  return {
    ...input,
    skew: {
      detected: warnings.length > 0,
      warnings,
    },
  };
}

export function mergeRuntimeMetadata(
  serverRuntime: RuntimeMetadata,
  appRuntime: RuntimeMetadata | null | undefined,
): RuntimeMetadata {
  if (!appRuntime) return serverRuntime;
  return buildRuntimeMetadata({
    serverVersion: serverRuntime.serverVersion,
    appVersion: appRuntime.appVersion,
    packageVersion: appRuntime.packageVersion,
    buildTime: serverRuntime.buildTime,
    commit: serverRuntime.commit,
    runtimeMode: serverRuntime.runtimeMode,
    allowWrites: serverRuntime.allowWrites ?? appRuntime.allowWrites,
    userDataPath: serverRuntime.userDataPath ?? appRuntime.userDataPath ?? null,
  });
}

export function summarizeToolCatalogHealth(input: ToolCatalogHealthInput): ToolCatalogHealthSummary {
  const validRecommendations = new Set(input.validRecommendations);
  const validSurfaceKinds = new Set(input.validSurfaceKinds);
  const missingWorkflowStages: string[] = [];
  const unknownRecommendation: string[] = [];
  const unknownSurfaceKind: string[] = [];

  for (const tool of input.tools) {
    if (!tool.workflowStages || tool.workflowStages.length === 0) {
      missingWorkflowStages.push(tool.name);
    }
    if (!tool.recommendation || !validRecommendations.has(tool.recommendation)) {
      unknownRecommendation.push(tool.name);
    }
    if (!tool.surfaceKind || !validSurfaceKinds.has(tool.surfaceKind)) {
      unknownSurfaceKind.push(tool.name);
    }
  }

  return {
    facadeTools: input.facadeTools,
    readonlyTools: input.readonlyTools,
    advancedTools: input.advancedTools,
    allTools: input.allTools,
    missingWorkflowStages: missingWorkflowStages.sort(),
    unknownRecommendation: unknownRecommendation.sort(),
    unknownSurfaceKind: unknownSurfaceKind.sort(),
  };
}
