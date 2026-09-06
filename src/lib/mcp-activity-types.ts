export type McpActivityCategory = 'read' | 'change' | 'diagnostic' | 'reference' | 'other';
export type McpActivityStatus = 'running' | 'succeeded' | 'failed' | 'completed';

export interface McpActivityTarget {
  kind: 'active' | 'external' | 'reference' | 'session' | 'unknown';
  documentId?: string;
  name?: string;
  filePath?: string;
}

export interface McpActivitySource {
  documentId: string;
  field: string;
}

/** Observation metadata only. Never contains request/response bodies or credentials. */
export interface McpActivityRecord {
  requestId: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  method: string;
  route: string;
  category: McpActivityCategory;
  status: McpActivityStatus;
  httpStatus?: number;
  target: McpActivityTarget;
  source?: McpActivitySource;
}

export interface McpActivityEvent extends McpActivityRecord {
  sequence: number;
}

export interface McpActivitySnapshot {
  sequence: number;
  entries: McpActivityEvent[];
}

export const MCP_ACTIVITY_LIMIT = 80;
