// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import { pack, unpack } from 'msgpackr';
import { afterEach, describe, expect, it } from 'vitest';
import { openCharx, openRisum, openRisup, saveCharx, saveRisum, saveRisup } from './charx-io';
import { buildRisum, parseRisum, rpackDecode, rpackEncode } from './rpack';

const directories: string[] = [];
function fixturePath(extension: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-preservation-'));
  directories.push(directory);
  return path.join(directory, `fixture.${extension}`);
}
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function moduleFixture() {
  return {
    type: 'risuModule',
    vendorEnvelope: { version: 7 },
    module: {
      name: 'Synthetic',
      description: 'Module',
      id: 'synthetic-module',
      vendorModule: { values: [0, false, null, '한글'] },
      mcp: { url: 'https://synthetic.invalid/mcp', vendor: { transport: 'future' } },
      lorebook: [{ key: 'entry', content: '본문', vendorEntry: { enabled: false } }],
      regex: [{ type: 'editrequest', in: 'input', out: 'output', vendorRegex: [1, 2] }],
      trigger: [
        { type: 'start', vendorTrigger: 3, effect: [{ type: 'triggerlua', code: 'print(1)', vendorEffect: 4 }] },
      ],
      assets: [
        ['binary', '__asset:0', 'bin'],
        ['empty', '__asset:1', 'bin'],
      ],
      cjs: 'reserved and intentionally removed',
    },
  };
}

