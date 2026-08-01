import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { importCharacterCardByPath, importJsonCharacterCard, importPngCharacterCard } from './character-card-import';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const tempPaths: string[] = [];

function writeTempFile(fileName: string, data: Buffer | string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-card-import-'));
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, data);
  tempPaths.push(filePath);
  return filePath;
}

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}

function textChunk(key: string, value: string): Buffer {
  return chunk('tEXt', Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0]), Buffer.from(value, 'latin1')]));
}

function makePng(chunks: Record<string, string>): Buffer {
  const ihdr = chunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]));
  const textChunks = Object.entries(chunks).map(([key, value]) => textChunk(key, value));
  return Buffer.concat([PNG_MAGIC, ihdr, ...textChunks, chunk('IEND', Buffer.alloc(0))]);
}

function cardJson(name: string): Record<string, unknown> {
  return {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name,
      description: 'description',
      first_mes: 'hello',
      alternate_greetings: ['hi'],
      extensions: { risuai: { additionalText: 'extra' } },
    },
  };
}

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf-8').toString('base64');
}

afterEach(() => {
  for (const filePath of tempPaths.splice(0)) {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

describe('character card import', () => {
  it('imports PNG ccv3 tEXt chunks into LoadedDocumentData', () => {
    const filePath = writeTempFile('card.png', makePng({ ccv3: b64(cardJson('CCV3 Card')) }));

    const imported = importPngCharacterCard(filePath);

    expect(imported.format).toBe('png');
    expect(imported.sourcePath).toBe(filePath);
    expect(imported.data.name).toBe('CCV3 Card');
    expect(imported.data.firstMessage).toBe('hello');
    expect(imported.data.assets[0]?.path).toBe('assets/icon/charicon.png');
  });

  it('imports PNG chara/CCv2 chunks as v3-compatible LoadedDocumentData', () => {
    const v2Card = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: { name: 'CCV2 Card', first_mes: 'hello v2' },
    };
    const filePath = writeTempFile('card.png', makePng({ chara: b64(v2Card) }));

    const imported = importCharacterCardByPath(filePath);

    expect(imported.data.spec).toBe('chara_card_v3');
    expect(imported.data.specVersion).toBe('3.0');
    expect(imported.data.name).toBe('CCV2 Card');
    expect(imported.data.firstMessage).toBe('hello v2');
  });

  it('imports PNG chara-ext assets under assets/other', () => {
    const asset = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const filePath = writeTempFile(
      'card.png',
      makePng({
        ccv3: b64(cardJson('Asset Card')),
        'chara-ext-asset_:2': asset.toString('base64'),
      }),
    );

    const imported = importPngCharacterCard(filePath);

    expect(imported.data.assets.map((entry) => entry.path)).toContain('assets/other/png_asset_2.jpg');
  });

  it('imports JSON Character Card documents', () => {
    const filePath = writeTempFile('card.json', JSON.stringify(cardJson('JSON Card')));

    const imported = importJsonCharacterCard(filePath);

    expect(imported.format).toBe('json');
    expect(imported.data.name).toBe('JSON Card');
  });

  it('fails clearly for invalid PNG and JSON input', () => {
    const pngPath = writeTempFile('plain.png', PNG_MAGIC);
    const jsonPath = writeTempFile('bad.json', '{broken');

    expect(() => importPngCharacterCard(pngPath)).toThrow(/Character Card 메타데이터/);
    expect(() => importJsonCharacterCard(jsonPath)).toThrow(/Character Card JSON 파싱 실패/);
  });
});
