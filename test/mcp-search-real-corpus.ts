import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { callJson, startStandaloneClient, type StandaloneClientRuntime } from './mcp-test-client';
import { TEST_DIR, buildRealCorpusFacadeCases, nestedArray, nestedRecord, routedTools } from './mcp-search-shared';

export async function runStandaloneRealCorpusFacadeReadEval(): Promise<void> {
  const cases = buildRealCorpusFacadeCases();
  if (cases.length === 0) {
    console.log('real-corpus facade external read eval skipped: no ignored local artifacts found');
    return;
  }

  const missingFamilies = (['charx', 'risup', 'risum'] as const).filter(
    (family) => !cases.some((candidate) => candidate.family === family),
  );
  assert.deepEqual(missingFamilies, [], 'local real corpus should include charx, risup, and risum facade cases');

  const userDataDir = fs.mkdtempSync(path.join(TEST_DIR, 'real-corpus-facade-'));
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startStandaloneClient({ userDataDir });

    for (const testCase of cases) {
      const target = { kind: 'external', file_path: testCase.filePath };
      const inspect = await callJson(runtime, 'inspect_document', { target, max_bytes: 65536 });
      assert.deepEqual(routedTools(inspect), ['inspect_external_file']);
      const external = nestedRecord(
        nestedRecord(inspect.result, `${testCase.family} inspect result`).external,
        'external inspect payload',
      );
      assert.equal(external.file_type, testCase.family);

      const read = await callJson(runtime, 'read_content', {
        target,
        selectors: [{ family: 'field', field: testCase.field }],
        max_bytes: 8192,
      });
      assert.deepEqual(routedTools(read), ['probe_field']);
      const readItems = nestedArray(nestedRecord(read.result, `${testCase.family} read result`).items, 'read items');
      const readData = nestedRecord(nestedRecord(readItems[0], 'read item').data, 'read data');
      assert.equal(readData.field, testCase.field);
      assert.equal(readData.content, testCase.content);

      const search = await callJson(runtime, 'search_document', {
        target,
        field: testCase.field,
        query: testCase.query,
        context_chars: 24,
        max_matches: 3,
        max_bytes: 8192,
      });
      assert.deepEqual(routedTools(search), ['external_search_in_field']);
      const searchData = nestedRecord(
        nestedRecord(search.result, `${testCase.family} search result`).search,
        'search data',
      );
      assert.equal(searchData.field, testCase.field);
      assert.ok(Number(searchData.totalMatches) > 0, `${testCase.family} external search should find its query`);
    }

    console.log(`real-corpus facade external read eval passed (${cases.length} files)`);
  } catch (error) {
    const stderrText = runtime?.stderrChunks.join('').trim();
    const detail =
      error instanceof Error
        ? (error.stack ?? error.message)
        : typeof error === 'string'
          ? error
          : JSON.stringify(error, null, 2);
    throw new Error(stderrText ? `${detail}\n\nReal-corpus standalone MCP stderr:\n${stderrText}` : detail);
  } finally {
    if (runtime) await runtime.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}
