// @vitest-environment node
import * as fs from 'fs';
import * as path from 'path';

import { afterAll, beforeAll, expect } from 'vitest';
import { MCP_API_TEST_DIR, type McpNoOpEnvelope } from './mcp-api-test-harness';

export function useMcpApiTestDir(scope: string): string {
  const testDir = path.join(MCP_API_TEST_DIR, scope);
  beforeAll(async () => {
    await fs.promises.mkdir(testDir, { recursive: true });
  });
  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });
  return testDir;
}

export function expectMcpNoOpEnvelope(data: McpNoOpEnvelope, expected: { action: string; target: string }): void {
  expect(data).toHaveProperty('success', false);
  expect(data).toHaveProperty('action', expected.action);
  expect(data).toHaveProperty('status', 200);
  expect(data).toHaveProperty('target', expected.target);
  expect(data).toHaveProperty('error', data.message);
  expect(data.suggestion).toBeDefined();
}

export function expectMcpSuccessArtifacts(data: Record<string, unknown>): void {
  expect(typeof data.artifacts).toBe('object');
  expect((data.artifacts as Record<string, unknown>).byte_size).toEqual(expect.any(Number));
  expect((data.artifacts as Record<string, unknown>).byte_size as number).toBeGreaterThan(0);
}
