import {
  buildAssistantLaunchCommand,
  buildWindowsAssistantBootstrapCommand,
  detectRuntimePlatform,
} from './assistant-launch';
import type { AssistantAgent } from './assistant-launch';
import { AI_AGENT_LABELS } from './terminal-chat';

export interface PromptInfo {
  fileName: string;
  name: string;
  stats: string;
}

interface NavigatorLike {
  platform?: string;
  userAgentData?: {
    platform?: string;
  };
}

export interface AssistantDeps {
  rpMode: string;
  rpCustomText: string;
  hasTerminal: boolean;
  readPersona(mode: string): Promise<string>;
  getClaudePrompt(): Promise<PromptInfo | null>;
  writeMcpConfig(): Promise<unknown>;
  writeCopilotMcpConfig(): Promise<unknown>;
  writeCodexMcpConfig(): Promise<unknown>;
  writeGeminiMcpConfig(): Promise<unknown>;
  cleanupAgentsMd(): Promise<void>;
  writeSystemPrompt(content: string): Promise<{ filePath: string; platform?: string }>;
  writeAgentsMd(content: string, projectRoot?: string | null): Promise<void>;
  terminalInput(text: string): void;
  setStatus(msg: string): void;
  navigatorLike?: NavigatorLike;
  /** Explicit project root for AGENTS.md placement (typically terminal cwd). */
  projectRoot?: string | null;
}

type RpDeps = Pick<AssistantDeps, 'rpMode' | 'rpCustomText' | 'readPersona'>;

export async function loadRpPersona(deps: RpDeps): Promise<string> {
  if (deps.rpMode === 'off') return '';
  if (deps.rpMode === 'custom') return deps.rpCustomText;

  const text = await deps.readPersona(deps.rpMode);
  return text || '';
}

