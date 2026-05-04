import * as http from 'http';

import {
  collectFormatingOrderWarnings,
  parseFormatingOrder,
  parsePromptTemplate,
  type PromptItemModel,
} from './risup-prompt-model';
import {
  buildFieldBatchReadResults,
  buildFieldReadResponsePayload,
  getFieldAccessRules,
  getUnknownFieldHint,
  MAX_FIELD_BATCH,
  type SupportedFileType,
} from './mcp-field-access';
import type { ExternalDocumentBody } from './mcp-request-schemas';
import type { McpErrorInfo, McpSuccessOptions } from './mcp-response-envelope';
import type { CssCacheEntry, McpApiDeps, Section } from './mcp-api-server';

export interface ProbeDocumentRequest {
  body: ExternalDocumentBody;
  data: Record<string, unknown>;
  filePath: string;
  fileType: SupportedFileType;
}

export interface ProbeRouteDeps {
  parseLuaSections: McpApiDeps['parseLuaSections'];
  parseCssSections: McpApiDeps['parseCssSections'];
  stringifyTriggerScripts: McpApiDeps['stringifyTriggerScripts'];
  readProbeDocumentRequest: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    routePath: string,
    action: string,
    target: string,
  ) => Promise<ProbeDocumentRequest | null>;
  mcpError: (res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown) => void;
  jsonResSuccess: (res: http.ServerResponse, payload: Record<string, unknown>, opts: McpSuccessOptions) => void;
  buildLorebookListResponse: (rawEntries: Record<string, unknown>[], url: URL) => Record<string, unknown>;
  buildRegexListResponse: (regexEntries: Record<string, unknown>[]) => Record<string, unknown>;
  buildLuaListResponse: (luaCode: string, parseLuaSections: (lua: string) => Section[]) => Record<string, unknown>;
  buildCssListResponse: (cssCode: string, parseCssSections: (css: string) => CssCacheEntry) => Record<string, unknown>;
  buildGreetingListResponse: (arr: string[], greetingType: string, url: URL) => Record<string, unknown>;
  buildTriggerListResponse: (triggerScripts: unknown) => Record<string, unknown>;
  promptItemPreview: (item: PromptItemModel) => string;
}

