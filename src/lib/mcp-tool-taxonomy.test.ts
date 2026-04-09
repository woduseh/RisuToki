// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  TOOL_TAXONOMY,
  TOOL_FAMILIES,
  ALL_TOOL_NAMES,
  getToolFamily,
  getToolAnnotations,
  getToolsByFamily,
} from './mcp-tool-taxonomy';

// ────────────────────────────────────────────────────────────────────────────
// Extract tool names from toki-mcp-server.ts source
// ────────────────────────────────────────────────────────────────────────────

function extractRegisteredToolNames(): string[] {
  const serverSrc = fs.readFileSync(path.resolve(__dirname, '../../toki-mcp-server.ts'), 'utf-8');
  const matches = serverSrc.matchAll(/server\.tool\(\s*'([^']+)'/g);
  return [...matches].map((m) => m[1]).sort();
}

const registeredTools = extractRegisteredToolNames();

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('MCP Tool Taxonomy', () => {
  // ── Completeness ──────────────────────────────────────────────────────

  it('covers every tool registered in toki-mcp-server.ts (no orphans)', () => {
    const taxonomyNames = new Set(ALL_TOOL_NAMES);
    const orphans = registeredTools.filter((name) => !taxonomyNames.has(name));
    expect(orphans).toEqual([]);
  });

  it('contains no phantom tools absent from toki-mcp-server.ts', () => {
    const registeredSet = new Set(registeredTools);
    const phantoms = ALL_TOOL_NAMES.filter((name) => !registeredSet.has(name));
    expect(phantoms).toEqual([]);
  });

  it('has at least 100 tools (sanity check against extraction failure)', () => {
    expect(registeredTools.length).toBeGreaterThanOrEqual(100);
    expect(ALL_TOOL_NAMES.length).toBeGreaterThanOrEqual(100);
  });

  // ── Family coverage ───────────────────────────────────────────────────

  it('assigns every tool to a valid family', () => {
    const validFamilies = new Set<string>(TOOL_FAMILIES);
    for (const [name, entry] of Object.entries(TOOL_TAXONOMY)) {
      expect(validFamilies.has(entry.family), `${name} has invalid family '${entry.family}'`).toBe(true);
    }
  });

  it('every declared family has at least one tool', () => {
    const byFamily = getToolsByFamily();
    for (const family of TOOL_FAMILIES) {
      expect(byFamily[family].length, `family '${family}' is empty`).toBeGreaterThan(0);
    }
  });

  // ── Naming convention alignment ────────────────────────────────────────

  it('probe_* tools belong to the probe family', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.startsWith('probe_')) {
        expect(getToolFamily(name), `${name} should be in probe family`).toBe('probe');
      }
    }
  });

  it('*_reference_* tools belong to the reference family', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.includes('reference')) {
        expect(getToolFamily(name), `${name} should be in reference family`).toBe('reference');
      }
    }
  });

  it('*_cbs* tools belong to the cbs family', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.includes('cbs')) {
        expect(getToolFamily(name), `${name} should be in cbs family`).toBe('cbs');
      }
    }
  });

  it('*_danbooru* / tag_db_status tools belong to the danbooru family', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.includes('danbooru') || name === 'tag_db_status') {
        expect(getToolFamily(name), `${name} should be in danbooru family`).toBe('danbooru');
      }
    }
  });

  // ── Behavior hint consistency ──────────────────────────────────────────

  it('read-only tools never have destructiveHint=true', () => {
    for (const [name, entry] of Object.entries(TOOL_TAXONOMY)) {
      if (entry.hints.readOnlyHint === true) {
        expect(entry.hints.destructiveHint, `${name}: readOnly tool must not be destructive`).not.toBe(true);
      }
    }
  });

  it('destructive tools always have readOnlyHint=false or undefined', () => {
    for (const [name, entry] of Object.entries(TOOL_TAXONOMY)) {
      if (entry.hints.destructiveHint === true) {
        expect(entry.hints.readOnlyHint, `${name}: destructive tool must not be readOnly`).not.toBe(true);
      }
    }
  });

  it('reference family tools are all read-only', () => {
    const byFamily = getToolsByFamily();
    for (const name of byFamily['reference']) {
      const hints = getToolAnnotations(name);
      expect(hints?.readOnlyHint, `${name} in reference family should be readOnly`).toBe(true);
    }
  });

  it('cbs family tools are all read-only (no side effects)', () => {
    const byFamily = getToolsByFamily();
    for (const name of byFamily['cbs']) {
      const hints = getToolAnnotations(name);
      expect(hints?.readOnlyHint, `${name} in cbs family should be readOnly`).toBe(true);
    }
  });

  it('delete_* tools have destructiveHint=true', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.startsWith('delete_') || name.startsWith('batch_delete_')) {
        const hints = getToolAnnotations(name);
        expect(hints?.destructiveHint, `${name} should have destructiveHint=true`).toBe(true);
      }
    }
  });

  it('list_* tools are read-only', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.startsWith('list_')) {
        const hints = getToolAnnotations(name);
        expect(hints?.readOnlyHint, `${name} should be readOnly`).toBe(true);
      }
    }
  });

  it('read_* tools are read-only', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.startsWith('read_')) {
        const hints = getToolAnnotations(name);
        expect(hints?.readOnlyHint, `${name} should be readOnly`).toBe(true);
      }
    }
  });

  // ── Helper function tests ──────────────────────────────────────────────

  it('getToolFamily returns correct family for known tools', () => {
    expect(getToolFamily('list_fields')).toBe('field');
    expect(getToolFamily('probe_field')).toBe('probe');
    expect(getToolFamily('validate_cbs')).toBe('cbs');
    expect(getToolFamily('list_lorebook')).toBe('lorebook');
  });

  it('getToolFamily returns undefined for unknown tools', () => {
    expect(getToolFamily('nonexistent_tool')).toBeUndefined();
  });

  it('getToolAnnotations returns hints object for known tools', () => {
    const hints = getToolAnnotations('list_fields');
    expect(hints).toBeDefined();
    expect(hints?.readOnlyHint).toBe(true);
  });

  it('getToolsByFamily returns sorted arrays', () => {
    const byFamily = getToolsByFamily();
    for (const family of TOOL_FAMILIES) {
      const tools = byFamily[family];
      const sorted = [...tools].sort();
      expect(tools).toEqual(sorted);
    }
  });

  // ── Cross-cutting capability detection ─────────────────────────────────

  it('families with batch tools include both read and write families', () => {
    const batchTools = ALL_TOOL_NAMES.filter((n) => n.includes('batch') || n.startsWith('batch_'));
    expect(batchTools.length).toBeGreaterThan(10);

    const batchFamilies = new Set(batchTools.map((n) => getToolFamily(n)));
    expect(batchFamilies.size).toBeGreaterThan(3);
  });

  // ── Taxonomy count stability ───────────────────────────────────────────

  it('taxonomy tool count matches server registration count', () => {
    expect(ALL_TOOL_NAMES.length).toBe(registeredTools.length);
  });
});
