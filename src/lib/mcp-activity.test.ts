// @vitest-environment node
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  observeMcpRequest,
  observeMcpBody,
  observeMcpResponse,
  observeMcpActiveTarget,
  observeMcpReferenceTarget,
} from './mcp-activity-observer';
import { createMcpActivityBuffer } from './mcp-activity-buffer';
import type { McpActivityRecord } from './mcp-activity-types';
import {
  closeServer,
  createExternalFixtureHelpers,
  createLegacyTestApiServer,
  createSearchFixture,
  getJson,
  postJson,
} from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';

const testDirectory = useMcpApiTestDir('activity');
const startServer = createLegacyTestApiServer(testDirectory);

describe('MCP request activity', () => {
  it('records real authenticated requests and outcomes without bodies, query strings or credentials', async () => {
    const records: McpActivityRecord[] = [];
    const api = await startServer(createSearchFixture(), [], undefined, {
      onActivity: (record) => records.push(record),
      getActivityDocument: () => ({ kind: 'active', documentId: 'document-1', name: 'Synthetic' }),
    });
    try {
      await getJson(api.port, 'not-authorized', '/fields');
      expect(records).toEqual([]);
      const read = await getJson(api.port, api.token, '/field/description?secret=PRIVATE_QUERY');
      expect(read.status).toBe(200);
      const write = await postJson(api.port, api.token, '/field/description', { content: 'PRIVATE_PROMPT_TEXT' });
      expect(write.status).toBe(200);
      const failure = await getJson(api.port, api.token, '/field/PRIVATE_PATH_VALUE');
      expect(failure.status).toBeGreaterThanOrEqual(400);
      const completed = records.filter((record) => record.status !== 'running');
      expect(completed.map((record) => record.status)).toEqual(['succeeded', 'succeeded', 'failed']);
      expect(completed.map((record) => record.category)).toEqual(['read', 'change', 'read']);
      expect(completed[0].target.documentId).toBe('document-1');
      expect(completed[0].source).toEqual({ documentId: 'document-1', field: 'description' });
      expect(completed.every((record) => typeof record.durationMs === 'number')).toBe(true);
      const stored = JSON.stringify(records);
      for (const secret of [
        'PRIVATE_QUERY',
        'PRIVATE_PROMPT_TEXT',
        'PRIVATE_PATH_VALUE',
        api.token,
        'Field Alpha is searchable.',
      ])
        expect(stored).not.toContain(secret);
    } finally {
      await closeServer(api.server);
    }
  });

  it('keeps external and reference targets separate from the app-selected document', async () => {
    const external = createExternalFixtureHelpers(testDirectory).createExternalCharxFixture();
    const records: McpActivityRecord[] = [];
    const api = await startServer(
      createSearchFixture(),
      [{ fileName: 'observed-reference.charx', data: createSearchFixture() }],
      undefined,
      {
        onActivity: (record) => records.push(record),
        getActivityDocument: () => ({ kind: 'active', documentId: 'selected', name: 'Selected' }),
      },
    );
    try {
      await postJson(api.port, api.token, '/external/inspect', { file_path: external.filePath });
      await getJson(api.port, api.token, '/references');
      await getJson(api.port, api.token, `/cbs/validate?file_path=${encodeURIComponent(external.filePath)}`);
      await getJson(api.port, api.token, '/reference/0/field/description');
      const completed = records.filter((record) => record.status !== 'running');
      expect(completed[0].target).toEqual({ kind: 'external', filePath: external.filePath });
      expect(completed[1].target).toEqual({ kind: 'reference' });
      expect(completed[2].target).toEqual({ kind: 'external', filePath: external.filePath });
      expect(completed[2].category).toBe('diagnostic');
      expect(completed[3].target).toMatchObject({ kind: 'reference', name: 'observed-reference.charx' });
      expect(completed.every((record) => !record.target.documentId && !record.source)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('does not let a failing observer alter API success', async () => {
    const api = await startServer(createSearchFixture(), [], undefined, {
      onActivity: () => {
        throw new Error('UI gone');
      },
    });
    try {
      expect((await getJson(api.port, api.token, '/fields')).status).toBe(200);
    } finally {
      await closeServer(api.server);
    }
  });

  it('distinguishes HTTP completion without a known outcome and aborted requests', () => {
    const records: McpActivityRecord[] = [];
    const req = { method: 'POST' } as IncomingMessage;
    const res = Object.assign(new EventEmitter(), { statusCode: 200, writableFinished: true }) as ServerResponse;
    observeMcpRequest({ req, res, parts: ['probe', 'field'], readOnly: true, emit: (record) => records.push(record) });
    observeMcpBody(req, { content: 'SECRET', file_path: 'not-a-valid-file' });
    observeMcpResponse(res, { arbitrary: 'SECRET' });
    res.emit('finish');
    res.emit('close');
    expect(records).toHaveLength(2);
    expect(records[1].status).toBe('completed');
    const aborted = Object.assign(new EventEmitter(), { statusCode: 200, writableFinished: false }) as ServerResponse;
    observeMcpRequest({
      req,
      res: aborted,
      parts: ['field', 'description'],
      readOnly: false,
      emit: (record) => records.push(record),
    });
    aborted.emit('close');
    expect(records.at(-1)?.status).toBe('failed');
    expect(JSON.stringify(records)).not.toContain('SECRET');
  });

  it('publishes resolved targets while responses are pending without duplicate updates', () => {
    const records: McpActivityRecord[] = [];
    const req = { method: 'POST' } as IncomingMessage;
    const res = Object.assign(new EventEmitter(), { statusCode: 200, writableFinished: false }) as ServerResponse;
    observeMcpRequest({
      req,
      res,
      parts: ['external', 'inspect'],
      readOnly: true,
      emit: (record) => records.push(record),
    });
    const filePath = path.resolve('pending.charx');
    observeMcpBody(req, { file_path: filePath });
    observeMcpBody(req, { file_path: filePath });
    expect(records).toHaveLength(2);
    expect(records[0].target).toEqual({ kind: 'external' });
    expect(records[1]).toMatchObject({
      requestId: records[0].requestId,
      status: 'running',
      target: { kind: 'external', filePath },
    });
    expect(records[1].endedAt).toBeUndefined();

    const activeReq = { method: 'GET' } as IncomingMessage;
    observeMcpRequest({
      req: activeReq,
      res,
      parts: ['field', 'description'],
      readOnly: true,
      activeTarget: { kind: 'active', documentId: 'before' },
      emit: (record) => records.push(record),
    });
    observeMcpActiveTarget(activeReq, { kind: 'active', documentId: 'dispatched' });
    observeMcpActiveTarget(activeReq, { kind: 'active', documentId: 'dispatched' });
    expect(records).toHaveLength(4);
    expect(records[3]).toMatchObject({
      requestId: records[2].requestId,
      status: 'running',
      target: { kind: 'active', documentId: 'dispatched' },
      source: { documentId: 'dispatched', field: 'description' },
    });
    expect(records[2].source?.documentId).toBe('before');

    const referenceReq = { method: 'GET' } as IncomingMessage;
    observeMcpRequest({
      req: referenceReq,
      res,
      parts: ['reference', '0', 'fields'],
      readOnly: true,
      emit: (record) => records.push(record),
    });
    observeMcpReferenceTarget(referenceReq, { kind: 'reference', name: 'Resolved reference' });
    observeMcpReferenceTarget(referenceReq, { kind: 'reference', name: 'Resolved reference' });
    expect(records).toHaveLength(6);
    expect(records[5]).toMatchObject({
      requestId: records[4].requestId,
      status: 'running',
      target: { kind: 'reference', name: 'Resolved reference' },
    });
  });

  it('bounds the ring by requests and protects snapshots from caller mutation', () => {
    const buffer = createMcpActivityBuffer(2);
    const record: McpActivityRecord = {
      requestId: 'one',
      startedAt: 1,
      method: 'GET',
      route: '/fields',
      category: 'read',
      status: 'running',
      target: { kind: 'active', name: 'One' },
    };
    buffer.push(record);
    buffer.push({ ...record, status: 'succeeded' });
    buffer.push({ ...record, requestId: 'two' });
    expect(buffer.snapshot().entries).toHaveLength(2);
    buffer.push({ ...record, requestId: 'three' });
    const snapshot = buffer.snapshot();
    expect(snapshot.entries.map((entry) => entry.requestId)).toEqual(['two', 'three']);
    snapshot.entries[0].target.name = 'Mutated';
    expect(buffer.snapshot().entries[0].target.name).toBe('One');
    expect(snapshot.sequence).toBe(4);
  });
});
