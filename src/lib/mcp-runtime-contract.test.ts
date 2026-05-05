// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildRuntimeMetadata, mergeRuntimeMetadata, summarizeToolCatalogHealth } from './mcp-runtime-contract';

describe('MCP runtime contract agent eval', () => {
  it('reports no skew when server, app, and package versions match', () => {
    const metadata = buildRuntimeMetadata({
      serverVersion: '0.69.2',
      appVersion: '0.69.2',
      packageVersion: '0.69.2',
      buildTime: '2026-01-01T00:00:00.000Z',
      commit: 'abc123',
      runtimeMode: 'standalone',
    });

    expect(metadata.skew).toEqual({ detected: false, warnings: [] });
    expect(metadata.runtimeMode).toBe('standalone');
  });

  it('detects version skew across runtime metadata fields', () => {
    const metadata = buildRuntimeMetadata({
      serverVersion: '0.69.1',
      appVersion: '0.69.2',
      packageVersion: '0.69.3',
      buildTime: null,
      commit: null,
      runtimeMode: 'app-backed',
    });

    expect(metadata.skew.detected).toBe(true);
    expect(metadata.skew.warnings).toEqual([
      'serverVersion (0.69.1) differs from appVersion (0.69.2)',
      'appVersion (0.69.2) differs from packageVersion (0.69.3)',
    ]);
  });

  it('merges app-backed metadata without masking the MCP server bundle version', () => {
    const serverRuntime = buildRuntimeMetadata({
      serverVersion: '0.69.1',
      appVersion: '0.69.1',
      packageVersion: '0.69.1',
      buildTime: '2026-01-01T00:00:00.000Z',
      commit: 'server-sha',
      runtimeMode: 'app-backed',
    });
    const appRuntime = buildRuntimeMetadata({
      serverVersion: '0.69.2',
      appVersion: '0.69.2',
      packageVersion: '0.69.2',
      buildTime: null,
      commit: null,
      runtimeMode: 'app-backed',
    });

    const metadata = mergeRuntimeMetadata(serverRuntime, appRuntime);

    expect(metadata).toEqual({
      serverVersion: '0.69.1',
      appVersion: '0.69.2',
      packageVersion: '0.69.2',
      buildTime: '2026-01-01T00:00:00.000Z',
      commit: 'server-sha',
      runtimeMode: 'app-backed',
      skew: {
        detected: true,
        warnings: ['serverVersion (0.69.1) differs from appVersion (0.69.2)'],
      },
    });
  });

  it('summarizes catalog counts and flags contract metadata gaps', () => {
    const summary = summarizeToolCatalogHealth({
      facadeTools: 2,
      readonlyTools: 3,
      advancedTools: 4,
      allTools: 4,
      validRecommendations: ['preferred', 'advanced', 'legacy'],
      validSurfaceKinds: ['facade', 'granular'],
      tools: [
        { name: 'inspect_document', recommendation: 'preferred', surfaceKind: 'facade', workflowStages: ['discover'] },
        { name: 'legacy_reader', recommendation: 'legacy', surfaceKind: 'granular', workflowStages: ['read'] },
        { name: 'missing_stage', recommendation: 'advanced', surfaceKind: 'granular', workflowStages: [] },
        { name: 'unknown_contract', recommendation: 'experimental', surfaceKind: 'virtual', workflowStages: ['read'] },
      ],
    });

    expect(summary).toEqual({
      facadeTools: 2,
      readonlyTools: 3,
      advancedTools: 4,
      allTools: 4,
      missingWorkflowStages: ['missing_stage'],
      unknownRecommendation: ['unknown_contract'],
      unknownSurfaceKind: ['unknown_contract'],
    });
  });
});
