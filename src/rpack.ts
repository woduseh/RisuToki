'use strict';

// RPack: byte substitution cipher used by RisuAI for module.risum encoding
// Maps sourced from rpack_map.bin (512 bytes: encode[0..255] + decode[256..511])

interface RisumModule {
  module: Record<string, unknown>;
  assets: Buffer[];
}

const ENCODE_MAP: Uint8Array = new Uint8Array([
  196, 13, 30, 11, 189, 43, 63, 85, 252, 69, 110, 245, 102, 83, 79, 26,
  224, 187, 48, 148, 134, 186, 107, 191, 65, 80, 111, 155, 239, 222, 183, 16,
  97, 23, 32, 223, 50, 137, 168, 157, 109, 171, 201, 144, 0, 12, 93, 175,
  210, 193, 86, 229, 22, 100, 145, 130, 101, 116, 151, 202, 35, 214, 82, 209,
  255, 180, 160, 232, 47, 138, 88, 56, 90, 96, 25, 150, 73, 219, 215, 200,
  59, 62, 67, 75, 165, 99, 71, 170, 106, 41, 146, 244, 21, 207, 98, 52,
  120, 211, 29, 60, 226, 5, 142, 42, 87, 14, 27, 205, 76, 45, 242, 64,
  44, 37, 121, 72, 15, 178, 122, 181, 167, 108, 55, 230, 156, 123, 84, 126,
  254, 135, 220, 154, 2, 228, 51, 162, 235, 177, 46, 3, 221, 153, 166, 176,
  231, 213, 136, 24, 131, 124, 246, 190, 225, 92, 159, 195, 33, 70, 31, 8,
  78, 208, 118, 18, 95, 238, 253, 143, 68, 234, 163, 94, 139, 40, 9, 53,
  158, 105, 204, 10, 199, 133, 7, 173, 74, 243, 119, 233, 103, 212, 218, 132,
  128, 147, 182, 77, 115, 250, 39, 38, 127, 4, 198, 251, 241, 114, 57, 81,
  194, 54, 169, 104, 172, 248, 237, 197, 185, 203, 206, 117, 164, 61, 129, 217,
  66, 112, 28, 149, 17, 188, 216, 140, 152, 249, 89, 161, 19, 247, 20, 125,
  179, 236, 113, 192, 227, 141, 240, 1, 174, 91, 49, 6, 36, 34, 58, 184
]);

const DECODE_MAP: Uint8Array = new Uint8Array([
  44, 247, 132, 139, 201, 101, 251, 182, 159, 174, 179, 3, 45, 1, 105, 116,
  31, 228, 163, 236, 238, 92, 52, 33, 147, 74, 15, 106, 226, 98, 2, 158,
  34, 156, 253, 60, 252, 113, 199, 198, 173, 89, 103, 5, 112, 109, 138, 68,
  18, 250, 36, 134, 95, 175, 209, 122, 71, 206, 254, 80, 99, 221, 81, 6,
  111, 24, 224, 82, 168, 9, 157, 86, 115, 76, 184, 83, 108, 195, 160, 14,
  25, 207, 62, 13, 126, 7, 50, 104, 70, 234, 72, 249, 153, 46, 171, 164,
  73, 32, 94, 85, 53, 56, 12, 188, 211, 177, 88, 22, 121, 40, 10, 26,
  225, 242, 205, 196, 57, 219, 162, 186, 96, 114, 118, 125, 149, 239, 127, 200,
  192, 222, 55, 148, 191, 181, 20, 129, 146, 37, 69, 172, 231, 245, 102, 167,
  43, 54, 90, 193, 19, 227, 75, 58, 232, 141, 131, 27, 124, 39, 176, 154,
  66, 235, 135, 170, 220, 84, 142, 120, 38, 210, 87, 41, 212, 183, 248, 47,
  143, 137, 117, 240, 65, 119, 194, 30, 255, 216, 21, 17, 229, 4, 151, 23,
  243, 49, 208, 155, 0, 215, 202, 180, 79, 42, 59, 217, 178, 107, 218, 93,
  161, 63, 48, 97, 189, 145, 61, 78, 230, 223, 190, 77, 130, 140, 29, 35,
  16, 152, 100, 244, 133, 51, 123, 144, 67, 187, 169, 136, 241, 214, 165, 28,
  246, 204, 110, 185, 91, 11, 150, 237, 213, 233, 197, 203, 8, 166, 128, 64
]);

