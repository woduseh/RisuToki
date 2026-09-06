import type { RendererDocumentData } from './document-types';
import { validateNesting } from './cbs-parser';
import { parseTriggerScriptsText } from './trigger-script-model';
import { parsePromptTemplate } from './risup-prompt-model';
import { parseCustomPromptTemplateToggle, type ToggleTemplateModel } from './risup-toggle-model';
import { parseLorebookDecorators, type PreviewLoreDecorators } from './lorebook-decorators';
import { collectLiteralAssetReferences } from './preview-asset-references';

export interface DiagnosticSource {
  field: string;
  index?: number;
  path?: string;
  line?: number;
}
export interface DocumentDiagnostic {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  source: DiagnosticSource;
  detail?: string;
}
export interface DocumentDiagnosticOptions {
  assetNames?: string[];
  assetInventoryAvailable?: boolean;
  assetCount?: number;
}
export interface ModuleOverview {
  counts: { lorebook: number; lorebookFolders: number; regex: number; triggers: number; assets: number | null };
  toggles: ToggleTemplateModel;
  defaultVariables: {
    rawText: string;
    entries: { key: string; value: string; line: number }[];
    unparsedLines: number[];
  };
  triggerState: ReturnType<typeof parseTriggerScriptsText>['state'];
  triggers: {
    index: number;
    name: string;
    event: string;
    conditionCount: number;
    effectCount: number;
    supported: boolean;
  }[];
  lorebook: {
    index: number;
    name: string;
    folder: string;
    isFolder: boolean;
    alwaysActive: boolean;
    selective: boolean;
    useRegex: boolean;
    keys: string;
    secondaryKeys: string;
    insertOrder: number;
    decorators: PreviewLoreDecorators;
  }[];
}

const contentFields = [
  'description',
  'firstMessage',
  'globalNote',
  'personality',
  'scenario',
  'systemPrompt',
  'exampleMessage',
  'additionalText',
  'backgroundEmbedding',
  'css',
  'mainPrompt',
  'jailbreak',
  'instructChatTemplate',
  'JinjaTemplate',
  'groupTemplate',
  'autoSuggestPrompt',
  'systemContentReplacement',
];

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function lineAt(value: string, offset: number): number {
  return value.slice(0, offset).split('\n').length;
}

