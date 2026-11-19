import { listUimoriExtensionHosts, validateUimoriExtension } from './uimori-extensions';

// Each rule mirrors how Uimori v0.13.3 imports or runs the source: server/risu-import-lore.ts (lore
// decorators and titles), server/risu-native-render.ts (regex commands), server/risu-preset-program.ts
// (preset blocks and settings), server/risu-native-lua.ts (Lua globals), and docs/RISU-IMPORT.md
// (display and media limits).
export const UIMORI_COMPATIBILITY_BASELINE = 'Uimori v0.13.3';

export interface UimoriCompatibilityFinding {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  path: string;
  detail?: string;
}

export interface UimoriCompatibilityResult {
  baseline: string;
  fileType: string;
  ok: boolean;
  counts: { error: number; warning: number };
  findings: UimoriCompatibilityFinding[];
  summary: string;
}

const UNSUPPORTED_LORE_PLACEMENT = new Set([
  'position',
  'inject_lore',
  'inject_at',
  'inject_replace',
  'inject_prepend',
]);
const SUPPORTED_PRESET_BLOCKS = new Set([
  'plain',
  'chatML',
  'chat',
  'cache',
  'persona',
  'description',
  'lorebook',
  'authornote',
  'postEverything',
  'memory',
]);
const UNSUPPORTED_PRESET_SETTINGS = ['utilOverride', 'customChainOfThought'];
const UNSUPPORTED_LUA_GLOBALS =
  /(?<![\w.:]|function\s+)(sleep|request|generateImage|similarity|getCharacterImage|getPersonaImage|setName|setDescription|setCharacterFirstMessage|setBackgroundEmbedding|loadLoreBooks|upsertLocalLoreBook|log|logMain)\s*\(/gu;
const LUA_REQUIRE = /(?<![\w.:])require\s*\(?\s*["']([^"']+)["']/gu;
const MEDIA_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'ogg',
  'oga',
  'flac',
  'm4a',
  'aac',
  'opus',
  'mp4',
  'webm',
  'mov',
  'mkv',
  'avi',
]);
const DISPLAY_CHECKS: Array<{ code: string; pattern: RegExp; message: string }> = [
  {
    code: 'uimori-display-script',
    pattern: /<(?:script|iframe)\b/iu,
    message: 'Uimori는 <script>와 <iframe>을 실행하지 않아요.',
  },
  {
    code: 'uimori-display-external',
    pattern: /@import\b|url\(\s*["']?https?:\/\/|(?:src|href)\s*=\s*["']?https?:\/\//iu,
    message: 'Uimori는 외부 CSS·이미지·주소를 불러오지 않아요. 저장된 에셋을 쓰세요.',
  },
];

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function checkUimoriCompatibility(data: Record<string, unknown>): UimoriCompatibilityResult {
  const fileType = data._fileType === 'risum' || data._fileType === 'risup' ? data._fileType : 'charx';
  const findings: UimoriCompatibilityFinding[] = [];
  const add = (finding: UimoriCompatibilityFinding) => findings.push(finding);

  const readHost = listUimoriExtensionHosts(data).find((host) =>
    fileType === 'charx' ? host.pointer.startsWith('/_card/') : host.pointer.startsWith('/_moduleData/'),
  );
  const extensionError = readHost && fileType !== 'risup' ? validateUimoriExtension(readHost.value) : null;
  if (readHost && extensionError) {
    add({
      severity: 'error',
      code: 'uimori-extension-invalid',
      message: 'Uimori가 이 extensions.uimori 값을 거부해서 가져오기에 실패해요.',
      path: readHost.pointer,
      detail: extensionError,
    });
  }

  const lorebook = Array.isArray(data.lorebook) ? data.lorebook : [];
  lorebook.forEach((rawEntry, index) => {
    const entry = record(rawEntry);
    if (!entry || entry.mode === 'folder') return;
    const lines = text(entry.content).split('\n');
    const leading = lines.findIndex((line) => !line.trim().startsWith('@@'));
    const leadingLines = leading === -1 ? lines : lines.slice(0, leading);
    const names = leadingLines
      .map((line) => /^@@(\w+)\s*(.*)$/u.exec(line.trim()))
      .filter((match): match is RegExpExecArray => match !== null);
    const path = `$.lorebook[${index}]`;
    for (const [, name, argument] of names) {
      const negativeDepth = (name === 'depth' || name === 'reverse_depth') && Number(argument) < 0;
      if (UNSUPPORTED_LORE_PLACEMENT.has(name) || negativeDepth) {
        add({
          severity: 'warning',
          code: 'uimori-lore-placement-unsupported',
          message: `Uimori는 @@${name}${negativeDepth ? ' (음수)' : ''} 배치를 적용하지 않아요. @@depth, @@reverse_depth, @@role, @@end만 반영돼요.`,
          path: `${path}.content`,
        });
      }
    }
    if (leading !== -1 && lines.slice(leading).some((line) => line.trim().startsWith('@@'))) {
      add({
        severity: 'warning',
        code: 'uimori-lore-directive-in-body',
        message: '본문 중간의 @@ 줄은 Uimori가 해석하지 않고 본문으로 남겨요. 지시문은 내용 맨 앞에 두세요.',
        path: `${path}.content`,
      });
    }
    const pinned = entry.alwaysActive === true || names.some(([, name]) => name === 'activate');
    const neverSent = names.some(([, name]) => name === 'dont_activate');
    if (!pinned && !neverSent && !text(entry.comment).trim() && !text(entry.name).trim()) {
      add({
        severity: 'warning',
        code: 'uimori-lore-untitled',
        message:
          '이름 없는 선택형 로어는 Uimori에서 "로어 N"으로 표시돼 판단 모델과 작문 모델이 찾기 어려워요. 내용을 알 수 있는 comment를 붙이세요.',
        path: `${path}.comment`,
      });
    }
  });

  const regexEntries = fileType === 'risup' ? record(data._presetData)?.regex : data.regex;
  if (Array.isArray(regexEntries)) {
    regexEntries.forEach((rawEntry, index) => {
      const entry = record(rawEntry);
      if (!entry || String(entry.type).toLowerCase() === 'disabled') return;
      const output = text(entry.out ?? entry.replace);
      if (output.startsWith('@@') && !/^@@move_(?:top|bottom)/u.test(output)) {
        add({
          severity: 'warning',
          code: 'uimori-regex-command-unsupported',
          message: `Uimori는 정규식 특수 출력 ${output.split(/\s/u, 1)[0]}을 실행하지 않아요. @@move_top과 @@move_bottom만 지원해요.`,
          path: fileType === 'risup' ? `$._presetData.regex[${index}]` : `$.regex[${index}]`,
        });
      }
    });
  }

  if (fileType === 'risup') {
    const template = parseJson(data.promptTemplate);
    if (Array.isArray(template)) {
      template.forEach((rawItem, index) => {
        const type = String(record(rawItem)?.type ?? '');
        if (!SUPPORTED_PRESET_BLOCKS.has(type)) {
          add({
            severity: 'warning',
            code: 'uimori-preset-block-unsupported',
            message: `Uimori는 ${type || '형식 없는'} 블록을 저장만 하고 실행하지 않아요.`,
            path: `$.promptTemplate[${index}]`,
          });
        } else if (type === 'memory') {
          add({
            severity: 'warning',
            code: 'uimori-preset-memory-slot',
            message: 'Uimori는 memory 블록의 위치와 앞뒤 문구를 쓰지 않고 자체 요약을 보내요.',
            path: `$.promptTemplate[${index}]`,
          });
        }
      });
    }
    const settings = record(parseJson(data.promptSettings));
    for (const key of UNSUPPORTED_PRESET_SETTINGS) {
      if (settings?.[key] === true) {
        add({
          severity: 'warning',
          code: 'uimori-preset-host-setting',
          message: `Uimori는 promptSettings.${key}를 적용하지 않아요.`,
          path: `$.promptSettings.${key}`,
        });
      }
    }
  }

  const triggers = Array.isArray(data.triggerScripts) ? data.triggerScripts : [];
  triggers.forEach((rawTrigger, triggerIndex) => {
    const trigger = record(rawTrigger);
    const effects = Array.isArray(trigger?.effect) ? trigger.effect : [];
    effects.forEach((rawEffect, effectIndex) => {
      const effect = record(rawEffect);
      if (effect?.type !== 'triggerlua') return;
      const code = text(effect.code).replace(/--(?!\[\[).*$/gmu, '');
      const path = `$.triggerScripts[${triggerIndex}].effect[${effectIndex}].code`;
      const ownDefinitions = new Set(
        [...code.matchAll(/\bfunction\s+([\w]+)\s*\(|\blocal\s+([\w]+)\s*=|^\s*([\w]+)\s*=/gmu)].map(
          (match) => match[1] ?? match[2] ?? match[3],
        ),
      );
      const unsupported = new Set(
        [...code.matchAll(UNSUPPORTED_LUA_GLOBALS)]
          .map((match) => match[1])
          .filter((name) => !ownDefinitions.has(name)),
      );
      for (const [, module] of code.matchAll(LUA_REQUIRE))
        if (module !== 'json') unsupported.add(`require("${module}")`);
      if (/\bmath\.randomseed\s*\(/u.test(code)) unsupported.add('math.randomseed');
      if (unsupported.size > 0) {
        add({
          severity: 'warning',
          code: 'uimori-lua-api-unsupported',
          message: 'Uimori Lua에서 지원하지 않는 함수를 호출해요. 실행하면 오류가 나요.',
          path,
          detail: [...unsupported].join(', '),
        });
      }
    });
  });

  const displaySources: Array<{ path: string; value: unknown }> = [
    { path: '$.css', value: data.css },
    { path: '$.backgroundEmbedding', value: data.backgroundEmbedding },
    { path: '$.firstMessage', value: data.firstMessage },
    ...(Array.isArray(data.alternateGreetings) ? data.alternateGreetings : []).map((value, index) => ({
      path: `$.alternateGreetings[${index}]`,
      value,
    })),
    ...(Array.isArray(regexEntries) ? regexEntries : []).map((entry, index) => ({
      path: fileType === 'risup' ? `$._presetData.regex[${index}].out` : `$.regex[${index}].out`,
      value: record(entry)?.out ?? record(entry)?.replace,
    })),
  ];
  for (const source of displaySources) {
    const value = text(source.value);
    if (!value) continue;
    for (const check of DISPLAY_CHECKS) {
      if (check.pattern.test(value))
        add({ severity: 'warning', code: check.code, message: check.message, path: source.path });
    }
  }

  const declaredAssets = [
    ...(Array.isArray(data.cardAssets) ? data.cardAssets : []).map((asset) => ({
      name: text(record(asset)?.name),
      ext: text(record(asset)?.ext),
    })),
    ...(fileType === 'risum'
      ? (() => {
          const moduleData = record(data._moduleData);
          const assets = record(moduleData?.module)?.assets ?? moduleData?.assets;
          return (Array.isArray(assets) ? assets : []).map((asset) => ({
            name: text(Array.isArray(asset) ? asset[0] : ''),
            ext: text(Array.isArray(asset) ? asset[2] : ''),
          }));
        })()
      : []),
  ];
  const media = declaredAssets.filter((asset) => MEDIA_EXTENSIONS.has(asset.ext.toLowerCase().replace(/^\./u, '')));
  if (media.length > 0) {
    add({
      severity: 'warning',
      code: 'uimori-asset-media-unsupported',
      message: `오디오·영상 에셋 ${media.length}개는 Uimori에서 재생되지 않고 파일에만 남아요.`,
      path: fileType === 'risum' ? '$._moduleData.module.assets' : '$.cardAssets',
      detail: media
        .slice(0, 20)
        .map((asset) => asset.name || `(이름 없음).${asset.ext}`)
        .join(', '),
    });
  }

  const counts = {
    error: findings.filter((finding) => finding.severity === 'error').length,
    warning: findings.filter((finding) => finding.severity === 'warning').length,
  };
  return {
    baseline: UIMORI_COMPATIBILITY_BASELINE,
    fileType,
    ok: counts.error === 0,
    counts,
    findings,
    summary:
      findings.length === 0
        ? `No Uimori compatibility issues found (${UIMORI_COMPATIBILITY_BASELINE})`
        : `${counts.error} error(s) and ${counts.warning} warning(s) against ${UIMORI_COMPATIBILITY_BASELINE}`,
  };
}