/**
 * RPack decode: substitute each byte using decode map
 * @param input - encoded bytes
 * @returns decoded bytes
 */
function rpackDecode(input: Buffer | Uint8Array): Buffer {
  const out = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = DECODE_MAP[input[i]];
  }
  return out;
}

/**
 * RPack encode: substitute each byte using encode map
 * @param input - raw bytes
 * @returns encoded bytes
 */
function rpackEncode(input: Buffer | Uint8Array): Buffer {
  const out = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = ENCODE_MAP[input[i]];
  }
  return out;
}

/**
 * Parse module.risum binary into JSON object
 * @param buf - raw module.risum bytes
 * @returns RisumModule object with parsed module and assets
 */
function parseRisum(buf: Buffer): RisumModule {
  let offset = 0;

  // Magic byte check
  const magic = buf[offset++];
  if (magic !== 0x6F) {
    throw new Error(`Invalid risum magic byte: 0x${magic.toString(16)} (expected 0x6F)`);
  }

  // Version
  offset += 1;

  // Main data length (uint32 LE)
  const mainLen = buf.readUInt32LE(offset);
  offset += 4;

  // Main payload (RPack encoded JSON)
  const mainEncoded = buf.subarray(offset, offset + mainLen);
  offset += mainLen;
  const mainDecoded = rpackDecode(mainEncoded);
  const mainJson = JSON.parse(mainDecoded.toString('utf-8')) as Record<string, unknown>;

  // Read embedded assets
  const assets: Buffer[] = [];
  while (offset < buf.length) {
    const marker = buf[offset++];
    if (marker === 0x00) break; // end marker
    if (marker !== 0x01) {
      throw new Error(`Unexpected asset marker: 0x${marker.toString(16)}`);
    }
    const assetLen = buf.readUInt32LE(offset);
    offset += 4;
    const assetEncoded = buf.subarray(offset, offset + assetLen);
    offset += assetLen;
    assets.push(rpackDecode(assetEncoded));
  }

  return { module: mainJson, assets };
}

/**
 * Build module.risum binary from JSON object
 * @param moduleJson - the risuModule JSON object
 * @param assets - optional embedded asset buffers
 * @returns risum binary
 */
function buildRisum(moduleJson: Record<string, unknown>, assets: Buffer[] = []): Buffer {
  const jsonStr = JSON.stringify(moduleJson);
  const jsonBuf = Buffer.from(jsonStr, 'utf-8');
  const encodedMain = rpackEncode(jsonBuf);

  // Calculate total size
  let totalSize = 1 + 1 + 4 + encodedMain.length; // magic + version + len + data
  for (const asset of assets) {
    const encodedAsset = rpackEncode(asset);
    totalSize += 1 + 4 + encodedAsset.length; // marker + len + data
  }
  totalSize += 1; // end marker

  const buf = Buffer.alloc(totalSize);
  let offset = 0;

  // Header
  buf[offset++] = 0x6F; // magic
  buf[offset++] = 0x00; // version

  // Main payload
  buf.writeUInt32LE(encodedMain.length, offset);
  offset += 4;
  encodedMain.copy(buf, offset);
  offset += encodedMain.length;

  // Assets
  for (const asset of assets) {
    buf[offset++] = 0x01; // asset marker
    const encodedAsset = rpackEncode(asset);
    buf.writeUInt32LE(encodedAsset.length, offset);
    offset += 4;
    encodedAsset.copy(buf, offset);
    offset += encodedAsset.length;
  }

  // End marker
  buf[offset] = 0x00;

  return buf;
}

module.exports = { rpackDecode, rpackEncode, parseRisum, buildRisum, DECODE_MAP, ENCODE_MAP };