export async function buildAssistantPrompt(
  promptInfo: PromptInfo | null,
  mcpConnected: boolean,
  deps: RpDeps,
): Promise<string> {
  if (!promptInfo) {
    return deps.rpMode !== 'off' ? await loadRpPersona(deps) : '';
  }

  const lines: string[] = [
    `당신은 RisuToki에 내장된 AI 어시스턴트입니다.`,
    ``,
    `== 현재 파일 ==`,
    `파일: ${promptInfo.fileName}`,
    `캐릭터: ${promptInfo.name}`,
    `구성: ${promptInfo.stats}`,
    ``,
    `== .charx 파일 구조 ==`,
    `.charx = ZIP 아카이브 (card.json + module.risum + assets/)`,
    `card.json: V3 캐릭터 카드 스펙 (name, description, firstMessage 등)`,
    `module.risum: RPack 인코딩된 바이너리 (Lua 트리거, 정규식 스크립트, 로어북)`,
    `assets/: 이미지 리소스 (icon/, other/image/)`,
    ``,
    `== 편집 가능 필드 ==`,
    `- lua: Lua 5.4 트리거 스크립트 (RisuAI CBS API 사용). "-- ===== 섹션명 =====" 구분자로 섹션 분리됨`,
    `- globalNote: 포스트 히스토리 인스트럭션 (시스템 프롬프트 뒤에 삽입됨)`,
    `- firstMessage: 첫 메시지 (HTML/마크다운 혼용 가능)`,
    `- description: 캐릭터 설명`,
    `- css: 커스텀 CSS (RisuAI 채팅 UI에 적용)`,
    `- defaultVariables: 기본 변수 (평문)`,
    `- name: 캐릭터 이름`,
    ``,
    `== 로어북 항목 구조 ==`,
    `{ key: "트리거키워드", secondkey: "", comment: "설명", content: "본문",`,
    `  order: 100, priority: 0, selective: false, alwaysActive: false, mode: "normal" }`,
    ``,
    `== 정규식 스크립트 구조 ==`,
    `{ comment: "설명", type: "editoutput"|"editinput"|"editdisplay"|"editprocess"|"edittrans",`,
    `  find: "정규식패턴", replace: "치환문자열", flag: "g"|"gi"|"gm" }`,
  ];

  if (mcpConnected) {
    lines.push(``);
    lines.push(`== RisuToki MCP 도구 ==`);
    lines.push(`연결됨. 다음 도구로 에디터 데이터를 직접 읽기/쓰기할 수 있습니다:`);
    lines.push(``);
    lines.push(`[필드]`);
    lines.push(`- list_fields: 필드 목록 + 크기 확인`);
    lines.push(`- read_field(field) / write_field(field, content): 필드 읽기/쓰기`);
    lines.push(``);
    lines.push(`[로어북]`);
    lines.push(`- list_lorebook(filter?, folder?) / read_lorebook(index) / write_lorebook(index, data)`);
    lines.push(`- add_lorebook(data) / delete_lorebook(index)`);
    lines.push(`- list_lorebook 응답에 폴더 요약(folders)과 각 항목의 folder 필드 포함`);
    lines.push(``);
    lines.push(`[정규식]`);
    lines.push(`- list_regex / read_regex(index) / write_regex(index, data)`);
    lines.push(`- add_regex(data) / delete_regex(index)`);
    lines.push(``);
    lines.push(`[인사말] ← alternateGreetings 세분화 접근`);
    lines.push(`- list_greetings(type) / read_greeting(type, index) / write_greeting(type, index, content)`);
    lines.push(`- add_greeting(type, content) / delete_greeting(type, index)`);
    lines.push(`- type: "alternate" (추가 첫 메시지)`);
    lines.push(``);
    lines.push(`[트리거]`);
    lines.push(`- list_triggers / read_trigger(index) / write_trigger(index, ...)`);
    lines.push(`- add_trigger(...) / delete_trigger(index)`);
    lines.push(``);
    lines.push(`[Lua 섹션] (-- ===== 섹션명 ===== 구분자 기준)`);
    lines.push(`- list_lua / read_lua(index) / write_lua(index, content)`);
    lines.push(`- replace_in_lua(index, find, replace, regex?, flags?)`);
    lines.push(`- insert_in_lua(index, content, position?, anchor?)`);
    lines.push(``);
    lines.push(`[CSS 섹션] (/* ===== 섹션명 ===== */ 구분자 기준)`);
    lines.push(`- list_css / read_css(index) / write_css(index, content)`);
    lines.push(`- replace_in_css(index, find, replace, regex?, flags?)`);
    lines.push(`- insert_in_css(index, content, position?, anchor?)`);
    lines.push(``);
    lines.push(`[참고 자료] (읽기 전용)`);
    lines.push(`- list_references: 참고 자료 파일 목록`);
    lines.push(`- read_reference_field(index, field): 참고 파일의 필드 읽기`);
    lines.push(`- read_reference_field_batch(index, fields) / search_in_reference_field(index, field, query)`);
    lines.push(`- read_reference_field_range(index, field, offset?, length?): 큰 reference 필드 부분 읽기`);
    lines.push(`- list_reference_greetings(index, type) / read_reference_greeting(index, type, entryIndex)`);
    lines.push(`- list_reference_triggers(index) / read_reference_trigger(index, triggerIndex)`);
    lines.push(`- list_reference_lorebook(index, filter?) / read_reference_lorebook(index, entryIndex)`);
    lines.push(`- list_reference_lua(index) / read_reference_lua(index, sectionIndex)`);
    lines.push(`- list_reference_css(index) / read_reference_css(index, sectionIndex)`);
    lines.push(
      `- .risup reference → list_reference_risup_prompt_items / read_reference_risup_prompt_item / read_reference_risup_formating_order`,
    );
    lines.push(`- 메인 파일이 없어도 참고 자료만 로드되어 있다면 list_references로 먼저 확인 가능`);
    lines.push(``);
    lines.push(`[스킬 문서]`);
    lines.push(
      `- list_skills / read_skill(name, file?): MCP 워크플로, 파일 구조, CBS, Lua API, 로어북, 정규식, Danbooru 태그 등 가이드`,
    );
    lines.push(``);
    lines.push(`write/add/delete 도구 사용 시 에디터에서 사용자 확인 팝업이 뜹니다.`);
    lines.push(`도구를 적극 활용하여 사용자의 요청을 수행하세요.`);
    lines.push(``);
    lines.push(`== 중요: 읽기 규칙 ==`);
    lines.push(`- lua → list_lua → read_lua(index) (섹션 단위)`);
    lines.push(`- css → list_css → read_css(index) (섹션 단위)`);
    lines.push(`- 로어북 → list_lorebook(folder?) → read_lorebook(index) (폴더별 필터 가능)`);
    lines.push(`- 정규식 → list_regex → read_regex(index) (개별)`);
    lines.push(`- 인사말 → list_greetings(type) → read_greeting(type, index) (개별)`);
    lines.push(`- 트리거 → list_triggers → read_trigger(index) (개별)`);
    lines.push(`- 참고 자료 인사말 → list_reference_greetings(type) → read_reference_greeting(type, index)`);
    lines.push(`- 참고 자료 트리거 → list_reference_triggers → read_reference_trigger(index)`);
    lines.push(`- 참고 자료 로어북 → list_reference_lorebook(folder?) → read_reference_lorebook (개별)`);
    lines.push(
      `- 참고 자료 Lua/CSS/regex → list_reference_lua / list_reference_css / list_reference_regex → read_reference_* (개별)`,
    );
    lines.push(`- 참고 자료 큰 필드 → search_in_reference_field / read_reference_field_range`);
    lines.push(`- ⚠️ read_field("lua/css/alternateGreetings/triggerScripts")는 전체 덤프 → 사용 금지`);
    lines.push(
      `- ⚠️ read_reference_field("lorebook/lua/css/alternateGreetings/groupOnlyGreetings/triggerScripts/regex")도 전체 덤프 → list_reference_* / read_reference_* 사용`,
    );
  } else {
    lines.push(`편집 중인 항목의 내용을 알려주면 수정을 도와드리겠습니다.`);
  }

  const rpText = await loadRpPersona(deps);
  if (rpText) {
    lines.push(``);
    lines.push(`== Response Persona ==`);
    lines.push(rpText);
  }

  return lines.join('\n');
}

