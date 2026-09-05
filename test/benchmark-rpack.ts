// Run from the repository root:
// npx esbuild test/benchmark-rpack.ts --bundle --platform=node --outfile=.build/perf/benchmark-rpack.cjs
// node --expose-gc .build/perf/benchmark-rpack.cjs
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildRisum, ENCODE_MAP } from '../src/rpack';

// Frozen pre-optimization encoder for reproducible, same-process comparisons.
function legacyEncode(input: Buffer): Buffer {
  const output = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) output[i] = ENCODE_MAP[input[i]];
  return output;
}

function legacyBuild(moduleJson: Record<string, unknown>, assets: Buffer[]): Buffer {
  const main = legacyEncode(Buffer.from(JSON.stringify(moduleJson), 'utf-8'));
  let size = 7 + main.length;
  for (const asset of assets) size += 5 + legacyEncode(asset).length;
  const output = Buffer.alloc(size);
  output[0] = 0x6f;
  output.writeUInt32LE(main.length, 2);
  main.copy(output, 6);
  let offset = 6 + main.length;
  for (const asset of assets) {
    output[offset++] = 1;
    const encoded = legacyEncode(asset);
    output.writeUInt32LE(encoded.length, offset);
    offset += 4;
    encoded.copy(output, offset);
    offset += encoded.length;
  }
  output[offset] = 0;
  return output;
}

function median(values: number[]): number {
  return values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

const moduleJson = { type: 'risuModule', module: { name: 'Synthetic benchmark', assets: [] } };
console.log(`Node ${process.version}; ${process.platform}/${process.arch}; 9 interleaved samples, GC outside timing`);
for (const mib of [1, 16, 64]) {
  const assets = Array.from({ length: 4 }, (_, index) => Buffer.alloc((mib * 1024 * 1024) / 4, index + 42));
  assert.deepStrictEqual(buildRisum(moduleJson, assets), legacyBuild(moduleJson, assets));
  for (let i = 0; i < 3; i++) {
    legacyBuild(moduleJson, assets);
    buildRisum(moduleJson, assets);
  }
  const timings = { legacy: [] as number[], optimized: [] as number[] };
  for (let round = 0; round < 9; round++) {
    const names = round % 2 ? (['optimized', 'legacy'] as const) : (['legacy', 'optimized'] as const);
    for (const name of names) {
      global.gc?.();
      const start = performance.now();
      const output = (name === 'legacy' ? legacyBuild : buildRisum)(moduleJson, assets);
      timings[name].push(performance.now() - start);
      assert.equal(output[0], 0x6f);
    }
  }
  const before = median(timings.legacy);
  const after = median(timings.optimized);
  console.log(`${mib} MiB assets: ${before.toFixed(2)} ms -> ${after.toFixed(2)} ms (${(before / after).toFixed(2)}x)`);
}
