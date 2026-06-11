// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  closeServer,
  createSearchFixture,
  postJson,
  startTestApiServer,
  type SearchFixture,
} from './mcp-api-test-harness';

interface McpErrorEnvelope {
  action: string;
  error: string;
  status: number;
  target: string;
  retryable?: boolean;
  next_actions?: string[];
  suggestion?: string;
  details?: unknown;
}

interface McpRecoveryEnvelope extends McpErrorEnvelope {
  retryable: boolean;
  next_actions: string[];
}

describe('MCP API risum asset compatibility', () => {
  it('stores risum asset metadata with ext semantics and x-risu-asset card type on add', async () => {
    const currentData: SearchFixture = {
      _fileType: 'charx',
      risumAssets: [],
      cardAssets: [],
      _moduleData: {
        module: {
          assets: [],
        },
      },
    };
    const api = await startTestApiServer(currentData);

    try {
      const response = await postJson<{ ok: boolean; index: number; name: string; size: number }>(
        api.port,
        api.token,
        '/risum-asset/add',
        {
          name: 'themeAudio',
          path: 'assets/audio/theme.mp3',
          base64: Buffer.from('fake-audio').toString('base64'),
        },
      );

      expect(response.status).toBe(200);
      expect((currentData._moduleData as { module: { assets: string[][] } }).module.assets).toEqual([
        ['themeAudio', '', 'mp3'],
      ]);
      expect(currentData.cardAssets).toEqual([
        {
          type: 'x-risu-asset',
          uri: 'embeded://assets/audio/theme.mp3',
          name: 'themeAudio',
          ext: 'mp3',
        },
      ]);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — asset routes', () => {
  it('returns a structured error envelope for missing fileName in POST /asset/add', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/asset/add', {
        base64: Buffer.from('asset-bytes').toString('base64'),
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'add_asset');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'asset:add');
      expect(res.data.error).toContain('fileName');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for invalid file name characters in POST /asset/add', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/asset/add', {
        fileName: 'bad/name.png',
        base64: Buffer.from('asset-bytes').toString('base64'),
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'add_asset');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'asset:add');
      expect(res.data).toHaveProperty('error', '파일명에 허용되지 않는 문자가 포함되어 있습니다.');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for duplicate asset paths in POST /asset/add', async () => {
    const assetPath = 'assets/other/image/duplicate.png';
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [{ path: assetPath, data: Buffer.from('existing-asset') }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/asset/add', {
        fileName: 'duplicate.png',
        base64: Buffer.from('new-asset').toString('base64'),
      });
      expect(res.status).toBe(409);
      expect(res.data).toHaveProperty('action', 'add_asset');
      expect(res.data).toHaveProperty('status', 409);
      expect(res.data).toHaveProperty('target', `asset:${assetPath}`);
      expect(res.data).toHaveProperty('error', `에셋 경로 "${assetPath}"가 이미 존재합니다.`);
      expect(res.data).toHaveProperty('suggestion', '다른 파일명이나 폴더를 사용하세요.');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for invalid newName in POST /asset/:idx/rename', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [{ path: 'assets/other/image/original.png', data: Buffer.from('asset-bytes') }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/asset/0/rename', {
        newName: 'bad/name.png',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'rename_asset');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'asset:0');
      expect(res.data).toHaveProperty('error', '파일명에 허용되지 않는 문자가 포함되어 있습니다.');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects rename collisions and keeps card/x_meta references synchronized', async () => {
    const cardAssets: Array<Record<string, unknown>> = [
      { type: 'icon', uri: 'embeded://assets/icon/original.png', name: 'original', ext: 'png' },
    ];
    const xMeta: Record<string, unknown> = {
      original: { type: 'PNG' },
      existing: { type: 'PNG' },
    };
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [
        { path: 'assets/icon/original.png', data: Buffer.from('asset-bytes') },
        { path: 'assets/icon/existing.png', data: Buffer.from('existing') },
      ],
      cardAssets,
      xMeta,
    };
    const api = await startTestApiServer(fixture);
    try {
      const collision = await postJson<McpErrorEnvelope>(api.port, api.token, '/asset/0/rename', {
        newName: 'existing.png',
      });
      expect(collision.status).toBe(409);

      const renamed = await postJson<Record<string, unknown>>(api.port, api.token, '/asset/0/rename', {
        newName: 'renamed.webp',
      });
      expect(renamed.status).toBe(200);
      expect(cardAssets[0]).toMatchObject({
        uri: 'embeded://assets/icon/renamed.webp',
        name: 'renamed',
        ext: 'webp',
      });
      expect(xMeta).not.toHaveProperty('original');
      expect(xMeta).toHaveProperty('renamed');

      const deleted = await postJson<Record<string, unknown>>(api.port, api.token, '/asset/0/delete', {});
      expect(deleted.status).toBe(200);
      expect(cardAssets).toEqual([]);
      expect(xMeta).not.toHaveProperty('renamed');
    } finally {
      await closeServer(api.server);
    }
  });

  it('delete_charx_asset rejects stale expected_path with 409 envelope', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [{ path: 'assets/other/image/original.png', data: Buffer.from('asset-bytes') }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/asset/0/delete', {
        expected_path: 'assets/other/image/other.png',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.retryable).toBe(true);
      expect(res.data.next_actions).toEqual(expect.arrayContaining(['list_charx_assets', 'read_charx_asset']));
      expect(res.data.error).toContain('Stale asset index 0');
      expect(res.data.details).toEqual(
        expect.objectContaining({
          expected_path: 'assets/other/image/other.png',
          actual_path: 'assets/other/image/original.png',
        }),
      );
    } finally {
      await closeServer(api.server);
    }
  });

  it('compress_assets_webp dry_run returns a destructive preview without mutating assets', async () => {
    const assetPath = 'assets/other/image/original.png';
    const bytes = Buffer.from('not-a-real-png');
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [{ path: assetPath, data: Buffer.from(bytes) }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/assets/compress-webp', {
        dry_run: true,
        quality: 75,
      });
      expect(res.status).toBe(200);
      expect(res.data.dry_run).toBe(true);
      expect(res.data.stats).toEqual(
        expect.objectContaining({
          total: 1,
          convertible: 1,
          skipped: 0,
          originalSize: bytes.length,
        }),
      );
      expect(res.data.preview).toEqual([
        expect.objectContaining({ index: 0, path: assetPath, newPath: 'assets/other/image/original.webp' }),
      ]);
      expect((fixture.assets as Array<{ path: string; data: Buffer }>)[0].path).toBe(assetPath);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects conflicting dry_run aliases in POST /assets/compress-webp', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [{ path: 'assets/other/image/original.png', data: Buffer.from('asset-bytes') }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/assets/compress-webp', {
        dry_run: true,
        dryRun: false,
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'compress-webp');
      expect(res.data.error).toContain('dry_run and dryRun');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — risum-asset routes', () => {
  it('returns a structured error envelope for missing name in POST /risum-asset/add', async () => {
    const fixture: SearchFixture = {
      _fileType: 'charx',
      risumAssets: [],
      cardAssets: [],
      _moduleData: {
        module: {
          assets: [],
        },
      },
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/risum-asset/add', {
        path: 'assets/audio/theme.mp3',
        base64: Buffer.from('fake-audio').toString('base64'),
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'add_risum_asset');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'risum-asset:add');
      expect(res.data.error).toContain('name');
    } finally {
      await closeServer(api.server);
    }
  });

  it('delete_risum_asset rejects stale expected_path with 409 envelope', async () => {
    const fixture: SearchFixture = {
      _fileType: 'risum',
      risumAssets: [Buffer.from('fake-audio')],
      cardAssets: [],
      _moduleData: {
        module: {
          assets: [['theme', '', 'assets/audio/theme.mp3']],
        },
      },
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/risum-asset/0/delete', {
        expected_path: 'assets/audio/other.mp3',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.error).toContain('Stale asset index 0');
      expect(res.data.details).toEqual(
        expect.objectContaining({
          expected_path: 'assets/audio/other.mp3',
          actual_path: 'assets/audio/theme.mp3',
        }),
      );
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP error recovery metadata — asset conflicts', () => {
  it('duplicate asset returns retryable: true', async () => {
    const assetPath = 'assets/other/image/recovery-dup.png';
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [{ path: assetPath, data: Buffer.from('existing-asset') }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpRecoveryEnvelope>(api.port, api.token, '/asset/add', {
        fileName: 'recovery-dup.png',
        base64: Buffer.from('new-asset').toString('base64'),
      });
      expect(res.status).toBe(409);
      expect(res.data.retryable).toBe(true);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });
});
