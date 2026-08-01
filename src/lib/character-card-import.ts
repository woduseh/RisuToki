import * as fs from 'fs';
import * as path from 'path';
import type { CharxAsset, LoadedDocumentData } from '../charx-io';
import { openCharxCardDocument } from '../charx-io';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type ImportedCharacterCardFormat = 'png' | 'json';

export interface ImportedCharacterCard {
  data: LoadedDocumentData;
  format: ImportedCharacterCardFormat;
  sourcePath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function readPngTextChunks(buf: Buffer): Record<string, string> {
  if (buf.length < PNG_MAGIC.length || !buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Error('유효한 PNG 파일이 아닙니다.');
  }

  const chunks: Record<string, string> = {};
  let offset = PNG_MAGIC.length;

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextOffset = dataEnd + 4;
    if (dataEnd > buf.length || nextOffset > buf.length) break;

    if (type === 'tEXt') {
      const data = buf.subarray(dataStart, dataEnd);
      const split = data.indexOf(0);
      if (split >= 0) {
        const key = data.subarray(0, split).toString('latin1');
        const value = data.subarray(split + 1).toString('latin1');
        chunks[key] = value;
      }
    }

    offset = nextOffset;
  }

  return chunks;
}

function detectExtensionFromMagic(buf: Buffer): string {
  if (buf.length < 4) return 'bin';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'webp';
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'ogg';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  return 'bin';
}

function normalizeCharacterCardDocument(rawCard: unknown): Record<string, unknown> {
  if (!isRecord(rawCard)) {
    throw new Error('Character Card JSON은 객체여야 합니다.');
  }

  const card = { ...rawCard };
  if (card.spec === 'chara_card_v3') return card;
  if (card.spec === 'chara_card_v2') {
    return { ...card, spec: 'chara_card_v3', spec_version: '3.0' };
  }
  if (isRecord(card.data)) {
    return {
      ...card,
      spec: 'chara_card_v3',
      spec_version: typeof card.spec_version === 'string' ? card.spec_version : '3.0',
    };
  }
  if (typeof card.name === 'string' || typeof card.description === 'string' || typeof card.first_mes === 'string') {
    return {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: card,
    };
  }

  throw new Error('Character Card 메타데이터를 찾을 수 없습니다.');
}

function parseCardJsonText(text: string): Record<string, unknown> {
  try {
    return normalizeCharacterCardDocument(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Character Card JSON 파싱 실패: ${error.message}`);
    }
    throw error;
  }
}

function decodeCardChunk(value: string): Record<string, unknown> {
  return parseCardJsonText(Buffer.from(value, 'base64').toString('utf-8'));
}

export function importPngCharacterCard(filePath: string): ImportedCharacterCard {
  const png = fs.readFileSync(filePath);
  const chunks = readPngTextChunks(png);
  const card = chunks.ccv3 ? decodeCardChunk(chunks.ccv3) : chunks.chara ? decodeCardChunk(chunks.chara) : null;
  if (!card) {
    throw new Error('PNG 파일에서 Character Card 메타데이터(ccv3/chara)를 찾을 수 없습니다.');
  }

  const assets: CharxAsset[] = [{ path: 'assets/icon/charicon.png', data: png }];
  for (const key of Object.keys(chunks).filter((chunkKey) => chunkKey.startsWith('chara-ext-asset_:'))) {
    const indexText = key.slice('chara-ext-asset_:'.length);
    const index = Number.parseInt(indexText, 10);
    const assetBuffer = Buffer.from(chunks[key], 'base64');
    const ext = detectExtensionFromMagic(assetBuffer);
    const safeIndex = Number.isFinite(index) ? index : assets.length;
    assets.push({ path: `assets/other/png_asset_${safeIndex}.${ext}`, data: assetBuffer });
  }

  return {
    data: openCharxCardDocument(card, assets),
    format: 'png',
    sourcePath: filePath,
  };
}

export function importJsonCharacterCard(filePath: string): ImportedCharacterCard {
  const card = parseCardJsonText(fs.readFileSync(filePath, 'utf-8'));
  return {
    data: openCharxCardDocument(card, []),
    format: 'json',
    sourcePath: filePath,
  };
}

export function importCharacterCardByPath(filePath: string): ImportedCharacterCard {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return importPngCharacterCard(filePath);
  if (ext === '.json') return importJsonCharacterCard(filePath);
  throw new Error(`지원하지 않는 Character Card import 형식입니다: ${ext || '(확장자 없음)'}`);
}