/** Static source inspection only: no CBS evaluation, regular-expression matching, Lua or LLM execution. */
export function diagnoseDocument(
  data: RendererDocumentData,
  options: DocumentDiagnosticOptions = {},
): DocumentDiagnostic[] {
  const diagnostics: DocumentDiagnostic[] = [];
  function add(
    severity: DocumentDiagnostic['severity'],
    code: string,
    message: string,
    source: DiagnosticSource,
    detail?: string,
  ) {
    const identity = `${code}:${source.path ?? source.field}:${source.line ?? 0}`;
    diagnostics.push({
      id: `${identity}:${diagnostics.filter((item) => item.id.startsWith(`${identity}:`)).length}`,
      severity,
      code,
      message,
      source,
      detail,
    });
  }
  const assets = new Set((options.assetNames ?? []).map((name) => name.toLowerCase()));
  function inspectContent(value: unknown, source: DiagnosticSource) {
    if (typeof value !== 'string' || !value) return;
    // Existing validator supports CBS block nesting, not the validity of every command or expression.
    for (const error of validateNesting(value).errors) {
      const offset = Number(/at offset (\d+)/.exec(error)?.[1] ?? 0);
      add(
        'error',
        'cbs-block-nesting',
        'CBS 닫는 블록에 대응하는 여는 블록이 없어요.',
        { ...source, line: lineAt(value, offset) },
        error,
      );
    }
    if (!options.assetInventoryAvailable) return;
    // Only complete literal references are checked. Nested/dynamic CBS is deliberately excluded.
    for (const { name, offset } of collectLiteralAssetReferences(value)) {
      if (!name || name.includes('::') || name.includes('\n') || assets.has(name.toLowerCase())) continue;
      add(
        'warning',
        'asset-reference-missing',
        `현재 에셋 목록에서 “${name}”을 찾지 못했어요.`,
        { ...source, line: lineAt(value, offset) },
        '외부 모듈이나 실행 중 생성되는 에셋은 이 정적 검사에 포함되지 않아요.',
      );
    }
  }
  contentFields.forEach((field) => inspectContent(data[field], { field, path: `$.${field}` }));
  for (const field of ['alternateGreetings', 'groupOnlyGreetings']) {
    const values = data[field];
    if (Array.isArray(values))
      values.forEach((value, index) => inspectContent(value, { field, index, path: `$.${field}[${index}]` }));
  }
  if (Array.isArray(data.lorebook))
    data.lorebook.forEach((entry, index) => {
      if (!record(entry)) {
        add('error', 'lorebook-invalid-entry', '로어북 항목은 JSON 객체여야 해요.', {
          field: 'lorebook',
          index,
          path: `$.lorebook[${index}]`,
        });
        return;
      }
      inspectContent(entry.content, { field: 'lorebook', index, path: `$.lorebook[${index}].content` });
    });
  if (Array.isArray(data.regex))
    data.regex.forEach((entry, index) => {
      if (!record(entry)) {
        add('error', 'regex-invalid-entry', '정규식 항목은 JSON 객체여야 해요.', {
          field: 'regex',
          index,
          path: `$.regex[${index}]`,
        });
        return;
      }
      const pattern = text(entry.find || entry.in);
      const source = { field: 'regex', index, path: `$.regex[${index}].${entry.find ? 'find' : 'in'}` };
      inspectContent(entry.replace || entry.out, {
        field: 'regex',
        index,
        path: `$.regex[${index}].${entry.replace ? 'replace' : 'out'}`,
      });
      if (String(entry.type).toLowerCase() === 'disabled') return;
      if (!pattern) {
        add('warning', 'regex-empty-pattern', '찾기 패턴이 비어 있어 정규식 처리에서 제외돼요.', source);
        return;
      }
      if (pattern.includes('{{')) {
        add('warning', 'regex-dynamic-pattern', 'CBS가 포함된 찾기 패턴은 정적 컴파일 검사에서 제외했어요.', source);
        return;
      }
      // Match content-simulation regexFlags: ableFlag selects custom flags; it is not an enable switch.
      const flagSource = entry.ableFlag === true ? text(entry.flag || entry.flags || 'g') : 'g';
      const flags =
        [
          ...new Set(
            flagSource
              .replace(/<.+?>/g, '')
              .split('')
              .filter((flag) => 'dgimsuvy'.includes(flag)),
          ),
        ].join('') || 'g';
      try {
        new RegExp(pattern, flags);
      } catch (error) {
        add(
          'error',
          'regex-invalid-pattern',
          '정규식 패턴 또는 적용 플래그를 컴파일할 수 없어요.',
          source,
          `${String(error)} (flags: ${flags})`,
        );
      }
    });

  const triggers = parseTriggerScriptsText(text(data.triggerScripts));
  triggers.issues.forEach((issue) => {
    const indexMatch = /^(?:\$|triggers)\[(\d+)\]/.exec(issue.path);
    const index = indexMatch ? Number(indexMatch[1]) : undefined;
    let issuePath = issue.path.replace(/^(?:\$|triggers)/, '');
    // The model normalizes effect/effects; source links must retain the stored field spelling.
    if (index !== undefined && record(triggers.triggers[index]?.rawValue)?.effect !== undefined) {
      issuePath = issuePath.replace(/\.effects(?=\[|$)/, '.effect');
    }
    const source = {
      field: 'triggerScripts',
      index,
      path: `$.triggerScripts${issuePath}`,
    };
    const unsupported = issue.code.startsWith('unsupported-');
    add(
      unsupported ? 'warning' : 'error',
      `trigger-${issue.code}`,
      unsupported
        ? '현재 정적 검사기가 해석하지 않는 트리거 구성 요소예요.'
        : '트리거 JSON 또는 필드 구조를 확인해 주세요.',
      source,
      issue.message,
    );
  });
  // Trigger Lua and unsupported effect payloads are not interpreted as CBS text.
  if (typeof data.promptTemplate === 'string') {
    const prompts = parsePromptTemplate(data.promptTemplate);
    if (prompts.state === 'invalid')
      add(
        'error',
        'prompt-invalid-json',
        '프롬프트 목록은 유효한 JSON 배열이어야 해요.',
        { field: 'promptTemplate', path: '$.promptTemplate' },
        prompts.parseError,
      );
    prompts.items.forEach((item, index) => {
      const source = { field: 'promptTemplate', index, path: `$.promptTemplate[${index}]` };
      if (!item.supported)
        add('warning', 'prompt-unsupported-shape', '현재 검사기가 해석하지 않는 프롬프트 형식이에요.', source);
      const raw = record(item.rawValue);
      for (const key of ['text', 'innerFormat', 'defaultText'])
        inspectContent(raw?.[key], { ...source, path: `${source.path}.${key}` });
    });
  }
  return diagnostics;
}

export function buildModuleOverview(
  data: RendererDocumentData,
  options: DocumentDiagnosticOptions = {},
): ModuleOverview {
  const triggers = parseTriggerScriptsText(text(data.triggerScripts));
  const lorebook = Array.isArray(data.lorebook) ? data.lorebook.map((entry) => record(entry) ?? {}) : [];
  const variables = text(data.defaultVariables);
  const entries: ModuleOverview['defaultVariables']['entries'] = [];
  const unparsedLines: number[] = [];
  variables.split(/\r?\n/).forEach((raw, index) => {
    const value = raw.trim();
    if (!value || /^(?:#|\/\/|--)/.test(value)) return;
    // Display declarations without asserting whether namespaces or key characters are runtime-supported.
    const separator = value.includes('=') ? value.indexOf('=') : value.indexOf(':');
    if (separator <= 0) {
      unparsedLines.push(index + 1);
      return;
    }
    entries.push({ key: value.slice(0, separator).trim(), value: value.slice(separator + 1).trim(), line: index + 1 });
  });
  return {
    counts: {
      lorebook: lorebook.length,
      lorebookFolders: lorebook.filter((entry) => entry.mode === 'folder').length,
      regex: Array.isArray(data.regex) ? data.regex.length : 0,
      triggers: triggers.triggers.length,
      assets:
        options.assetCount !== undefined
          ? options.assetCount
          : options.assetInventoryAvailable
            ? new Set(options.assetNames ?? []).size
            : null,
    },
    toggles: parseCustomPromptTemplateToggle(text(data.customModuleToggle)),
    defaultVariables: { rawText: variables, entries, unparsedLines },
    triggerState: triggers.state,
    triggers: triggers.triggers.map((trigger, index) => ({
      index,
      name: trigger.comment || `트리거 ${index + 1}`,
      event: trigger.type,
      conditionCount: trigger.conditions.length,
      effectCount: trigger.effects.length,
      supported: trigger.supported,
    })),
    lorebook: lorebook.map((entry, index) => ({
      index,
      name: text(entry.comment) || `로어북 ${index + 1}`,
      folder: text(entry.folder),
      isFolder: entry.mode === 'folder',
      alwaysActive: entry.alwaysActive === true || entry.constant === true,
      selective: entry.selective === true,
      useRegex: entry.useRegex === true,
      keys: text(entry.key),
      secondaryKeys: text(entry.secondkey),
      insertOrder: typeof entry.insertorder === 'number' ? entry.insertorder : 0,
      decorators: parseLorebookDecorators(text(entry.content)).decorators,
    })),
  };
}
