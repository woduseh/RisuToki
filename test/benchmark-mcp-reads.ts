// Build before editing production code and keep that bundle for A/B measurements:
// npx esbuild test/benchmark-mcp-reads.ts --bundle --platform=node --packages=external --outfile=.build/performance/reads-before.cjs
// node --expose-gc .build/performance/reads-before.cjs --output=.build/performance/reads-before.json
// Repeat with reads-after.cjs after the change. Run bundles sequentially, without other tests/builds.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { openCharxCardDocument } from '../src/charx-io';
import { closeServer, startTestApiServer } from '../src/lib/mcp-api-test-harness';

const { values } = parseArgs({
  options: {
    output: { type: 'string' },
    samples: { type: 'string', default: '9' },
    iterations: { type: 'string', default: '5' },
    warmup: { type: 'string', default: '3' },
    'asset-mib': { type: 'string', default: '0,16,64' },
  },
});
const samples = Number(values.samples);
const iterations = Number(values.iterations);
const warmup = Number(values.warmup);
const assetSizes = values['asset-mib']!.split(',').map(Number);
assert(Number.isInteger(samples) && samples > 0);
assert(Number.isInteger(iterations) && iterations > 0);
assert(Number.isInteger(warmup) && warmup >= 0);
assert(assetSizes.every((size) => Number.isInteger(size) && size >= 0 && size <= 256));

const description = 'A synthetic character visits the observatory. 별빛 아래에서 alpha를 찾아요.\n'.repeat(256);
const card = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: 'Read performance fixture',
    description,
    first_mes: 'Welcome to the observatory. alpha',
    alternate_greetings: ['Another alpha greeting'],
    character_book: {
      entries: Array.from({ length: 200 }, (_, id) => ({
        id,
        keys: [`place-${id}`],
        comment: `Place ${id}`,
        content: `Location ${id}: alpha. ` + 'The observatory keeps its history. '.repeat(8),
        enabled: true,
        insertion_order: id,
      })),
    },
  },
};

const scenarios = [
  { name: 'batch-read', method: 'POST', path: '/field/batch', body: { fields: ['name', 'description'] } },
  { name: 'field-search', method: 'POST', path: '/field/description/search', body: { query: 'alpha', max_matches: 5 } },
  { name: 'search-all', method: 'POST', path: '/search-all', body: { query: 'alpha', max_matches_total: 20 } },
  { name: 'range-get-control', method: 'GET', path: '/field/description/range?offset=0&length=1024' },
] as const;

function summarize(numbers: number[]) {
  const sorted = [...numbers].sort((left, right) => left - right);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
    samples: numbers,
  };
}

async function main() {
  const results: Record<string, unknown>[] = [];
  for (const assetMiB of assetSizes) {
    const fixture = openCharxCardDocument(
      card,
      Array.from({ length: assetMiB }, (_, index) => ({
        path: `assets/other/image/portrait-${index}.webp`,
        data: Buffer.alloc(1024 * 1024, index % 256),
      })),
    );
    const api = await startTestApiServer(fixture);
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const request = (scenario: (typeof scenarios)[number]) =>
      new Promise<string>((resolve, reject) => {
        const payload = 'body' in scenario ? JSON.stringify(scenario.body) : undefined;
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: api.port,
            path: scenario.path,
            method: scenario.method,
            agent,
            headers: {
              Authorization: `Bearer ${api.token}`,
              ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
            },
          },
          (res) => {
            res.setEncoding('utf8');
            let text = '';
            res.on('data', (chunk: string) => (text += chunk));
            res.on('error', reject);
            res.on('end', () => {
              if (res.statusCode !== 200) reject(new Error(`${res.statusCode}: ${text}`));
              else resolve(text);
            });
          },
        );
        req.on('error', reject);
        req.end(payload);
      });
    try {
      for (const scenario of scenarios) {
        global.gc?.();
        const firstStart = performance.now();
        const expected = await request(scenario);
        const firstRequestMs = performance.now() - firstStart;
        const parsed = JSON.parse(expected) as Record<string, unknown>;
        if (scenario.name === 'batch-read') assert.equal(parsed.count, 2);
        if (scenario.name === 'field-search') assert.equal(parsed.totalMatches, 256);
        if (scenario.name === 'search-all') assert.equal(parsed.totalMatches, 458);
        if (scenario.name === 'range-get-control') assert.equal(parsed.content, description.slice(0, 1024));
        for (let i = 0; i < warmup; i++) assert.equal(await request(scenario), expected);

        const wallMs: number[] = [];
        const cpuMs: number[] = [];
        const externalDelta: number[] = [];
        for (let sample = 0; sample < samples; sample++) {
          global.gc?.();
          const memoryBefore = process.memoryUsage();
          const cpuStart = process.cpuUsage();
          const start = performance.now();
          const responses: string[] = [];
          for (let i = 0; i < iterations; i++) responses.push(await request(scenario));
          wallMs.push((performance.now() - start) / iterations);
          const cpu = process.cpuUsage(cpuStart);
          cpuMs.push((cpu.user + cpu.system) / 1000 / iterations);
          externalDelta.push(process.memoryUsage().external - memoryBefore.external);
          for (const response of responses) assert.equal(response, expected);
        }
        const result = {
          assetMiB,
          scenario: scenario.name,
          firstRequestMs,
          responseBytes: Buffer.byteLength(expected),
          responseSha256: createHash('sha256').update(expected).digest('hex'),
          wallMs: summarize(wallMs),
          cpuMs: summarize(cpuMs),
          // End-of-batch observation, not a peak-memory measurement.
          externalDeltaBytes: summarize(externalDelta),
        };
        results.push(result);
        console.log(JSON.stringify(result));
      }
    } finally {
      agent.destroy();
      await closeServer(api.server);
    }
  }
  const report = {
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
    conditions: { samples, iterations, warmup, gcOutsideTiming: !!global.gc, keepAlive: true, loadedInMemory: true },
    fixtureSha256: createHash('sha256').update(JSON.stringify(card)).digest('hex'),
    results,
  };
  if (values.output) writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