describe('synthetic artifact preservation', () => {
  it('preserves standalone RISUM extensions and asset bytes, allowing only declared normalization/removal', () => {
    const file = fixturePath('risum');
    const original = moduleFixture();
    const assets = [Buffer.from([0, 255, 128, 13, 10]), Buffer.alloc(0)];
    fs.writeFileSync(file, buildRisum(original, assets));
    const loaded = openRisum(file);
    saveRisum(file, loaded);
    const result = parseRisum(fs.readFileSync(file));
    expect(result.assets).toEqual(assets);
    const expectedModule: Record<string, unknown> = { ...original.module };
    delete expectedModule.cjs;
    expect(result.module).toEqual({
      ...original,
      module: {
        ...expectedModule,
        lowLevelAccess: false,
        hideIcon: false,
        regex: [{ ...original.module.regex[0], type: 'editprocess', find: 'input', replace: 'output' }],
      },
    });
    expect(result.module.module).not.toHaveProperty('cjs');
    expect(openRisum(file).risumAssets).toEqual(assets);
  });

  it('preserves CHARX unknown ZIP entries, nested metadata, JSON extensions and binary assets', () => {
    const file = fixturePath('charx');
    const zip = new AdmZip();
    const card = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      vendorRoot: { count: 9 },
      data: {
        name: 'Synthetic',
        description: 'Description',
        first_mes: 'Greeting',
        vendorData: ['x'],
        personality: 'intentionally removed',
        extensions: { vendor: { retained: true }, risuai: { vendor: { value: 0 } } },
      },
    };
    zip.addFile('card.json', Buffer.from(JSON.stringify(card)));
    zip.addFile('module.risum', buildRisum(moduleFixture(), [Buffer.alloc(0)]));
    const entries = {
      'assets/data.bin': Buffer.from([0, 255, 64]),
      'vendor/opaque.bin': Buffer.from([0, 127, 255]),
      'x_meta/one/shared.json': Buffer.from('{"first":true}'),
      'x_meta/two/shared.json': Buffer.from('{"second":true}'),
      'x_meta/unparsed.json': Buffer.from('not JSON'),
    };
    for (const [name, bytes] of Object.entries(entries)) zip.addFile(name, bytes);
    zip.writeZip(file);
    saveCharx(file, openCharx(file));
    const output = new AdmZip(file);
    for (const [name, bytes] of Object.entries(entries)) expect(output.getEntry(name)?.getData(), name).toEqual(bytes);
    const savedCard = JSON.parse(output.getEntry('card.json')!.getData().toString('utf8'));
    const expectedCard = structuredClone(card) as { data: Record<string, unknown> };
    delete expectedCard.data.personality;
    expect(savedCard).toMatchObject(expectedCard);
    expect(savedCard.data).not.toHaveProperty('personality');
    expect(openCharx(file).assets.map((asset) => asset.data)).toEqual([entries['assets/data.bin']]);
  });

  it('rejects zero-byte CHARX assets without replacing the source archive', () => {
    const file = fixturePath('charx');
    const zip = new AdmZip();
    zip.addFile('card.json', Buffer.from(JSON.stringify({ spec: 'chara_card_v3', data: { name: 'Synthetic' } })));
    zip.addFile('assets/empty.bin', Buffer.alloc(0));
    zip.writeZip(file);
    expect(() => saveCharx(file, openCharx(file))).toThrow(/zero-byte-asset/);
    const output = new AdmZip(file);
    expect(JSON.parse(output.getEntry('card.json')!.getData().toString('utf8'))).toEqual({
      spec: 'chara_card_v3',
      data: { name: 'Synthetic' },
    });
    expect(output.getEntry('assets/empty.bin')?.getData()).toEqual(Buffer.alloc(0));
    expect(output.getEntry('module.risum')).toBeNull();
  });

  it('preserves card-only lorebook activation, position and unknown entry extensions', () => {
    const file = fixturePath('charx');
    const zip = new AdmZip();
    const entry = {
      keys: ['key'],
      content: '본문',
      enabled: false,
      id: 42,
      priority: 81,
      name: 'Original name',
      position: 'after_char',
      vendorEntry: { future: true },
      extensions: { depth: 4, probability: 30, useProbability: false, vendor: [false, 0] },
    };
    zip.addFile(
      'card.json',
      Buffer.from(
        JSON.stringify({ spec: 'chara_card_v3', data: { name: 'Synthetic', character_book: { entries: [entry] } } }),
      ),
    );
    zip.writeZip(file);
    saveCharx(file, openCharx(file));
    const savedCard = JSON.parse(new AdmZip(file).getEntry('card.json')!.getData().toString('utf8'));
    expect(savedCard.data.character_book.entries[0]).toMatchObject(entry);
    saveCharx(file, openCharx(file));
    expect(
      JSON.parse(new AdmZip(file).getEntry('card.json')!.getData().toString('utf8')).data.character_book.entries[0],
    ).toMatchObject(entry);
  });

  it('migrates card-only RisuAI triggers into the generated module without losing their contents', () => {
    const file = fixturePath('charx');
    const zip = new AdmZip();
    const trigger = [
      { type: 'start', effect: [{ type: 'triggerlua', code: 'print("preserve")' }], vendor: { keep: true } },
    ];
    zip.addFile(
      'card.json',
      Buffer.from(
        JSON.stringify({
          spec: 'chara_card_v3',
          data: { name: 'Synthetic', extensions: { risuai: { triggerscript: trigger } } },
        }),
      ),
    );
    zip.writeZip(file);
    saveCharx(file, openCharx(file));
    expect(openCharx(file).triggerScripts).toEqual(trigger);
  });

  it.each(['gzip', 'zlib', 'raw'] as const)(
    'preserves RISUP %s envelope extensions and MessagePack binary values',
    (mode) => {
      const file = fixturePath('risup');
      const key = crypto.createHash('sha256').update('risupreset').digest();
      const cipher = crypto.createCipheriv('aes-256-gcm', key, Buffer.alloc(12));
      const original = {
        name: 'Synthetic',
        vendor: { bytes: Buffer.from([0, 255]), value: false },
        openAIKey: 'synthetic-key',
        mainPrompt: 'legacy',
      };
      const ciphertext = Buffer.concat([cipher.update(pack(original)), cipher.final(), cipher.getAuthTag()]);
      const compress = mode === 'gzip' ? zlib.gzipSync : mode === 'zlib' ? zlib.deflateSync : zlib.deflateRawSync;
      const decompress = mode === 'gzip' ? zlib.gunzipSync : mode === 'zlib' ? zlib.inflateSync : zlib.inflateRawSync;
      fs.writeFileSync(
        file,
        rpackEncode(
          compress(
            pack({
              type: 'preset',
              presetVersion: 2,
              preset: ciphertext,
              vendorEnvelope: { bytes: Buffer.from([128]) },
            }),
          ),
        ),
      );
      saveRisup(file, openRisup(file));
      const envelope = unpack(decompress(rpackDecode(fs.readFileSync(file))));
      expect(envelope.vendorEnvelope).toEqual({ bytes: Buffer.from([128]) });
      const reopened = openRisup(file);
      expect(reopened._compressionMode).toBe(mode);
      expect(reopened._presetData?.vendor).toEqual(original.vendor);
      expect(reopened._presetData).not.toHaveProperty('openAIKey');
      expect(reopened._presetData).not.toHaveProperty('mainPrompt');
    },
  );
});
