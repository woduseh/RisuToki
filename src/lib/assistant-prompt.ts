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
  writeCodexMcpConfig(projectRoot?: string | null): Promise<unknown>;
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
    lines.push(`== RisuToki MCP 도구 (facade-first 프로필) ==`);
    lines.push(`연결됨. 기본 프로필은 facade-first이며 아래 13개 도구만 등록되어 있습니다.`);
    lines.push(`정확한 파라미터 스키마는 각 도구의 tools/list 설명을 따르세요.`);
    lines.push(``);
    lines.push(`[세션/문서 파악]`);
    lines.push(`- list_tool_profiles: 현재 프로필, 등록/숨김 도구 수, 런타임 상태 확인`);
    lines.push(`- inspect_document(target): 세션 상태, 필드 인벤토리, 구조 요약`);
    lines.push(`  - target.kind: "session" | "active" | "external" (file_path) | "reference" | "guidance"`);
    lines.push(``);
    lines.push(`[읽기/검색] (기본 24KB 바운디드 응답)`);
    lines.push(`- read_content(target, selector): 필드/구조 항목 단위 읽기`);
    lines.push(`  - selector.family: "lorebook" | "regex" | "greeting" | "trigger" | "lua" | "css" | "risup-prompt"`);
    lines.push(`  - 목록 응답이 제공하는 안정 셀렉터(id / identity / hash)를 인덱스보다 우선 사용`);
    lines.push(`- search_document(target, query, selector?): 텍스트 위치 탐색. 큰 필드는 읽기 전에 먼저 검색`);
    lines.push(``);
    lines.push(`[분석/검증] (읽기 전용)`);
    lines.push(`- analyze_content: 필드 통계, 토큰 수, 로어북/정규식 시뮬레이션, CBS/Danbooru 분석, diff`);
    lines.push(`- validate_content: 로어북/정규식/CBS/Lua 문법/구조의 pass-fail 진단`);
    lines.push(``);
    lines.push(`[편집] (preview 토큰 필수 2단계)`);
    lines.push(`- preview_edit(target, operations[]) → preview_token + operation_digest 반환`);
    lines.push(`- apply_edit(preview_token, operation_digest, target, guard_values?)`);
    lines.push(`  - 토큰은 1회용이며 만료/서버 재시작 시 소멸 → preview_edit부터 다시 실행`);
    lines.push(`  - 409(stale guard) 응답 시 안내된 도구로 최신 값을 다시 읽고 재시도`);
    lines.push(``);
    lines.push(`[항목/에셋/파일 관리] (mode: "read" → "preview" → "apply")`);
    lines.push(
      `- manage_items: .risup 프롬프트 add/reorder/import/스니펫, 로어북/정규식/인사말/트리거/Lua/CSS add/reorder`,
    );
    lines.push(`- manage_assets: .charx/.risum 에셋 list/read/add/delete/rename/WebP 압축`);
    lines.push(
      `- manage_file: 파일 열기/저장, 스냅샷/복원, 필드 export, 로어북 import/export, 프로젝트 폴더 추출/재조립`,
    );
    lines.push(``);
    lines.push(`[스킬 문서]`);
    lines.push(
      `- list_skills / read_skill(name, file?): MCP 워크플로, 파일 구조, CBS, Lua API, 로어북, 정규식, Danbooru 태그 등 가이드`,
    );
    lines.push(``);
    lines.push(`뮤테이션 apply 시 에디터에서 사용자 확인 팝업이 뜹니다.`);
    lines.push(`도구를 적극 활용하여 사용자의 요청을 수행하세요.`);
    lines.push(
      `granular 도구가 필요하면 MCP 서버를 --tool-profile advanced-full (또는 환경변수 RISUTOKI_MCP_TOOL_PROFILE) 로 재시작해야 합니다. 현재 프로필에는 등록되어 있지 않습니다.`,
    );
    lines.push(``);
    lines.push(`== 중요: 작업 순서 ==`);
    lines.push(`- discover(inspect_document) → read/search → validate/preview → apply → 재읽기 검증 순서를 따르세요`);
    lines.push(`- ⚠️ 큰 필드 전체 덤프 금지 → search_document로 위치를 좁힌 뒤 read_content로 범위/항목 단위 읽기`);
    lines.push(`- 로어북/정규식/인사말/트리거/Lua/CSS/.risup 프롬프트는 반드시 selector.family로 항목 단위 접근`);
    lines.push(`- 형제 항목 여러 개 수정 시 단건 반복 대신 배치 operations 사용`);
    lines.push(
      `- 참고 자료(읽기 전용)는 target.kind="reference"로 접근. 메인 파일이 없어도 inspect_document(target.kind="reference")로 먼저 확인 가능`,
    );
    lines.push(`- 응답의 summary / next_actions / artifacts.byte_size를 후속 도구 선택에 활용`);
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
    mcpConnected = !!(await deps.writeCodexMcpConfig(deps.projectRoot));
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
