import {
  MCP_ACTIVITY_LIMIT,
  type McpActivityEvent,
  type McpActivityRecord,
  type McpActivitySnapshot,
} from './mcp-activity-types';

export function createMcpActivityBuffer(limit = MCP_ACTIVITY_LIMIT) {
  let sequence = 0;
  const entries = new Map<string, McpActivityEvent>();
  return {
    push(record: McpActivityRecord): McpActivityEvent {
      const event = structuredClone({ ...record, sequence: ++sequence });
      entries.set(event.requestId, event);
      while (entries.size > Math.max(1, limit)) entries.delete(entries.keys().next().value!);
      return structuredClone(event);
    },
    snapshot(): McpActivitySnapshot {
      return { sequence, entries: structuredClone([...entries.values()]) };
    },
  };
}