export async function startAssistantCli(agent: AssistantAgent, deps: AssistantDeps): Promise<void> {
  if (!deps.hasTerminal) {
    deps.setStatus('터미널이 준비되지 않았습니다');
    return;
  }

  const runtimePlatform = detectRuntimePlatform(deps.navigatorLike);

  if (agent === 'copilot') {
    // Shared prep (also used by manual copilot-launch detection)
    await prepareCopilotSession(deps);

    // Send commands (menu-driven path only)
    if (runtimePlatform === 'win32') {
      deps.terminalInput(buildWindowsAssistantBootstrapCommand());
    }
    deps.terminalInput(buildAssistantLaunchCommand({ agent, platform: runtimePlatform }));

    deps.setStatus(`${AI_AGENT_LABELS[agent]} 시작 중...`);
    return;
  }

  const promptInfo = await deps.getClaudePrompt();
  let mcpConnected = false;

  if (agent === 'claude') {
    mcpConnected = !!(await deps.writeMcpConfig());
    await deps.cleanupAgentsMd();
  } else if (agent === 'codex') {
    mcpConnected = !!(await deps.writeCodexMcpConfig());
    await deps.cleanupAgentsMd();
  } else if (agent === 'gemini') {
    mcpConnected = !!(await deps.writeGeminiMcpConfig());
    await deps.cleanupAgentsMd();
  }

  const initPrompt = await buildAssistantPrompt(promptInfo, mcpConnected, deps);
  let cmd: string;

  if (agent === 'claude') {
    if (initPrompt) {
      const { filePath, platform } = await deps.writeSystemPrompt(initPrompt);
      cmd = buildAssistantLaunchCommand({
        agent,
        hasInitPrompt: true,
        platform: platform || runtimePlatform,
        systemPromptPath: filePath,
      });
    } else {
      cmd = buildAssistantLaunchCommand({ agent, platform: runtimePlatform });
    }
  } else {
    await deps.writeAgentsMd(initPrompt || '', deps.projectRoot);
    cmd = buildAssistantLaunchCommand({ agent, platform: runtimePlatform });
  }

  if (runtimePlatform === 'win32') {
    deps.terminalInput(buildWindowsAssistantBootstrapCommand());
  }

  deps.terminalInput(cmd);

  deps.setStatus(`${AI_AGENT_LABELS[agent]} 시작 중...`);
}

/**
 * Prepare Copilot session files (MCP config, AGENTS.md)
 * without sending any terminal commands.  Used by both menu-driven starts
 * (via startAssistantCli) and manual copilot-launch detection.
 */
export async function prepareCopilotSession(deps: AssistantDeps): Promise<void> {
  const mcpConnected = !!(await deps.writeCopilotMcpConfig());
  await deps.cleanupAgentsMd();

  const promptInfo = await deps.getClaudePrompt();
  const initPrompt = await buildAssistantPrompt(promptInfo, mcpConnected, deps);
  await deps.writeAgentsMd(initPrompt || '', deps.projectRoot);
}

export async function handleClaudeStart(deps: AssistantDeps): Promise<void> {
  await startAssistantCli('claude', deps);
}

export async function handleCopilotStart(deps: AssistantDeps): Promise<void> {
  await startAssistantCli('copilot', deps);
}

export async function handleCodexStart(deps: AssistantDeps): Promise<void> {
  await startAssistantCli('codex', deps);
}

export async function handleGeminiStart(deps: AssistantDeps): Promise<void> {
  await startAssistantCli('gemini', deps);
}