function payloadCount(payload: Record<string, unknown>): number {
  return typeof payload.count === 'number' ? payload.count : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

export async function handleProbeRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  url: URL,
  deps: ProbeRouteDeps,
): Promise<boolean> {
  // POST /probe/field/:name — read a field from an unopened file
  if (
    parts[0] === 'probe' &&
    parts[1] === 'field' &&
    parts[2] &&
    !parts[3] &&
    parts[2] !== 'batch' &&
    req.method === 'POST'
  ) {
    const fieldName = decodeURIComponent(parts[2]);
    const probe = await deps.readProbeDocumentRequest(
      req,
      res,
      `probe/field/${fieldName}`,
      'probe field',
      `probe:field:${fieldName}`,
    );
    if (!probe) return true;
    const rules = getFieldAccessRules(probe.data);
    if (!rules.allowedFields.includes(fieldName)) {
      deps.mcpError(res, 400, {
        action: 'probe field',
        message: `Unknown field: ${fieldName} ${getUnknownFieldHint(rules)}`,
        suggestion: 'probe_field_batch 또는 list_fields 로 허용된 필드를 다시 확인하세요.',
        target: `probe:field:${fieldName}`,
      });
      return true;
    }
    const probePayload = buildFieldReadResponsePayload(probe.data, fieldName, deps);
    deps.jsonResSuccess(res, probePayload, {
      toolName: 'probe_field',
      summary: `Probed field "${fieldName}" from external file`,
    });
    return true;
  }

  // POST /probe/field/batch — read multiple fields from an unopened file
  if (parts[0] === 'probe' && parts[1] === 'field' && parts[2] === 'batch' && !parts[3] && req.method === 'POST') {
    const probe = await deps.readProbeDocumentRequest(
      req,
      res,
      'probe/field/batch',
      'probe field batch',
      'probe:field:batch',
    );
    if (!probe) return true;
    const fields = probe.body.fields;
    if (!Array.isArray(fields) || fields.length === 0) {
      deps.mcpError(res, 400, {
        action: 'probe field batch',
        message: 'fields must be a non-empty string array',
        suggestion: 'fields 를 문자열 배열로 전달하세요. 예: { "file_path": "...", "fields": ["name", "description"] }',
        target: 'probe:field:batch',
      });
      return true;
    }
    if (!fields.every((field): field is string => typeof field === 'string')) {
      deps.mcpError(res, 400, {
        action: 'probe field batch',
        message: 'fields must be a non-empty string array — every element must be a string',
        suggestion: 'fields 배열의 모든 항목이 문자열인지 확인하세요.',
        target: 'probe:field:batch',
      });
      return true;
    }
    if (fields.length > MAX_FIELD_BATCH) {
      deps.mcpError(res, 400, {
        action: 'probe field batch',
        message: `Maximum ${MAX_FIELD_BATCH} fields per batch`,
        suggestion: `요청을 ${MAX_FIELD_BATCH}개 이하의 필드로 나누어 여러 번 호출하세요.`,
        target: 'probe:field:batch',
      });
      return true;
    }
    const results = buildFieldBatchReadResults(probe.data, fields, deps);
    deps.jsonResSuccess(
      res,
      { count: results.length, fields: results },
      {
        toolName: 'probe_field_batch',
        summary: `Probed ${results.length} field(s) from external file`,
        artifacts: { count: results.length },
      },
    );
    return true;
  }

  // POST /probe/lorebook — list lorebook entries from an unopened file
  if (parts[0] === 'probe' && parts[1] === 'lorebook' && !parts[2] && req.method === 'POST') {
    const probe = await deps.readProbeDocumentRequest(req, res, 'probe/lorebook', 'probe lorebook', 'probe:lorebook');
    if (!probe) return true;
    const probeLbPayload = deps.buildLorebookListResponse(
      Array.isArray(probe.data.lorebook) ? (probe.data.lorebook as Record<string, unknown>[]) : [],
      url,
    );
    const count = payloadCount(probeLbPayload);
    deps.jsonResSuccess(res, probeLbPayload, {
      toolName: 'probe_lorebook',
      summary: `Probed lorebook from external file (${count} entries)`,
      artifacts: { count },
    });
    return true;
  }

  // POST /probe/regex — list regex entries from an unopened file
  if (parts[0] === 'probe' && parts[1] === 'regex' && !parts[2] && req.method === 'POST') {
    const probe = await deps.readProbeDocumentRequest(req, res, 'probe/regex', 'probe regex', 'probe:regex');
    if (!probe) return true;
    const probeRxPayload = deps.buildRegexListResponse(
      Array.isArray(probe.data.regex) ? (probe.data.regex as Record<string, unknown>[]) : [],
    );
    const count = payloadCount(probeRxPayload);
    deps.jsonResSuccess(res, probeRxPayload, {
      toolName: 'probe_regex',
      summary: `Probed regex from external file (${count} entries)`,
      artifacts: { count },
    });
    return true;
  }

  // POST /probe/lua — list Lua sections from an unopened file
  if (parts[0] === 'probe' && parts[1] === 'lua' && !parts[2] && req.method === 'POST') {
    const probe = await deps.readProbeDocumentRequest(req, res, 'probe/lua', 'probe lua', 'probe:lua');
    if (!probe) return true;
    const probeLuaPayload = deps.buildLuaListResponse(String(probe.data.lua || ''), deps.parseLuaSections);
    const count = payloadCount(probeLuaPayload);
    deps.jsonResSuccess(res, probeLuaPayload, {
      toolName: 'probe_lua',
      summary: `Probed Lua from external file (${count} sections)`,
      artifacts: { count },
    });
    return true;
  }

  // POST /probe/css — list CSS sections from an unopened file
  if (parts[0] === 'probe' && parts[1] === 'css' && !parts[2] && req.method === 'POST') {
    const probe = await deps.readProbeDocumentRequest(req, res, 'probe/css', 'probe css', 'probe:css');
    if (!probe) return true;
    const probeCssPayload = deps.buildCssListResponse(String(probe.data.css || ''), deps.parseCssSections);
    const count = payloadCount(probeCssPayload);
    deps.jsonResSuccess(res, probeCssPayload, {
      toolName: 'probe_css',
      summary: `Probed CSS from external file (${count} sections)`,
      artifacts: { count },
    });
    return true;
  }

  // POST /probe/greetings/:type — list greetings from an unopened file
  if (parts[0] === 'probe' && parts[1] === 'greetings' && parts[2] && !parts[3] && req.method === 'POST') {
    const greetingType = decodeURIComponent(parts[2]);
    if (greetingType !== 'alternate' && greetingType !== 'groupOnly') {
      deps.mcpError(res, 400, {
        action: 'probe greetings',
        message: 'type must be "alternate" or "groupOnly"',
        suggestion: 'probe_greetings는 alternate 또는 groupOnly 타입만 지원합니다.',
        target: 'probe:greetings',
      });
      return true;
    }
    const probe = await deps.readProbeDocumentRequest(
      req,
      res,
      `probe/greetings/${greetingType}`,
      'probe greetings',
      `probe:greetings:${greetingType}`,
    );
    if (!probe) return true;
    if (greetingType === 'groupOnly' && probe.fileType !== 'charx') {
      deps.mcpError(res, 400, {
        action: 'probe greetings',
        message: 'groupOnly greetings are only available for .charx cards.',
        suggestion: 'alternate greetings를 읽거나 .charx 파일을 대상으로 다시 시도하세요.',
        target: `probe:greetings:${greetingType}`,
      });
      return true;
    }
    const greetings =
      greetingType === 'groupOnly'
        ? stringArray(probe.data.groupOnlyGreetings)
        : stringArray(probe.data.alternateGreetings);
    const probeGreetingPayload = deps.buildGreetingListResponse(greetings, greetingType, url);
    const count = payloadCount(probeGreetingPayload);
    deps.jsonResSuccess(res, probeGreetingPayload, {
      toolName: 'probe_greetings',
      summary: `Probed ${greetingType} greetings from external file (${count} items)`,
      artifacts: { count, type: greetingType },
    });
    return true;
  }

  // POST /probe/triggers — list triggers from an unopened file
  if (parts[0] === 'probe' && parts[1] === 'triggers' && !parts[2] && req.method === 'POST') {
    const probe = await deps.readProbeDocumentRequest(req, res, 'probe/triggers', 'probe triggers', 'probe:triggers');
    if (!probe) return true;
    const probeTriggerPayload = deps.buildTriggerListResponse(probe.data.triggerScripts);
    const count = payloadCount(probeTriggerPayload);
    deps.jsonResSuccess(res, probeTriggerPayload, {
      toolName: 'probe_triggers',
      summary: `Probed triggers from external file (${count} items)`,
      artifacts: { count },
    });
    return true;
  }

  // POST /probe/risup/prompt-items — list risup prompt items from an unopened file
  if (
    parts[0] === 'probe' &&
    parts[1] === 'risup' &&
    parts[2] === 'prompt-items' &&
    !parts[3] &&
    req.method === 'POST'
  ) {
    const probe = await deps.readProbeDocumentRequest(
      req,
      res,
      'probe/risup/prompt-items',
      'probe risup prompt items',
      'probe:risup:promptTemplate',
    );
    if (!probe) return true;
    if (probe.fileType !== 'risup') {
      deps.mcpError(res, 400, {
        action: 'probe risup prompt items',
        message: 'Target file is not a risup preset.',
        suggestion: '.risup 파일을 대상으로 다시 시도하세요.',
        target: 'probe:risup:promptTemplate',
      });
      return true;
    }
    const rawText = typeof probe.data.promptTemplate === 'string' ? probe.data.promptTemplate : '';
    const model = parsePromptTemplate(rawText);
    if (model.state === 'invalid') {
      deps.mcpError(res, 400, {
        action: 'probe risup prompt items',
        message: `Invalid promptTemplate: ${model.parseError}`,
        suggestion: 'external_write_field 또는 open_file 후 write_field로 promptTemplate을 수정하세요.',
        target: 'probe:risup:promptTemplate',
        details: { parseError: model.parseError },
      });
      return true;
    }
    const items = model.items.map((item, index) => {
      const entry: Record<string, unknown> = {
        index,
        id: item.id ?? null,
        type: item.type ?? null,
        supported: item.supported,
        preview: deps.promptItemPreview(item),
      };
      if (item.supported && item.name !== undefined) {
        entry.name = item.name;
      }
      return entry;
    });
    deps.jsonResSuccess(
      res,
      {
        count: model.items.length,
        state: model.state,
        hasUnsupportedContent: model.hasUnsupportedContent,
        items,
      },
      {
        toolName: 'probe_risup_prompt_items',
        summary: `Probed ${model.items.length} risup prompt items (state: ${model.state})`,
        artifacts: { count: model.items.length, state: model.state },
      },
    );
    return true;
  }

  // POST /probe/risup/formating-order — read risup formating order from an unopened file
  if (
    parts[0] === 'probe' &&
    parts[1] === 'risup' &&
    parts[2] === 'formating-order' &&
    !parts[3] &&
    req.method === 'POST'
  ) {
    const probe = await deps.readProbeDocumentRequest(
      req,
      res,
      'probe/risup/formating-order',
      'probe risup formating order',
      'probe:risup:formatingOrder',
    );
    if (!probe) return true;
    if (probe.fileType !== 'risup') {
      deps.mcpError(res, 400, {
        action: 'probe risup formating order',
        message: 'Target file is not a risup preset.',
        suggestion: '.risup 파일을 대상으로 다시 시도하세요.',
        target: 'probe:risup:formatingOrder',
      });
      return true;
    }
    const rawText = typeof probe.data.formatingOrder === 'string' ? probe.data.formatingOrder : '';
    const model = parseFormatingOrder(rawText);
    if (model.state === 'invalid') {
      deps.mcpError(res, 400, {
        action: 'probe risup formating order',
        message: `Invalid formatingOrder: ${model.parseError}`,
        suggestion: 'external_write_field 또는 open_file 후 write_field로 formatingOrder를 수정하세요.',
        target: 'probe:risup:formatingOrder',
        details: { parseError: model.parseError },
      });
      return true;
    }
    const items = model.items.map((item, index) => ({ index, token: item.token, known: item.known }));
    const promptModel = parsePromptTemplate(
      typeof probe.data.promptTemplate === 'string' ? probe.data.promptTemplate : '',
    );
    const warnings = promptModel.state !== 'invalid' ? collectFormatingOrderWarnings(promptModel, model) : [];
    deps.jsonResSuccess(
      res,
      { state: model.state, items, warnings },
      {
        toolName: 'probe_risup_formating_order',
        summary: `Probed risup formating order (${items.length} tokens, state: ${model.state})`,
        artifacts: { count: items.length, state: model.state },
      },
    );
    return true;
  }

  return false;
}
