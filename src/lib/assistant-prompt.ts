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
  writeAgentsMd(content: string): Promise<void>;
  terminalInput(text: string): void;
  setStatus(msg: string): void;
  navigatorLike?: NavigatorLike;
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
    `card.json: V3 캐릭터 카드 스펙 (name, description, firstMessage, personality 등)`,
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
    `{ comment: "설명", type: "editoutput"|"editinput"|"editdisplay",`,
    `  find: "정규식패턴", replace: "치환문자열", flag: "g"|"gi"|"gm" }`,
  ];

  if (mcpConnected) {
    lines.push(``);
    lines.push(`== RisuToki MCP 도구 ==`);
    lines.push(`연결됨. 다음 도구로 에디터 데이터를 직접 읽기/쓰기할 수 있습니다:`);
    lines.push(`- list_fields: 필드 목록 + 크기 확인`);
    lines.push(`- read_field(field) / write_field(field, content): 필드 읽기/쓰기`);
    lines.push(`- list_lorebook / read_lorebook(index) / write_lorebook(index, data): 로어북 관리`);
    lines.push(`- add_lorebook(data) / delete_lorebook(index): 로어북 추가/삭제`);
    lines.push(`- list_regex / read_regex(index) / write_regex(index, data): 정규식 관리`);
    lines.push(`- add_regex(data) / delete_regex(index): 정규식 추가/삭제`);
    lines.push(
      `- list_lua / read_lua(index) / write_lua(index, content): Lua 섹션별 읽기/쓰기 (-- ===== 섹션명 ===== 구분자 기준)`,
    );
    lines.push(`- replace_in_lua(index, find, replace, regex?, flags?): Lua 섹션 내 문자열 치환 (서버에서 직접 처리)`);
    lines.push(`- insert_in_lua(index, content, position?, anchor?): Lua 섹션에 코드 삽입 (end/start/after/before)`);
    lines.push(
      `- list_css / read_css(index) / write_css(index, content): CSS 섹션별 읽기/쓰기 (/* ===== 섹션명 ===== */ 구분자 기준)`,
    );
    lines.push(`- replace_in_css(index, find, replace, regex?, flags?): CSS 섹션 내 문자열 치환 (서버에서 직접 처리)`);
    lines.push(`- insert_in_css(index, content, position?, anchor?): CSS 섹션에 코드 삽입 (end/start/after/before)`);
    lines.push(`- list_references: 로드된 참고 자료 파일 목록 (읽기 전용)`);
    lines.push(`- read_reference_field(index, field): 참고 파일의 필드 읽기 (읽기 전용)`);
    lines.push(`write/add/delete 도구 사용 시 에디터에서 사용자 확인 팝업이 뜹니다.`);
    lines.push(`도구를 적극 활용하여 사용자의 요청을 수행하세요.`);
    lines.push(``);
    lines.push(`== 중요: 읽기 규칙 ==`);
    lines.push(`- lua, css 필드는 반드시 섹션 단위로 읽으세요: list_lua → read_lua(index)`);
    lines.push(`- read_field("lua")나 read_field("css")는 전체를 한번에 반환하므로 사용하지 마세요`);
    lines.push(`- 로어북도 list_lorebook → read_lorebook(index) 순서로 개별 읽기`);
    lines.push(`- 정규식도 list_regex → read_regex(index) 순서로 개별 읽기`);
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

  const promptInfo = await deps.getClaudePrompt();
  const runtimePlatform = detectRuntimePlatform(deps.navigatorLike);
  let mcpConnected = false;

  if (agent === 'claude') {
    mcpConnected = !!(await deps.writeMcpConfig());
    await deps.cleanupAgentsMd();
  } else if (agent === 'copilot') {
    mcpConnected = !!(await deps.writeCopilotMcpConfig());
  } else if (agent === 'codex') {
    mcpConnected = !!(await deps.writeCodexMcpConfig());
  } else if (agent === 'gemini') {
    mcpConnected = !!(await deps.writeGeminiMcpConfig());
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
    await deps.writeAgentsMd(initPrompt || '');
    cmd = buildAssistantLaunchCommand({ agent, platform: runtimePlatform });
  }

  if (runtimePlatform === 'win32') {
    deps.terminalInput(buildWindowsAssistantBootstrapCommand());
  }

  deps.terminalInput(cmd);
  deps.setStatus(`${AI_AGENT_LABELS[agent]} 시작 중...`);
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
